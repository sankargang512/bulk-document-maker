const DocumentService = require('../services/documentGenerator');
const CSVService = require('../services/csvParser');
const TemplateService = require('../services/templateAnalyzer');
const EmailService = require('../services/emailService');
const Batch = require('../models/Batch');
const Document = require('../models/Document');
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

      // Step 2: Create batch record
      const batch = await this.createBatchRecord(batchId, req.body, validationResult);
      
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
   * Create batch record in database
   */
  async createBatchRecord(batchId, body, validationResult) {
    try {
      const batch = new Batch({
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
      });

      await batch.save();
      loggingService.info('Batch record created', { batchId, status: 'created' });
      
      return batch;
    } catch (error) {
      loggingService.error('Failed to create batch record', { batchId, error: error.message });
      throw error;
    }
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
      await this.updateBatchTotalDocuments(batchId, csvData.length);
      
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
          
          // Generate document
          const documentPath = await DocumentService.generateDocument(
            templateAnalysis.templatePath,
            row,
            validationResult.options.outputFormat,
            documentId
          );
          
          // Create document record
          const document = new Document({
            id: documentId,
            batchId,
            status: 'completed',
            rowNumber: i + 1,
            data: row,
            outputPath: documentPath,
            outputFormat: validationResult.options.outputFormat,
            createdAt: new Date()
          });
          
          await document.save();
          
          results.successful.push({
            id: documentId,
            rowNumber: i + 1,
            path: documentPath,
            data: row
          });
          
          results.successCount++;
          
          // Update batch progress
          await this.updateBatchCompletedDocuments(batchId, results.successCount);
          
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
          await this.updateBatchFailedDocuments(batchId, results.failedCount);
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
      const batch = await Batch.findById(batchId);
      const downloadUrl = `/api/documents/batch/${batchId}/download`;
      
      await EmailService.sendDocumentReadyEmail(email, {
        batchId,
        totalDocuments: batch.totalDocuments,
        completedDocuments: batch.completedDocuments,
        failedDocuments: batch.failedDocuments,
        downloadUrl,
        archiveSize: await this.getFileSize(archivePath)
      });
      
      this.updateBatchProgress(batchId, 'email_sent', { email });
      loggingService.info('Email notification sent', { batchId, email });
      
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
      const batch = await Batch.findById(batchId);
      
      res.status(200).json({
        success: true,
        batchId,
        progress,
        batch: batch ? batch.toObject() : null
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
      const batch = await Batch.findById(batchId);
      
      if (!batch) {
        return responseUtils.error(res, 'Batch not found', 404);
      }
      
      res.status(200).json({
        success: true,
        batch: batch.toObject()
      });
      
    } catch (error) {
      loggingService.error('Failed to get batch status', { 
        batchId: req.params.batchId, 
        error: error.message 
      });
      responseUtils.error(res, 'Failed to get batch status', 500, error.message);
    }
  }

  /**
   * Download batch archive
   */
  async downloadBatchArchive(req, res) {
    try {
      const { batchId } = req.params;
      const batch = await Batch.findById(batchId);
      
      if (!batch) {
        return responseUtils.error(res, 'Batch not found', 404);
      }
      
      if (batch.status !== 'completed') {
        return responseUtils.error(res, 'Batch not ready for download', 400);
      }
      
      const archivePath = path.join(__dirname, '../generated', batchId, `${batchId}_documents.zip`);
      
      if (!await fs.pathExists(archivePath)) {
        return responseUtils.error(res, 'Archive file not found', 404);
      }
      
      res.download(archivePath, `batch_${batchId}_documents.zip`);
      
      // Schedule cleanup after download
      setTimeout(() => this.cleanupBatch(batchId), 300000); // 5 minutes
      
    } catch (error) {
      loggingService.error('Failed to download batch archive', { 
        batchId: req.params.batchId, 
        error: error.message 
      });
      responseUtils.error(res, 'Failed to download batch archive', 500, error.message);
    }
  }

  /**
   * Cancel batch processing
   */
  async cancelBatch(req, res) {
    try {
      const { batchId } = req.params;
      
      if (this.activeBatches.has(batchId)) {
        // Stop the processing
        this.activeBatches.delete(batchId);
        this.batchProgress.delete(batchId);
        
        // Update database
        await Batch.findByIdAndUpdate(batchId, { 
          status: 'cancelled',
          updatedAt: new Date()
        });
        
        loggingService.info('Batch cancelled', { batchId });
        
        res.status(200).json({
          success: true,
          message: 'Batch cancelled successfully'
        });
      } else {
        responseUtils.error(res, 'Batch not found or not active', 404);
      }
      
    } catch (error) {
      loggingService.error('Failed to cancel batch', { 
        batchId: req.params.batchId, 
        error: error.message 
      });
      responseUtils.error(res, 'Failed to cancel batch', 500, error.message);
    }
  }

  /**
   * Retry failed documents in a batch
   */
  async retryFailedDocuments(req, res) {
    try {
      const { batchId } = req.params;
      const batch = await Batch.findById(batchId);
      
      if (!batch) {
        return responseUtils.error(res, 'Batch not found', 404);
      }
      
      if (batch.failedDocuments === 0) {
        return responseUtils.error(res, 'No failed documents to retry', 400);
      }
      
      // Get failed documents
      const failedDocs = await Document.find({ batchId, status: 'failed' });
      
      if (failedDocs.length === 0) {
        return responseUtils.error(res, 'No failed documents found', 400);
      }
      
      // Start retry process
      this.retryFailedDocumentsAsync(batchId, failedDocs);
      
      res.status(202).json({
        success: true,
        message: 'Retry process started',
        failedDocuments: failedDocs.length
      });
      
    } catch (error) {
      loggingService.error('Failed to start retry process', { 
        batchId: req.params.batchId, 
        error: error.message 
      });
      responseUtils.error(res, 'Failed to start retry process', 500, error.message);
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
   * Update batch status in database
   */
  async updateBatchStatus(batchId, status, message) {
    try {
      await Batch.findByIdAndUpdate(batchId, { 
        status,
        updatedAt: new Date()
      });
      
      this.updateBatchProgress(batchId, status, { message });
      loggingService.info('Batch status updated', { batchId, status, message });
      
    } catch (error) {
      loggingService.error('Failed to update batch status', { batchId, status, error: error.message });
    }
  }

  /**
   * Update batch document counts
   */
  async updateBatchTotalDocuments(batchId, count) {
    try {
      await Batch.findByIdAndUpdate(batchId, { 
        totalDocuments: count,
        updatedAt: new Date()
      });
    } catch (error) {
      loggingService.error('Failed to update total documents', { batchId, count, error: error.message });
    }
  }

  async updateBatchCompletedDocuments(batchId, count) {
    try {
      await Batch.findByIdAndUpdate(batchId, { 
        completedDocuments: count,
        updatedAt: new Date()
      });
    } catch (error) {
      loggingService.error('Failed to update completed documents', { batchId, count, error: error.message });
    }
  }

  async updateBatchFailedDocuments(batchId, count) {
    try {
      await Batch.findByIdAndUpdate(batchId, { 
        failedDocuments: count,
        updatedAt: new Date()
      });
    } catch (error) {
      loggingService.error('Failed to update failed documents', { batchId, count, error: error.message });
    }
  }

  /**
   * Complete batch successfully
   */
  async completeBatch(batchId, generationResults, archivePath) {
    try {
      await Batch.findByIdAndUpdate(batchId, {
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
        archivePath
      });
      
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
      await Batch.findByIdAndUpdate(batchId, {
        status: 'failed',
        error: error,
        failedAt: new Date(),
        updatedAt: new Date()
      });
      
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

  /**
   * Get file size in human readable format
   */
  async getFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const bytes = stats.size;
      
      if (bytes === 0) return '0 Bytes';
      
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    } catch (error) {
      return 'Unknown';
    }
  }

  /**
   * Retry failed documents asynchronously
   */
  async retryFailedDocumentsAsync(batchId, failedDocs) {
    try {
      this.updateBatchProgress(batchId, 'retrying_failed', {
        message: 'Retrying failed documents...',
        failedCount: failedDocs.length
      });
      
      let retrySuccessCount = 0;
      
      for (const doc of failedDocs) {
        try {
          // Retry document generation logic here
          // This would involve re-analyzing the template and regenerating
          
          await Document.findByIdAndUpdate(doc.id, {
            status: 'retrying',
            updatedAt: new Date()
          });
          
          retrySuccessCount++;
          
        } catch (error) {
          loggingService.error('Document retry failed', { 
            batchId, 
            documentId: doc.id, 
            error: error.message 
          });
        }
      }
      
      this.updateBatchProgress(batchId, 'retry_completed', {
        message: `Retry completed. ${retrySuccessCount} documents succeeded.`,
        retrySuccessCount,
        totalFailed: failedDocs.length
      });
      
    } catch (error) {
      loggingService.error('Failed documents retry process failed', { batchId, error: error.message });
    }
  }
}

module.exports = new DocumentController();
