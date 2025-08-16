const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const archiver = require('archiver');
const { 
  singleFileUpload, 
  multipleFileUpload, 
  validateFiles,
  cleanupFiles 
} = require('../middleware/upload');
const { 
  validateDocumentGenerate, 
  validateBatchGenerate,
  validateFiles: validateFilesMiddleware 
} = require('../middleware/validation-simple');
const { 
  asyncHandler, 
  NotFoundError, 
  ValidationError,
  FileProcessingError 
} = require('../middleware/errorHandler');
const CSVParserService = require('../services/csvParser');
const TemplateAnalyzerService = require('../services/templateAnalyzer');
const DocumentGeneratorService = require('../services/documentGenerator');
const EmailService = require('../services/emailService');
const logger = require('../services/loggingService');

// Initialize services
const csvParser = new CSVParserService();
const templateAnalyzer = new TemplateAnalyzerService({
  useAI: process.env.USE_AI === 'true',
  openAIConfig: process.env.OPENAI_API_KEY ? {
    apiKey: process.env.OPENAI_API_KEY
  } : null
});
const documentGenerator = new DocumentGeneratorService({
  apiKey: process.env.CRAFTMYPDF_API_KEY,
  apiUrl: process.env.CRAFTMYPDF_API_URL
});
const emailService = new EmailService({
  apiKey: process.env.SENDGRID_API_KEY,
  fromEmail: process.env.FROM_EMAIL,
  fromName: process.env.FROM_NAME
});

/**
 * POST /api/documents/generate
 * Generate documents from template and CSV data
 */
router.post('/generate',
  // Upload middleware for template and CSV files
  multipleFileUpload('batch', 'files', { maxFiles: 2 }),
  
  // Validate files
  validateFilesMiddleware({
    required: ['template', 'csv'],
    maxFiles: 2,
    allowedTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/csv'
    ]
  }),
  
  // Validate request body
  validateBatchGenerate,
  
  // Main handler
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
      logger.info('Document generation request started', {
        requestId: req.requestId,
        files: req.uploadedFiles.map(f => ({ name: f.originalname, size: f.size })),
        options: req.body
      });

      // Extract files
      const templateFile = req.uploadedFiles.find(f => 
        f.mimetype.includes('document') || f.mimetype.includes('pdf') || f.mimetype.includes('text')
      );
      const csvFile = req.uploadedFiles.find(f => 
        f.mimetype.includes('csv') || f.mimetype.includes('text')
      );

      if (!templateFile || !csvFile) {
        throw new ValidationError('Both template and CSV files are required');
      }

      // Parse CSV data
      logger.info('Parsing CSV file', { requestId: req.requestId, fileName: csvFile.originalname });
      const csvData = await csvParser.parseFile(csvFile.path, {
        encoding: 'utf8',
        delimiter: ',',
        hasHeader: true,
        skipEmptyRows: true,
        maxRows: parseInt(req.body.options?.batchSize) || 1000
      });

      logger.info('CSV parsing completed', {
        requestId: req.requestId,
        rows: csvData.totalRows,
        columns: csvData.headers.length
      });

      // Analyze template
      logger.info('Analyzing template', { requestId: req.requestId, fileName: templateFile.originalname });
      const templateAnalysis = await templateAnalyzer.analyzeTemplate(templateFile.path, {
        useAI: req.body.options?.useAI !== false,
        extractStructure: true,
        generateDescriptions: true
      });

      logger.info('Template analysis completed', {
        requestId: req.requestId,
        placeholders: templateAnalysis.placeholders.length,
        structure: templateAnalysis.structure ? 'extracted' : 'none'
      });

      // Validate data completeness
      const validationResult = validateDataCompleteness(csvData, templateAnalysis);
      if (!validationResult.isValid) {
        throw new ValidationError('Data validation failed', validationResult.errors.map(error => ({
          field: 'data',
          message: error,
          code: 'DATA_VALIDATION_ERROR'
        })));
      }

      // Create generation job
      logger.info('Creating generation job', { requestId: req.requestId });
      const job = await documentGenerator.createJob(templateFile.path, csvData.rows, {
        outputFormat: req.body.options?.format || 'pdf',
        quality: req.body.options?.quality || 'medium',
        includeMetadata: req.body.options?.includeMetadata !== false,
        watermark: req.body.options?.watermark,
        password: req.body.options?.password,
        batchSize: parseInt(req.body.options?.batchSize) || 10,
        ...req.body.options
      });

      // Send initial notification email if provided
      if (req.body.notification?.email) {
        try {
          await emailService.sendProgressUpdateNotification(job, req.body.notification.email, {
            totalDocuments: csvData.totalRows,
            estimatedTime: estimateGenerationTime(csvData.totalRows, job.options.batchSize)
          });
        } catch (emailError) {
          logger.warn('Failed to send initial notification email', {
            requestId: req.requestId,
            error: emailError.message
          });
        }
      }

      // Clean up uploaded files after job creation
      await cleanupFiles([templateFile.path, csvFile.path]);

      const responseTime = Date.now() - startTime;
      
      logger.info('Document generation job created successfully', {
        requestId: req.requestId,
        jobId: job.id,
        responseTime,
        totalDocuments: csvData.totalRows
      });

      res.status(201).json({
        success: true,
        message: 'Document generation job created successfully',
        data: {
          batchId: job.id,
          statusUrl: `/api/documents/${job.id}/status`,
          downloadUrl: `/api/documents/${job.id}/download`,
          totalDocuments: csvData.totalRows,
          estimatedTime: estimateGenerationTime(csvData.totalRows, job.options.batchSize),
          jobStatus: job.status,
          createdAt: job.createdAt
        }
      });

    } catch (error) {
      // Clean up files on error
      if (req.uploadedFiles) {
        await cleanupFiles(req.uploadedFiles.map(f => f.path));
      }

      throw error;
    }
  })
);

/**
 * GET /api/documents/:batchId/status
 * Check generation progress for a batch
 */
router.get('/:batchId/status',
  asyncHandler(async (req, res) => {
    const { batchId } = req.params;
    
    logger.info('Checking batch status', { requestId: req.requestId, batchId });

    // Get job status
    const job = documentGenerator.getJob(batchId);
    if (!job) {
      throw new NotFoundError(`Batch with ID '${batchId}' not found`);
    }

    // Calculate additional statistics
    const completedDocs = job.results.filter(r => r.status === 'completed');
    const failedDocs = job.results.filter(r => r.status === 'failed');
    const pendingDocs = job.dataRows.length - job.results.length;

    const statusData = {
      batchId: job.id,
      status: job.status,
      progress: job.progress,
      totalDocuments: job.dataRows.length,
      completedDocuments: completedDocs.length,
      failedDocuments: failedDocs.length,
      pendingDocuments: pendingDocs,
      results: job.results.map(result => ({
        rowId: result.rowId,
        status: result.status,
        fileName: result.fileName,
        fileSize: result.fileSize,
        error: result.error,
        generatedAt: result.generatedAt
      })),
      errors: job.errors,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
      estimatedTimeRemaining: job.status === 'processing' ? 
        estimateRemainingTime(job) : null
    };

    logger.info('Batch status retrieved', {
      requestId: req.requestId,
      batchId,
      status: job.status,
      progress: job.progress
    });

    res.json({
      success: true,
      message: 'Batch status retrieved successfully',
      data: statusData
    });
  })
);

/**
 * GET /api/documents/:batchId/download
 * Download ZIP file containing all generated documents
 */
router.get('/:batchId/download',
  asyncHandler(async (req, res) => {
    const { batchId } = req.params;
    
    logger.info('Download request for batch', { requestId: req.requestId, batchId });

    // Get job status
    const job = documentGenerator.getJob(batchId);
    if (!job) {
      throw new NotFoundError(`Batch with ID '${batchId}' not found`);
    }

    // Check if job is completed
    if (job.status !== 'completed') {
      throw new ValidationError(`Batch is not ready for download. Current status: ${job.status}`);
    }

    // Check if there are completed documents
    const completedDocs = job.results.filter(r => r.status === 'completed');
    if (completedDocs.length === 0) {
      throw new ValidationError('No documents were generated successfully');
    }

    // Create ZIP file
    const zipFileName = `batch_${batchId}_${Date.now()}.zip`;
    const zipFilePath = path.join(process.cwd(), 'temp', zipFileName);
    
    // Ensure temp directory exists
    await fs.mkdir(path.dirname(zipFilePath), { recursive: true });

    // Create ZIP archive
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    output.on('close', () => {
      logger.info('ZIP file created successfully', {
        requestId: req.requestId,
        batchId,
        zipSize: archive.pointer()
      });
    });

    archive.on('error', (err) => {
      logger.error('ZIP creation failed', {
        requestId: req.requestId,
        batchId,
        error: err.message
      });
      throw new FileProcessingError(`Failed to create ZIP file: ${err.message}`);
    });

    // Pipe archive to file
    archive.pipe(output);

    // Add documents to ZIP
    for (const doc of completedDocs) {
      try {
        if (await fs.access(doc.filePath).then(() => true).catch(() => false)) {
          archive.file(doc.filePath, { name: doc.fileName });
        } else {
          logger.warn('Document file not found', {
            requestId: req.requestId,
            batchId,
            filePath: doc.filePath
          });
        }
      } catch (error) {
        logger.warn('Failed to add document to ZIP', {
          requestId: req.requestId,
          batchId,
          fileName: doc.fileName,
          error: error.message
        });
      }
    }

    // Finalize archive
    await archive.finalize();

    // Set response headers
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipFileName}"`,
      'Content-Length': archive.pointer()
    });

    // Stream ZIP file to client
    const zipStream = fs.createReadStream(zipFilePath);
    zipStream.pipe(res);

    // Clean up ZIP file after streaming
    zipStream.on('end', async () => {
      try {
        await fs.unlink(zipFilePath);
        logger.info('ZIP file cleaned up', { requestId: req.requestId, batchId });
      } catch (error) {
        logger.warn('Failed to cleanup ZIP file', {
          requestId: req.requestId,
          batchId,
          error: error.message
        });
      }
    });

    logger.info('Download started', {
      requestId: req.requestId,
      batchId,
      documents: completedDocs.length,
      zipSize: archive.pointer()
    });
  })
);

/**
 * POST /api/documents/:batchId/cancel
 * Cancel a running generation job
 */
router.post('/:batchId/cancel',
  asyncHandler(async (req, res) => {
    const { batchId } = req.params;
    
    logger.info('Cancelling batch', { requestId: req.requestId, batchId });

    const cancelled = documentGenerator.cancelJob(batchId);
    if (!cancelled) {
      throw new NotFoundError(`Cannot cancel batch '${batchId}'. Job not found or already completed.`);
    }

    logger.info('Batch cancelled successfully', { requestId: req.requestId, batchId });

    res.json({
      success: true,
      message: 'Batch cancelled successfully',
      data: {
        batchId,
        status: 'cancelled',
        cancelledAt: new Date()
      }
    });
  })
);

/**
 * DELETE /api/documents/:batchId
 * Delete a batch and clean up generated files
 */
router.delete('/:batchId',
  asyncHandler(async (req, res) => {
    const { batchId } = req.params;
    
    logger.info('Deleting batch', { requestId: req.requestId, batchId });

    // Get job before deletion
    const job = documentGenerator.getJob(batchId);
    if (!job) {
      throw new NotFoundError(`Batch with ID '${batchId}' not found`);
    }

    // Clean up generated files
    const completedDocs = job.results.filter(r => r.status === 'completed');
    for (const doc of completedDocs) {
      try {
        if (await fs.access(doc.filePath).then(() => true).catch(() => false)) {
          await fs.unlink(doc.filePath);
        }
      } catch (error) {
        logger.warn('Failed to cleanup document file', {
          requestId: req.requestId,
          batchId,
          fileName: doc.fileName,
          error: error.message
        });
      }
    }

    // Delete job
    const deleted = documentGenerator.deleteJob(batchId);
    if (!deleted) {
      throw new NotFoundError(`Failed to delete batch '${batchId}'`);
    }

    logger.info('Batch deleted successfully', {
      requestId: req.requestId,
      batchId,
      cleanedFiles: completedDocs.length
    });

    res.json({
      success: true,
      message: 'Batch deleted successfully',
      data: {
        batchId,
        deletedAt: new Date(),
        cleanedFiles: completedDocs.length
      }
    });
  })
);

/**
 * GET /api/documents
 * List all batches with pagination and filtering
 */
router.get('/',
  asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 25, 
      status, 
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query;

    logger.info('Listing batches', { 
      requestId: req.requestId, 
      page, 
      limit, 
      status, 
      sortBy, 
      sortOrder 
    });

    // Get all jobs
    const allJobs = documentGenerator.getAllJobs();
    
    // Apply filters
    let filteredJobs = allJobs;
    if (status) {
      filteredJobs = allJobs.filter(job => job.status === status);
    }

    // Apply sorting
    filteredJobs.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];
      
      if (aValue instanceof Date) aValue = aValue.getTime();
      if (bValue instanceof Date) bValue = bValue.getTime();
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedJobs = filteredJobs.slice(startIndex, endIndex);

    // Prepare response data
    const batches = paginatedJobs.map(job => ({
      batchId: job.id,
      status: job.status,
      progress: job.progress,
      totalDocuments: job.dataRows.length,
      completedDocuments: job.results.filter(r => r.status === 'completed').length,
      failedDocuments: job.results.filter(r => r.status === 'failed').length,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt
    }));

    const totalBatches = filteredJobs.length;
    const totalPages = Math.ceil(totalBatches / parseInt(limit));

    logger.info('Batches listed successfully', {
      requestId: req.requestId,
      totalBatches,
      returnedBatches: batches.length,
      page,
      totalPages
    });

    res.json({
      success: true,
      message: 'Batches retrieved successfully',
      data: {
        batches,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalBatches,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });
  })
);

/**
 * Utility Functions
 */

/**
 * Validate data completeness against template requirements
 * @param {Object} csvData - Parsed CSV data
 * @param {Object} templateAnalysis - Template analysis
 * @returns {Object} Validation result
 */
function validateDataCompleteness(csvData, templateAnalysis) {
  const errors = [];
  const warnings = [];
  
  // Get required placeholders
  const requiredPlaceholders = templateAnalysis.placeholders
    .filter(p => p.required)
    .map(p => p.name);
  
  // Check if all required placeholders are present in CSV headers
  const missingPlaceholders = requiredPlaceholders.filter(
    placeholder => !csvData.headers.includes(placeholder)
  );
  
  if (missingPlaceholders.length > 0) {
    errors.push(`Missing required columns: ${missingPlaceholders.join(', ')}`);
  }
  
  // Check for empty rows
  const emptyRows = csvData.rows.filter(row => 
    Object.values(row).every(value => !value || value === '')
  );
  
  if (emptyRows.length > 0) {
    warnings.push(`${emptyRows.length} empty rows detected and will be skipped`);
  }
  
  // Check for missing data in required columns
  const rowsWithMissingData = [];
  for (let i = 0; i < csvData.rows.length; i++) {
    const row = csvData.rows[i];
    const missingData = requiredPlaceholders.filter(
      placeholder => !row[placeholder] || row[placeholder] === ''
    );
    
    if (missingData.length > 0) {
      rowsWithMissingData.push({
        rowIndex: i + 1,
        missingColumns: missingData
      });
    }
  }
  
  if (rowsWithMissingData.length > 0) {
    warnings.push(`${rowsWithMissingData.length} rows have missing data in required columns`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Estimate generation time
 * @param {number} totalDocuments - Total number of documents
 * @param {number} batchSize - Batch size
 * @returns {string} Estimated time
 */
function estimateGenerationTime(totalDocuments, batchSize) {
  const avgTimePerDoc = 2; // seconds per document
  const totalSeconds = (totalDocuments / batchSize) * avgTimePerDoc;
  
  if (totalSeconds < 60) {
    return `${Math.ceil(totalSeconds)} seconds`;
  } else if (totalSeconds < 3600) {
    return `${Math.ceil(totalSeconds / 60)} minutes`;
  } else {
    return `${Math.ceil(totalSeconds / 3600)} hours`;
  }
}

/**
 * Estimate remaining time for a job
 * @param {Object} job - Generation job
 * @returns {string} Estimated remaining time
 */
function estimateRemainingTime(job) {
  if (job.results.length === 0) {
    return 'Calculating...';
  }
  
  const completedResults = job.results.filter(r => r.status === 'completed');
  if (completedResults.length === 0) {
    return 'Calculating...';
  }
  
  // Calculate average time per document
  const totalTime = Date.now() - job.createdAt.getTime();
  const avgTimePerDoc = totalTime / completedResults.length;
  
  // Calculate remaining documents
  const remainingDocs = job.dataRows.length - completedResults.length;
  const estimatedTimeMs = remainingDocs * avgTimePerDoc;
  
  if (estimatedTimeMs < 60000) {
    return `${Math.ceil(estimatedTimeMs / 1000)} seconds`;
  } else if (estimatedTimeMs < 3600000) {
    return `${Math.ceil(estimatedTimeMs / 60000)} minutes`;
  } else {
    return `${Math.ceil(estimatedTimeMs / 3600000)} hours`;
  }
}

module.exports = router;
