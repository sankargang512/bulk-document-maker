const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const { createGzip, createGunzip } = require('zlib');
const { pipeline } = require('stream/promises');
const loggingService = require('../services/loggingService');

/**
 * Enhanced Upload Middleware
 * Implements streaming, compression, and performance optimizations
 */

// Ensure upload directories exist
const uploadDirs = ['uploads/templates', 'uploads/csv', 'uploads/batches', 'temp', 'compressed'];
uploadDirs.forEach(dir => {
  fs.ensureDirSync(path.join(__dirname, '..', dir));
});

// Enhanced storage configuration with streaming
const createEnhancedStorage = () => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      // Determine destination based on field name and file type
      let dest = 'temp';
      
      if (file.fieldname === 'template' || file.fieldname === 'templates') {
        dest = 'uploads/templates';
      } else if (file.fieldname === 'csv') {
        dest = 'uploads/csv';
      } else if (file.fieldname === 'template1' || file.fieldname === 'template2') {
        dest = 'uploads/templates';
      } else if (file.fieldname === 'batch') {
        dest = 'uploads/batches';
      }
      
      cb(null, path.join(__dirname, '..', dest));
    },
    filename: (req, file, cb) => {
      // Generate unique filename with hash for deduplication
      const timestamp = Date.now();
      const randomString = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(file.originalname);
      const baseName = path.basename(file.originalname, ext);
      
      // Create hash of file content for deduplication
      const hash = crypto.createHash('md5').update(file.originalname + timestamp).digest('hex').substring(0, 8);
      
      cb(null, `${baseName}_${timestamp}_${hash}${ext}`);
    }
  });
};

// Memory storage for small files (faster processing)
const createMemoryStorage = () => {
  return multer.memoryStorage();
};

// File filter with enhanced validation
const createFileFilter = (allowedTypes, maxSize) => {
  return (req, file, cb) => {
    // Check file type
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error(`File type ${file.mimetype} is not allowed`), false);
    }

    // Check file size
    if (file.size > maxSize) {
      return cb(new Error(`File size ${Math.round(file.size / (1024 * 1024))}MB exceeds limit ${Math.round(maxSize / (1024 * 1024))}MB`), false);
    }

    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = {
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'application/pdf': ['.pdf'],
      'text/csv': ['.csv'],
      'text/plain': ['.txt']
    };

    const allowedExts = allowedExtensions[file.mimetype] || [];
    if (allowedExts.length > 0 && !allowedExts.includes(ext)) {
      return cb(new Error(`File extension ${ext} is not allowed for ${file.mimetype}`), false);
    }

    cb(null, true);
  };
};

// Create enhanced multer instance
const createEnhancedUploader = (options = {}) => {
  const {
    storage = 'disk', // 'disk' or 'memory'
    allowedTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/pdf',
      'text/csv',
      'text/plain'
    ],
    maxFileSize = 50 * 1024 * 1024, // 50MB
    maxFiles = 20,
    preserveOriginalName = false,
    enableCompression = true,
    enableStreaming = true
  } = options;

  const storageConfig = storage === 'memory' ? createMemoryStorage() : createEnhancedStorage();
  const fileFilter = createFileFilter(allowedTypes, maxFileSize);

  return multer({
    storage: storageConfig,
    fileFilter,
    limits: {
      fileSize: maxFileSize,
      files: maxFiles,
      fieldSize: 1024 * 1024, // 1MB for form fields
      fieldNameSize: 100,
      headerPairs: 2000
    },
    preserveOriginalName
  });
};

// Streaming file processor
const createStreamingProcessor = () => {
  return async (req, res, next) => {
    if (!req.files && !req.file) {
      return next();
    }

    const files = req.files ? Object.values(req.files).flat() : [req.file];
    
    for (const file of files) {
      if (!file) continue;

      try {
        // Process file with streaming if enabled
        if (file.path && process.env.ENABLE_FILE_STREAMING === 'true') {
          await processFileStream(file);
        }

        // Add file metadata
        file.processedAt = new Date();
        file.fileHash = await calculateFileHash(file.path || file.buffer);
        file.fileSize = file.size;
        
        // Log file processing
        loggingService.info('File processed successfully', {
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          requestId: req.requestId
        });

      } catch (error) {
        loggingService.error('File processing failed', {
          fileName: file.originalname,
          error: error.message,
          requestId: req.requestId
        });

        return res.status(500).json({
          success: false,
          error: `File processing failed: ${error.message}`,
          fileName: file.originalname
        });
      }
    }

    next();
  };
};

// Process file with streaming
const processFileStream = async (file) => {
  if (!file.path) return;

  const inputStream = fs.createReadStream(file.path);
  const outputPath = file.path + '.processed';
  const outputStream = fs.createWriteStream(outputPath);

  try {
    // Apply processing pipeline (e.g., compression, validation)
    if (process.env.ENABLE_FILE_COMPRESSION === 'true') {
      const gzip = createGzip({ level: 6 });
      await pipeline(inputStream, gzip, outputStream);
      
      // Replace original with compressed version
      await fs.move(outputPath, file.path + '.gz');
      file.compressed = true;
      file.compressedPath = file.path + '.gz';
    } else {
      // Just copy file for validation
      await pipeline(inputStream, outputStream);
      await fs.remove(outputPath);
    }
  } catch (error) {
    throw new Error(`Stream processing failed: ${error.message}`);
  }
};

// Calculate file hash for deduplication
const calculateFileHash = async (filePath) => {
  try {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    return new Promise((resolve, reject) => {
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  } catch (error) {
    loggingService.error('File hash calculation failed', { filePath, error: error.message });
    return null;
  }
};

// File cleanup utility
const cleanupUploadedFiles = async (filePaths, delayMs = 300000) => { // 5 minutes default
  setTimeout(async () => {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    
    for (const filePath of paths) {
      try {
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
          loggingService.info('Uploaded file cleaned up', { filePath });
        }
      } catch (error) {
        loggingService.error('File cleanup failed', { filePath, error: error.message });
      }
    }
  }, delayMs);
};

// Pre-configured uploaders for common use cases
const uploaders = {
  // Template upload with enhanced validation
  template: createEnhancedUploader({
    storage: 'disk',
    allowedTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/pdf'
    ],
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 1,
    enableCompression: true,
    enableStreaming: true
  }),

  // CSV upload with memory storage for faster processing
  csv: createEnhancedUploader({
    storage: 'memory',
    allowedTypes: ['text/csv', 'text/plain'],
    maxFileSize: 5 * 1024 * 1024, // 5MB
    maxFiles: 1,
    enableCompression: false,
    enableStreaming: false
  }),

  // Batch upload for multiple files
  batch: createEnhancedUploader({
    storage: 'disk',
    allowedTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/pdf',
      'text/csv',
      'text/plain'
    ],
    maxFileSize: 50 * 1024 * 1024, // 50MB
    maxFiles: 20,
    enableCompression: true,
    enableStreaming: true
  }),

  // Template comparison upload
  templateComparison: createEnhancedUploader({
    storage: 'disk',
    allowedTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/pdf'
    ],
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 2,
    enableCompression: true,
    enableStreaming: true
  })
};

// Middleware for handling upload errors
const uploadErrorHandler = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    let errorMessage = 'File upload error';
    
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        errorMessage = 'File too large';
        break;
      case 'LIMIT_FILE_COUNT':
        errorMessage = 'Too many files';
        break;
      case 'LIMIT_FIELD_KEY':
        errorMessage = 'Field name too long';
        break;
      case 'LIMIT_FIELD_VALUE':
        errorMessage = 'Field value too long';
        break;
      case 'LIMIT_FIELD_COUNT':
        errorMessage = 'Too many fields';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        errorMessage = 'Unexpected file field';
        break;
      default:
        errorMessage = error.message;
    }

    loggingService.error('Multer upload error', {
      error: errorMessage,
      code: error.code,
      requestId: req.requestId
    });

    return res.status(400).json({
      success: false,
      error: errorMessage,
      code: error.code
    });
  }

  next(error);
};

module.exports = {
  createEnhancedUploader,
  createStreamingProcessor,
  processFileStream,
  calculateFileHash,
  cleanupUploadedFiles,
  uploaders,
  uploadErrorHandler
};
