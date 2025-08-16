const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { Transform } = require('stream');
const { EventEmitter } = require('events');
const { ValidationError, FileProcessingError, ExternalServiceError } = require('../middleware/errorHandler');

/**
 * @typedef {Object} GenerationJob
 * @property {string} id - Unique job identifier
 * @property {string} templatePath - Path to template file
 * @property {Object[]} dataRows - Array of data rows
 * @property {Object} options - Generation options
 * @property {string} status - Job status (pending, processing, completed, failed)
 * @property {number} progress - Progress percentage (0-100)
 * @property {Object[]} results - Generation results
 * @property {string[]} errors - Error messages
 * @property {Date} createdAt - Job creation timestamp
 * @property {Date} updatedAt - Job update timestamp
 * @property {Date} completedAt - Job completion timestamp
 */

/**
 * @typedef {Object} GenerationOptions
 * @property {string} outputFormat - Output format (pdf, docx, txt)
 * @property {string} quality - Output quality (low, medium, high)
 * @property {boolean} includeMetadata - Whether to include metadata
 * @property {string} watermark - Watermark text
 * @property {string} password - Document password
 * @property {Object} branding - Branding options
 * @property {number} batchSize - Number of documents per batch
 * @property {number} rateLimit - API calls per minute
 * @property {number} retryAttempts - Number of retry attempts
 * @property {number} retryDelay - Delay between retries in ms
 */

/**
 * @typedef {Object} GenerationResult
 * @property {string} rowId - Data row identifier
 * @property {string} fileName - Generated file name
 * @property {string} filePath - Generated file path
 * @property {number} fileSize - File size in bytes
 * @property {string} status - Generation status
 * @property {string} error - Error message if failed
 * @property {Date} generatedAt - Generation timestamp
 * @property {Object} metadata - Generation metadata
 */

/**
 * Document Generator Service
 * Handles document generation using CraftMyPDF API with batch processing and rate limiting
 */
class DocumentGeneratorService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      apiKey: config.apiKey || process.env.CRAFTMYPDF_API_KEY,
      apiUrl: config.apiUrl || 'https://api.craftmypdf.com/v1',
      outputDir: config.outputDir || 'generated',
      tempDir: config.tempDir || 'temp',
      maxConcurrent: config.maxConcurrent || 5,
      rateLimit: config.rateLimit || 60, // requests per minute
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      ...config
    };

    if (!this.config.apiKey) {
      throw new Error('CraftMyPDF API key is required');
    }

    // Initialize directories
    this.ensureDirectories();
    
    // Initialize rate limiting
    this.rateLimiter = {
      requests: [],
      lastReset: Date.now()
    };

    // Active jobs tracking
    this.activeJobs = new Map();
    this.jobQueue = [];
    this.processing = false;
  }

  /**
   * Create a new generation job
   * @param {string} templatePath - Path to template file
   * @param {Object[]} dataRows - Array of data rows
   * @param {GenerationOptions} options - Generation options
   * @returns {Promise<GenerationJob>} Created job
   */
  async createJob(templatePath, dataRows, options = {}) {
    try {
      // Validate inputs
      await this.validateJobInputs(templatePath, dataRows, options);
      
      // Create job object
      const job = {
        id: this.generateJobId(),
        templatePath,
        dataRows: this.prepareDataRows(dataRows),
        options: { ...this.getDefaultOptions(), ...options },
        status: 'pending',
        progress: 0,
        results: [],
        errors: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null
      };

      // Add to queue
      this.jobQueue.push(job);
      this.activeJobs.set(job.id, job);

      // Emit job created event
      this.emit('jobCreated', job);

      // Start processing if not already running
      if (!this.processing) {
        this.processQueue();
      }

      return job;
    } catch (error) {
      throw new FileProcessingError(`Failed to create generation job: ${error.message}`, [{
        field: 'job',
        message: error.message,
        code: 'JOB_CREATION_ERROR'
      }]);
    }
  }

  /**
   * Process the job queue
   * @returns {Promise<void>}
   */
  async processQueue() {
    if (this.processing || this.jobQueue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      while (this.jobQueue.length > 0) {
        const job = this.jobQueue.shift();
        
        if (job.status === 'cancelled') {
          continue;
        }

        await this.processJob(job);
        
        // Rate limiting
        await this.enforceRateLimit();
      }
    } catch (error) {
      console.error('Queue processing error:', error);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process a single generation job
   * @param {GenerationJob} job - Job to process
   * @returns {Promise<void>}
   */
  async processJob(job) {
    try {
      // Update job status
      job.status = 'processing';
      job.updatedAt = new Date();
      this.emit('jobStarted', job);

      // Process in batches
      const batches = this.createBatches(job.dataRows, job.options.batchSize);
      const totalBatches = batches.length;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        // Check if job was cancelled
        if (job.status === 'cancelled') {
          break;
        }

        // Process batch
        await this.processBatch(job, batch, i + 1, totalBatches);
        
        // Update progress
        job.progress = Math.round(((i + 1) / totalBatches) * 100);
        job.updatedAt = new Date();
        this.emit('jobProgress', job);
      }

      // Mark job as completed
      job.status = 'completed';
      job.progress = 100;
      job.completedAt = new Date();
      job.updatedAt = new Date();
      this.emit('jobCompleted', job);

    } catch (error) {
      // Mark job as failed
      job.status = 'failed';
      job.errors.push(error.message);
      job.updatedAt = new Date();
      this.emit('jobFailed', job, error);
      
      throw error;
    }
  }

  /**
   * Process a batch of data rows
   * @param {GenerationJob} job - Generation job
   * @param {Object[]} batch - Batch of data rows
   * @param {number} batchNumber - Current batch number
   * @param {number} totalBatches - Total number of batches
   * @returns {Promise<void>}
   */
  async processBatch(job, batch, batchNumber, totalBatches) {
    const batchPromises = batch.map(async (row, rowIndex) => {
      try {
        const result = await this.generateDocument(
          job.templatePath,
          row,
          job.options,
          `${job.id}_batch${batchNumber}_row${rowIndex + 1}`
        );

        job.results.push(result);
        return result;

      } catch (error) {
        const errorResult = {
          rowId: row.id || `row_${rowIndex + 1}`,
          fileName: '',
          filePath: '',
          fileSize: 0,
          status: 'failed',
          error: error.message,
          generatedAt: new Date(),
          metadata: { batchNumber, rowIndex }
        };

        job.results.push(errorResult);
        job.errors.push(`Row ${rowIndex + 1}: ${error.message}`);
        
        return errorResult;
      }
    });

    // Process batch with concurrency limit
    const results = await Promise.allSettled(batchPromises);
    
    // Emit batch completed event
    this.emit('batchCompleted', job, batchNumber, totalBatches, results);
  }

  /**
   * Generate a single document
   * @param {string} templatePath - Path to template file
   * @param {Object} dataRow - Data row for document
   * @param {GenerationOptions} options - Generation options
   * @param {string} identifier - Unique identifier for the document
   * @returns {Promise<GenerationResult>} Generation result
   */
  async generateDocument(templatePath, dataRow, options, identifier) {
    let attempts = 0;
    
    while (attempts < options.retryAttempts) {
      try {
        // Prepare template with data
        const processedTemplate = await this.processTemplate(templatePath, dataRow, options);
        
        // Generate document via API
        const documentBuffer = await this.callGenerationAPI(processedTemplate, options);
        
        // Save generated document
        const result = await this.saveGeneratedDocument(documentBuffer, identifier, options);
        
        return result;

      } catch (error) {
        attempts++;
        
        if (attempts >= options.retryAttempts) {
          throw error;
        }
        
        // Wait before retry
        await this.delay(options.retryDelay * attempts);
      }
    }
  }

  /**
   * Process template with data
   * @param {string} templatePath - Path to template file
   * @param {Object} dataRow - Data row
   * @param {GenerationOptions} options - Generation options
   * @returns {Promise<Buffer>} Processed template buffer
   */
  async processTemplate(templatePath, dataRow, options) {
    try {
      // Read template file
      const templateBuffer = await fs.readFile(templatePath);
      
      // Replace placeholders in template
      const processedBuffer = await this.replacePlaceholders(templateBuffer, dataRow, options);
      
      return processedBuffer;
      
    } catch (error) {
      throw new Error(`Template processing failed: ${error.message}`);
    }
  }

  /**
   * Replace placeholders in template
   * @param {Buffer} templateBuffer - Template file buffer
   * @param {Object} dataRow - Data row
   * @param {GenerationOptions} options - Generation options
   * @returns {Promise<Buffer>} Processed template buffer
   */
  async replacePlaceholders(templateBuffer, dataRow, options) {
    try {
      // Convert buffer to string for processing
      let templateContent = templateBuffer.toString('utf8');
      
      // Replace different placeholder formats
      templateContent = this.replacePlaceholderFormat(templateContent, dataRow, '[', ']');
      templateContent = this.replacePlaceholderFormat(templateContent, dataRow, '{{', '}}');
      templateContent = this.replacePlaceholderFormat(templateContent, dataRow, '$', '$');
      templateContent = this.replacePlaceholderFormat(templateContent, dataRow, '%', '%');
      
      // Add metadata if requested
      if (options.includeMetadata) {
        templateContent = this.addMetadata(templateContent, dataRow, options);
      }
      
      // Add watermark if specified
      if (options.watermark) {
        templateContent = this.addWatermark(templateContent, options.watermark);
      }
      
      return Buffer.from(templateContent, 'utf8');
      
    } catch (error) {
      throw new Error(`Placeholder replacement failed: ${error.message}`);
    }
  }

  /**
   * Replace placeholders in specific format
   * @param {string} content - Template content
   * @param {Object} dataRow - Data row
   * @param {string} startDelimiter - Start delimiter
   * @param {string} endDelimiter - End delimiter
   * @returns {string} Processed content
   */
  replacePlaceholderFormat(content, dataRow, startDelimiter, endDelimiter) {
    const regex = new RegExp(`${startDelimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([a-zA-Z0-9_\s]+)${endDelimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    
    return content.replace(regex, (match, placeholder) => {
      const key = placeholder.trim();
      const value = this.getNestedValue(dataRow, key);
      
      if (value !== undefined) {
        return String(value);
      }
      
      // Return original placeholder if not found
      return match;
    });
  }

  /**
   * Get nested value from object
   * @param {Object} obj - Object to search
   * @param {string} path - Dot-separated path
   * @returns {any} Value at path
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Add metadata to template
   * @param {string} content - Template content
   * @param {Object} dataRow - Data row
   * @param {GenerationOptions} options - Generation options
   * @returns {string} Content with metadata
   */
  addMetadata(content, dataRow, options) {
    const metadata = {
      generatedAt: new Date().toISOString(),
      template: path.basename(options.templatePath || 'unknown'),
      dataRow: dataRow.id || 'unknown'
    };
    
    // Add metadata as hidden fields or comments
    const metadataComment = `<!-- Metadata: ${JSON.stringify(metadata)} -->`;
    
    return metadataComment + '\n' + content;
  }

  /**
   * Add watermark to template
   * @param {string} content - Template content
   * @param {string} watermark - Watermark text
   * @returns {string} Content with watermark
   */
  addWatermark(content, watermark) {
    // Add watermark as CSS or HTML
    const watermarkStyle = `
      <style>
        .watermark {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-45deg);
          font-size: 48px;
          color: rgba(0,0,0,0.1);
          pointer-events: none;
          z-index: 1000;
        }
      </style>
      <div class="watermark">${watermark}</div>
    `;
    
    return content + watermarkStyle;
  }

  /**
   * Call CraftMyPDF generation API
   * @param {Buffer} templateBuffer - Processed template buffer
   * @param {GenerationOptions} options - Generation options
   * @returns {Promise<Buffer>} Generated document buffer
   */
  async callGenerationAPI(templateBuffer, options) {
    try {
      // Prepare form data
      const formData = new FormData();
      formData.append('template', templateBuffer, {
        filename: 'template.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      
      formData.append('format', options.outputFormat);
      formData.append('quality', options.quality);
      
      if (options.password) {
        formData.append('password', options.password);
      }
      
      // Add branding if specified
      if (options.branding) {
        Object.entries(options.branding).forEach(([key, value]) => {
          formData.append(`branding_${key}`, value);
        });
      }

      // Make API request
      const response = await axios.post(
        `${this.config.apiUrl}/generate`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            ...formData.getHeaders()
          },
          responseType: 'arraybuffer',
          timeout: 300000 // 5 minutes
        }
      );

      if (response.status !== 200) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      return Buffer.from(response.data);

    } catch (error) {
      if (error.response) {
        throw new Error(`API error: ${error.response.status} - ${error.response.data}`);
      }
      throw new Error(`API request failed: ${error.message}`);
    }
  }

  /**
   * Save generated document
   * @param {Buffer} documentBuffer - Document buffer
   * @param {string} identifier - Document identifier
   * @param {GenerationOptions} options - Generation options
   * @returns {Promise<GenerationResult>} Generation result
   */
  async saveGeneratedDocument(documentBuffer, identifier, options) {
    try {
      // Generate filename
      const timestamp = Date.now();
      const extension = options.outputFormat || 'pdf';
      const fileName = `${identifier}_${timestamp}.${extension}`;
      
      // Ensure output directory exists
      const outputPath = path.join(this.config.outputDir, options.outputFormat || 'pdf');
      await fs.mkdir(outputPath, { recursive: true });
      
      // Save file
      const filePath = path.join(outputPath, fileName);
      await fs.writeFile(filePath, documentBuffer);
      
      // Get file stats
      const stats = await fs.stat(filePath);
      
      return {
        rowId: identifier,
        fileName,
        filePath,
        fileSize: stats.size,
        status: 'completed',
        error: null,
        generatedAt: new Date(),
        metadata: {
          format: options.outputFormat,
          quality: options.quality,
          fileSize: stats.size
        }
      };

    } catch (error) {
      throw new Error(`Failed to save generated document: ${error.message}`);
    }
  }

  /**
   * Create batches from data rows
   * @param {Object[]} dataRows - Array of data rows
   * @param {number} batchSize - Batch size
   * @returns {Object[][]} Array of batches
   */
  createBatches(dataRows, batchSize) {
    const batches = [];
    
    for (let i = 0; i < dataRows.length; i += batchSize) {
      batches.push(dataRows.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Enforce rate limiting
   * @returns {Promise<void>}
   */
  async enforceRateLimit() {
    const now = Date.now();
    const windowSize = 60000; // 1 minute
    
    // Remove old requests outside the window
    this.rateLimiter.requests = this.rateLimiter.requests.filter(
      time => now - time < windowSize
    );
    
    // Check if we're at the limit
    if (this.rateLimiter.requests.length >= this.config.rateLimit) {
      const oldestRequest = this.rateLimiter.requests[0];
      const waitTime = windowSize - (now - oldestRequest);
      
      if (waitTime > 0) {
        await this.delay(waitTime);
      }
    }
    
    // Add current request
    this.rateLimiter.requests.push(now);
  }

  /**
   * Delay execution
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get job by ID
   * @param {string} jobId - Job identifier
   * @returns {GenerationJob|null} Job object or null
   */
  getJob(jobId) {
    return this.activeJobs.get(jobId) || null;
  }

  /**
   * Get all jobs
   * @returns {GenerationJob[]} Array of all jobs
   */
  getAllJobs() {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Cancel a job
   * @param {string} jobId - Job identifier
   * @returns {boolean} Whether job was cancelled
   */
  cancelJob(jobId) {
    const job = this.activeJobs.get(jobId);
    
    if (job && job.status === 'pending') {
      job.status = 'cancelled';
      job.updatedAt = new Date();
      this.emit('jobCancelled', job);
      return true;
    }
    
    return false;
  }

  /**
   * Delete a job
   * @param {string} jobId - Job identifier
   * @returns {boolean} Whether job was deleted
   */
  deleteJob(jobId) {
    const job = this.activeJobs.get(jobId);
    
    if (job) {
      this.activeJobs.delete(jobId);
      
      // Remove from queue if present
      const queueIndex = this.jobQueue.findIndex(j => j.id === jobId);
      if (queueIndex !== -1) {
        this.jobQueue.splice(queueIndex, 1);
      }
      
      this.emit('jobDeleted', job);
      return true;
    }
    
    return false;
  }

  /**
   * Clean up completed jobs
   * @param {number} maxAge - Maximum age in hours (default: 24)
   * @returns {number} Number of jobs cleaned up
   */
  cleanupJobs(maxAge = 24) {
    const cutoff = new Date(Date.now() - maxAge * 60 * 60 * 1000);
    let cleanedCount = 0;
    
    for (const [jobId, job] of this.activeJobs.entries()) {
      if (job.completedAt && job.completedAt < cutoff) {
        this.activeJobs.delete(jobId);
        cleanedCount++;
      }
    }
    
    return cleanedCount;
  }

  /**
   * Validate job inputs
   * @param {string} templatePath - Template file path
   * @param {Object[]} dataRows - Data rows
   * @param {GenerationOptions} options - Generation options
   * @returns {Promise<void>}
   */
  async validateJobInputs(templatePath, dataRows, options) {
    // Validate template file
    if (!templatePath || typeof templatePath !== 'string') {
      throw new ValidationError('Template path is required and must be a string');
    }
    
    try {
      await fs.access(templatePath);
    } catch (error) {
      throw new ValidationError(`Template file not accessible: ${templatePath}`);
    }
    
    // Validate data rows
    if (!Array.isArray(dataRows) || dataRows.length === 0) {
      throw new ValidationError('Data rows must be a non-empty array');
    }
    
    // Validate options
    if (options.outputFormat && !['pdf', 'docx', 'txt'].includes(options.outputFormat)) {
      throw new ValidationError('Invalid output format. Must be pdf, docx, or txt');
    }
    
    if (options.quality && !['low', 'medium', 'high'].includes(options.quality)) {
      throw new ValidationError('Invalid quality. Must be low, medium, or high');
    }
  }

  /**
   * Prepare data rows for processing
   * @param {Object[]} dataRows - Raw data rows
   * @returns {Object[]} Prepared data rows
   */
  prepareDataRows(dataRows) {
    return dataRows.map((row, index) => ({
      id: row.id || `row_${index + 1}`,
      ...row
    }));
  }

  /**
   * Get default generation options
   * @returns {GenerationOptions} Default options
   */
  getDefaultOptions() {
    return {
      outputFormat: 'pdf',
      quality: 'medium',
      includeMetadata: true,
      watermark: null,
      password: null,
      branding: {},
      batchSize: 10,
      rateLimit: this.config.rateLimit,
      retryAttempts: this.config.retryAttempts,
      retryDelay: this.config.retryDelay
    };
  }

  /**
   * Generate unique job ID
   * @returns {string} Job ID
   */
  generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Ensure required directories exist
   * @returns {Promise<void>}
   */
  async ensureDirectories() {
    try {
      await fs.mkdir(this.config.outputDir, { recursive: true });
      await fs.mkdir(this.config.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create directories:', error);
    }
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    const jobs = Array.from(this.activeJobs.values());
    
    return {
      totalJobs: jobs.length,
      pendingJobs: jobs.filter(j => j.status === 'pending').length,
      processingJobs: jobs.filter(j => j.status === 'processing').length,
      completedJobs: jobs.filter(j => j.status === 'completed').length,
      failedJobs: jobs.filter(j => j.status === 'failed').length,
      cancelledJobs: jobs.filter(j => j.status === 'cancelled').length,
      queueLength: this.jobQueue.length,
      processing: this.processing,
      rateLimit: this.config.rateLimit,
      maxConcurrent: this.config.maxConcurrent
    };
  }
}

module.exports = DocumentGeneratorService;
