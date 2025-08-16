const DocumentService = require('../services/documentGenerator');
const CSVService = require('../services/csvParser');
const TemplateService = require('../services/templateAnalyzer');
const EmailService = require('../services/emailService');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs-extra');
const archiver = require('archiver');
const responseUtils = require('../utils/responseUtils');
const loggingService = require('../services/loggingService');

class DocumentController {
  constructor() {
    this.activeBatches = new Map(); // Track active batches in memory
    this.batchProgress = new Map(); // Track progress for each batch
  }

  /**
   * Main document generation workflow
   * Handles the complete process from upload to delivery
   */
  async generateDocuments(req, res) {
    const batchId = uuidv4();
    const requestId = req.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      loggingService.info('Starting document generation workflow', {
        requestId,
        batchId,
        files: req.files ? Object.keys(req.files) : 'none',
        body: req.body
      });

      // Step 1: File Upload & Validation
      const validationResult = await this.validateUpload(req, batchId);
      if (!validationResult.success) {
        return responseUtils.error(res, validationResult.error, 400);
      }

      // Step 2: Create batch record in memory
      const batch = this.createBatchRecord(batchId, req.body, validationResult);
      
      // Step 3: Start async processing
      this.processBatchAsync(batchId, req, validationResult, requestId);
      
      // Step 4: Return immediate response with batch ID
      res.status(202).json({
        success: true,
        message: 'Document generation started',
        batchId,
        status: 'processing',
        estimatedTime: this.estimateProcessingTime(validationResult),
        progressUrl: `/api/documents/batch/${batchId}/progress`,
        statusUrl: `/api/documents/batch/${batchId}/status`
      });

    } catch (error) {
      loggingService.error('Document generation workflow failed', {
        requestId,
        batchId,
        error: error.message,
        stack: error.stack
      });
      
      responseUtils.error(res, 'Failed to start document generation', 500, error.message);
    }
  }

  /**
   * Validate uploaded files and request data
   */
  async validateUpload(req, batchId) {
    try {
      // Check required files
      if (!req.files || !req.files.template || !req.files.csv) {
        return { success: false, error: 'Template and CSV files are required' };
      }

      const template = req.files.template[0];
      const csv = req.files.csv[0];

      // Validate file types
      const allowedTemplateTypes = ['.docx', '.doc', '.pdf'];
      const allowedCSVTypes = ['.csv'];
      
      const templateExt = path.extname(template.originalname).toLowerCase();
      const csvExt = path.extname(csv.originalname).toLowerCase();
      
      if (!allowedTemplateTypes.includes(templateExt)) {
        return { success: false, error: `Invalid template format. Allowed: ${allowedTemplateTypes.join(', ')}` };
      }
      
      if (!allowedCSVTypes.includes(csvExt)) {
        return { success: false, error: 'CSV file is required for data' };
      }

      // Validate file sizes
      const maxTemplateSize = 10 * 1024 * 1024; // 10MB
      const maxCSVSize = 5 * 1024 * 1024; // 5MB
      
      if (template.size > maxTemplateSize) {
        return { success: false, error: 'Template file too large. Maximum size: 10MB' };
      }
      
      if (csv.size > maxCSVSize) {
        return { success: false, error: 'CSV file too large. Maximum size: 5MB' };
      }

      // Validate request body
      const { outputFormat, email, customFields } = req.body;
      if (!outputFormat || !['pdf', 'docx', 'both'].includes(outputFormat)) {
        return { success: false, error: 'Valid output format required: pdf, docx, or both' };
      }

      return {
        success: true,
        template: {
          path: template.path,
          originalname: template.originalname,
          size: template.size,
          mimetype: template.mimetype
        },
        csv: {
          path: csv.path,
          originalname: csv.originalname,
          size: csv.size,
          mimetype: csv.mimetype
        },
        options: {
          outputFormat,
          email: email || null,
          customFields: customFields ? JSON.parse(customFields) : {}
        }
      };

    } catch (error) {
      loggingService.error('Upload validation failed', { batchId, error: error.message });
      return { success: false, error: 'Upload validation failed: ' + error.message };
    }
  }

  /**
   * Create batch record in memory
   */
  createBatchRecord(batchId, body, validationResult) {
    const batch = {
      id: batchId,
      status: 'created',
      totalDocuments: 0, // Will be updated after CSV parsing
      completedDocuments: 0,
      failedDocuments: 0,
      templateFile: validationResult.template.originalname,
      csvFile: validationResult.csv.originalname,
      outputFormat: validationResult.options.outputFormat,
      email: validationResult.options.email,
      customFields: validationResult.options.customFields,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.activeBatches.set(batchId, batch);
    loggingService.info('Batch record created', { batchId, status: 'created' });
    
    return batch;
  }

  /**
   * Process batch asynchronously
   */
  async processBatchAsync(batchId, req, validationResult, requestId) {
    try {
      // Initialize progress tracking
      this.initializeBatchProgress(batchId);
      
      // Step 1: CSV Parsing & Data Extraction
      await this.updateBatchStatus(batchId, 'parsing_csv', 'Parsing CSV data...');
      const csvData = await this.parseCSVData(batchId, validationResult.csv.path);
      
      // Update batch with document count
      this.updateBatchTotalDocuments(batchId, csvData.length);
      
      // Step 2: Template Analysis & Variable Matching
      await this.updateBatchStatus(batchId, 'analyzing_template', 'Analyzing template structure...');
      const templateAnalysis = await this.analyzeTemplate(batchId, validationResult.template.path);
      
      // Step 3: Data Validation
      await this.updateBatchStatus(batchId, 'validating_data', 'Validating data against template...');
      const validationResults = await this.validateDataAgainstTemplate(batchId, csvData, templateAnalysis);
      
      if (!validationResults.success) {
        await this.failBatch(batchId, validationResults.error);
        return;
      }

      // Step 4: Document Generation Loop
      await this.updateBatchStatus(batchId, 'generating_documents', 'Generating individual documents...');
      const generationResults = await this.generateIndividualDocuments(
        batchId, 
        csvData, 
        templateAnalysis, 
        validationResult
      );

      // Step 5: ZIP Archive Creation
      if (generationResults.successCount > 0) {
        await this.updateBatchStatus(batchId, 'creating_archive', 'Creating ZIP archive...');
        const archivePath = await this.createZIPArchive(batchId, generationResults.successfulDocuments);
        
        // Step 6: Email Notification
        if (validationResult.options.email) {
          await this.updateBatchStatus(batchId, 'sending_notification', 'Sending email notification...');
          await this.sendEmailNotification(batchId, archivePath, validationResult.options.email);
        }
        
        // Step 7: Final Status Update
        await this.updateBatchStatus(batchId, 'completed', 'Document generation completed successfully');
        await this.completeBatch(batchId, generationResults, archivePath);
        
      } else {
        await this.failBatch(batchId, 'No documents were generated successfully');
      }

      // Step 8: Cleanup
      await this.cleanupBatch(batchId, validationResult);

    } catch (error) {
      loggingService.error('Batch processing failed', {
        requestId,
        batchId,
        error: error.message,
        stack: error.stack
      });
      
      await this.failBatch(batchId, error.message);
    }
  }

  /**
   * Parse CSV data
   */
  async parseCSVData(batchId, csvPath) {
    try {
      const csvData = await CSVService.parseCSV(csvPath);
      
      this.updateBatchProgress(batchId, 'csv_parsed', {
        totalRows: csvData.length,
        columns: Object.keys(csvData[0] || {})
      });
      
      loggingService.info('CSV parsing completed', { batchId, rowCount: csvData.length });
      return csvData;
      
    } catch (error) {
      loggingService.error('CSV parsing failed', { batchId, error: error.message });
      throw error;
    }
  }

  /**
   * Analyze template structure
   */
  async analyzeTemplate(batchId, templatePath) {
    try {
      const fileType = path.extname(templatePath).substring(1);
      const analysis = await TemplateService.analyzeTemplate(templatePath, fileType);
      
      this.updateBatchProgress(batchId, 'template_analyzed', {
        placeholders: analysis.placeholders,
        complexity: analysis.complexity,
        wordCount: analysis.wordCount
      });
      
      loggingService.info('Template analysis completed', { batchId, placeholders: analysis.placeholders.count });
      return analysis;
      
    } catch (error) {
      loggingService.error('Template analysis failed', { batchId, error: error.message });
      throw error;
    }
  }

  /**
   * Validate data against template requirements
   */
  async validateDataAgainstTemplate(batchId, csvData, templateAnalysis) {
    try {
      const requiredFields = templateAnalysis.placeholders.all;
      const validationResults = [];
      
      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];
        const rowNumber = i + 1;
        const missingFields = [];
        
        for (const field of requiredFields) {
          if (!row[field] && row[field] !== 0) {
            missingFields.push(field);
          }
        }
        
        validationResults.push({
          rowNumber,
          isValid: missingFields.length === 0,
          missingFields,
          data: row
        });
      }
      
      const validRows = validationResults.filter(r => r.isValid);
      const invalidRows = validationResults.filter(r => !r.isValid);
      
      this.updateBatchProgress(batchId, 'data_validated', {
        totalRows: csvData.length,
        validRows: validRows.length,
        invalidRows: invalidRows.length,
        validationResults
      });
      
      if (invalidRows.length > 0) {
        loggingService.warn('Data validation found issues', { 
          batchId, 
          invalidRows: invalidRows.length,
          totalRows: csvData.length 
        });
      }
      
      return {
        success: validRows.length > 0,
        validRows,
        invalidRows,
        totalRows: csvData.length
      };
      
    } catch (error) {
      loggingService.error('Data validation failed', { batchId, error: error.message });
      throw error;
    }
  }

  /**
   * Generate individual documents
   */
  async generateIndividualDocuments(batchId, csvData, templateAnalysis, validationResult) {
    try {
      const results = {
        successful: [],
        failed: [],
        successCount: 0,
        failedCount: 0
      };
      
      const totalDocuments = csvData.length;
      let completedCount = 0;
      
      for (let i = 0; i < csvData.length; i++) {
        try {
          const row = csvData[i];
          const documentId = uuidv4();
          
          // Update progress
          completedCount++;
          this.updateBatchProgress(batchId, 'document_generation', {
            current: completedCount,
            total: totalDocuments,
            percentage: Math.round((completedCount / totalDocuments) * 100),
            currentDocument: row
          });
          
          // Generate document (simulated for now)
          const documentPath = await this.simulateDocumentGeneration(
            templateAnalysis.templatePath || templateAnalysis.path,
            row,
            validationResult.options.outputFormat,
            documentId
          );
          
          results.successful.push({
            id: documentId,
            rowNumber: i + 1,
            path: documentPath,
            data: row
          });
          
          results.successCount++;
          
          // Update batch progress
          this.updateBatchCompletedDocuments(batchId, results.successCount);
          
        } catch (error) {
          loggingService.error('Document generation failed for row', { 
            batchId, 
            rowNumber: i + 1, 
            error: error.message 
          });
          
          results.failed.push({
            rowNumber: i + 1,
            error: error.message,
            data: csvData[i]
          });
          
          results.failedCount++;
          
          // Update batch progress
          this.updateBatchFailedDocuments(batchId, results.failedCount);
        }
      }
      
      loggingService.info('Document generation completed', { 
        batchId, 
        successCount: results.successCount,
        failedCount: results.failedCount 
      });
      
      return results;
      
    } catch (error) {
      loggingService.error('Document generation process failed', { batchId, error: error.message });
      throw error;
    }
  }

  /**
   * Simulate document generation (placeholder for actual implementation)
   */
  async simulateDocumentGeneration(templatePath, data, outputFormat, documentId) {
    // This is a placeholder - in the real implementation, this would call DocumentService.generateDocument
    const outputDir = path.join(__dirname, '../temp', documentId);
    await fs.ensureDir(outputDir);
    
    const outputPath = path.join(outputDir, `document_${documentId}.${outputFormat === 'both' ? 'pdf' : outputFormat}`);
    
    // Create a dummy file for testing
    await fs.writeFile(outputPath, `Generated document for: ${JSON.stringify(data)}`);
    
    return outputPath;
  }

  /**
   * Create ZIP archive of generated documents
   */
  async createZIPArchive(batchId, documents) {
    try {
      const batchDir = path.join(__dirname, '../generated', batchId);
      const archivePath = path.join(batchDir, `${batchId}_documents.zip`);
      
      await fs.ensureDir(batchDir);
      
      const output = fs.createWriteStream(archivePath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      archive.pipe(output);
      
      for (const doc of documents) {
        const fileName = `document_${doc.rowNumber}_${Date.now()}.${doc.outputFormat || 'pdf'}`;
        archive.file(doc.path, { name: fileName });
      }
      
      await archive.finalize();
      
      this.updateBatchProgress(batchId, 'archive_created', {
        archivePath,
        documentCount: documents.length
      });
      
      loggingService.info('ZIP archive created', { batchId, archivePath, documentCount: documents.length });
      return archivePath;
      
    } catch (error) {
      loggingService.error('ZIP archive creation failed', { batchId, error: error.message });
      throw error;
    }
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(batchId, archivePath, email) {
    try {
      const batch = this.activeBatches.get(batchId);
      const downloadUrl = `/api/documents/batch/${batchId}/download`;
      
      // This would call EmailService.sendDocumentReadyEmail in the real implementation
      loggingService.info('Email notification would be sent', { 
        batchId, 
        email, 
        downloadUrl,
        totalDocuments: batch.totalDocuments 
      });
      
      this.updateBatchProgress(batchId, 'email_sent', { email });
      
    } catch (error) {
      loggingService.error('Email notification failed', { batchId, error: error.message });
      // Don't fail the entire batch for email issues
    }
  }

  /**
   * Get batch progress
   */
  async getBatchProgress(req, res) {
    try {
      const { batchId } = req.params;
      
      if (!this.batchProgress.has(batchId)) {
        return responseUtils.error(res, 'Batch not found or not active', 404);
      }
      
      const progress = this.batchProgress.get(batchId);
      const batch = this.activeBatches.get(batchId);
      
      res.status(200).json({
        success: true,
        batchId,
        progress,
        batch
      });
      
    } catch (error) {
      loggingService.error('Failed to get batch progress', { 
        batchId: req.params.batchId, 
        error: error.message 
      });
      responseUtils.error(res, 'Failed to get batch progress', 500, error.message);
    }
  }

  /**
   * Get batch status
   */
  async getBatchStatus(req, res) {
    try {
      const { batchId } = req.params;
      const batch = this.activeBatches.get(batchId);
      
      if (!batch) {
        return responseUtils.error(res, 'Batch not found', 404);
      }
      
      res.status(200).json({
        success: true,
        batch
      });
      
    } catch (error) {
      loggingService.error('Failed to get batch status', { 
        batchId: req.params.batchId, 
        error: error.message 
      });
      responseUtils.error(res, 'Failed to get batch status', 500, error.message);
    }
  }

  // Helper methods

  /**
   * Initialize batch progress tracking
   */
  initializeBatchProgress(batchId) {
    this.batchProgress.set(batchId, {
      status: 'initialized',
      step: 'starting',
      message: 'Initializing batch processing...',
      progress: 0,
      details: {},
      timestamp: new Date()
    });
  }

  /**
   * Update batch progress
   */
  updateBatchProgress(batchId, step, details = {}) {
    if (this.batchProgress.has(batchId)) {
      const progress = this.batchProgress.get(batchId);
      progress.step = step;
      progress.details = { ...progress.details, ...details };
      progress.timestamp = new Date();
      
      // Calculate overall progress percentage
      const stepProgress = {
        'initialized': 0,
        'parsing_csv': 10,
        'analyzing_template': 20,
        'validating_data': 30,
        'generating_documents': 40,
        'creating_archive': 80,
        'sending_notification': 90,
        'completed': 100
      };
      
      progress.progress = stepProgress[step] || progress.progress;
    }
  }

  /**
   * Update batch status
   */
  async updateBatchStatus(batchId, status, message) {
    try {
      const batch = this.activeBatches.get(batchId);
      if (batch) {
        batch.status = status;
        batch.updatedAt = new Date();
      }
      
      this.updateBatchProgress(batchId, status, { message });
      loggingService.info('Batch status updated', { batchId, status, message });
      
    } catch (error) {
      loggingService.error('Failed to update batch status', { batchId, status, error: error.message });
    }
  }

  /**
   * Update batch document counts
   */
  updateBatchTotalDocuments(batchId, count) {
    const batch = this.activeBatches.get(batchId);
    if (batch) {
      batch.totalDocuments = count;
      batch.updatedAt = new Date();
    }
  }

  updateBatchCompletedDocuments(batchId, count) {
    const batch = this.activeBatches.get(batchId);
    if (batch) {
      batch.completedDocuments = count;
      batch.updatedAt = new Date();
    }
  }

  updateBatchFailedDocuments(batchId, count) {
    const batch = this.activeBatches.get(batchId);
    if (batch) {
      batch.failedDocuments = count;
      batch.updatedAt = new Date();
    }
  }

  /**
   * Complete batch successfully
   */
  async completeBatch(batchId, generationResults, archivePath) {
    try {
      const batch = this.activeBatches.get(batchId);
      if (batch) {
        batch.status = 'completed';
        batch.completedAt = new Date();
        batch.updatedAt = new Date();
        batch.archivePath = archivePath;
      }
      
      this.updateBatchProgress(batchId, 'completed', {
        message: 'Document generation completed successfully',
        results: generationResults
      });
      
      loggingService.info('Batch completed successfully', { 
        batchId, 
        successCount: generationResults.successCount,
        failedCount: generationResults.failedCount 
      });
      
    } catch (error) {
      loggingService.error('Failed to complete batch', { batchId, error: error.message });
    }
  }

  /**
   * Fail batch with error
   */
  async failBatch(batchId, error) {
    try {
      const batch = this.activeBatches.get(batchId);
      if (batch) {
        batch.status = 'failed';
        batch.errorMessage = error;
        batch.failedAt = new Date();
        batch.updatedAt = new Date();
      }
      
      this.updateBatchProgress(batchId, 'failed', {
        message: `Batch failed: ${error}`,
        error
      });
      
      loggingService.error('Batch failed', { batchId, error });
      
    } catch (dbError) {
      loggingService.error('Failed to update batch failure status', { batchId, error: dbError.message });
    }
  }

  /**
   * Cleanup batch files
   */
  async cleanupBatch(batchId, validationResult) {
    try {
      // Clean up uploaded files
      if (validationResult.template.path) {
        await fs.remove(validationResult.template.path);
      }
      if (validationResult.csv.path) {
        await fs.remove(validationResult.csv.path);
      }
      
      // Clean up temporary files
      const tempDir = path.join(__dirname, '../temp', batchId);
      if (await fs.pathExists(tempDir)) {
        await fs.remove(tempDir);
      }
      
      // Remove from active tracking
      this.activeBatches.delete(batchId);
      this.batchProgress.delete(batchId);
      
      loggingService.info('Batch cleanup completed', { batchId });
      
    } catch (error) {
      loggingService.error('Batch cleanup failed', { batchId, error: error.message });
    }
  }

  /**
   * Estimate processing time
   */
  estimateProcessingTime(validationResult) {
    const csvSize = validationResult.csv.size;
    const estimatedRows = Math.ceil(csvSize / 100); // Rough estimate: 100 bytes per row
    const baseTimePerDocument = 2; // seconds
    
    const totalSeconds = estimatedRows * baseTimePerDocument;
    const minutes = Math.ceil(totalSeconds / 60);
    
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }

  // Test route
  async testRoute(req, res) {
    res.json({ message: 'Document generation routes working!' });
  }
}

module.exports = new DocumentController();
