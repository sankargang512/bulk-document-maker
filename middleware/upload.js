const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { promisify } = require('util');

/**
 * @typedef {Object} UploadConfig
 * @property {string} destination - Directory to store uploaded files
 * @property {number} maxFileSize - Maximum file size in bytes
 * @property {string[]} allowedMimeTypes - Array of allowed MIME types
 * @property {string[]} allowedExtensions - Array of allowed file extensions
 * @property {boolean} preserveOriginalName - Whether to preserve original filename
 */

/**
 * @typedef {Object} UploadedFile
 * @property {string} fieldname - Form field name
 * @property {string} originalname - Original filename
 * @property {string} encoding - File encoding
 * @property {string} mimetype - MIME type
 * @property {number} size - File size in bytes
 * @property {string} destination - File destination directory
 * @property {string} filename - Generated filename
 * @property {string} path - Full file path
 * @property {Date} uploadDate - Upload timestamp
 * @property {string} checksum - File SHA-256 checksum
 */

/**
 * Default upload configurations for different file types
 */
const UPLOAD_CONFIGS = {
  template: {
    destination: 'uploads/templates',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/pdf', // .pdf
      'text/plain', // .txt
      'application/msword' // .doc
    ],
    allowedExtensions: ['.docx', '.pdf', '.txt', '.doc'],
    preserveOriginalName: false
  },
  csv: {
    destination: 'uploads/csv',
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: [
      'text/csv',
      'text/plain',
      'application/csv',
      'application/vnd.ms-excel'
    ],
    allowedExtensions: ['.csv', '.txt'],
    preserveOriginalName: false
  },
  batch: {
    destination: 'uploads/batches',
    maxFileSize: 50 * 1024 * 1024, // 50MB for batch operations
    allowedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf',
      'text/plain',
      'application/msword',
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'application/zip',
      'application/x-zip-compressed'
    ],
    allowedExtensions: ['.docx', '.pdf', '.txt', '.doc', '.csv', '.zip'],
    preserveOriginalName: false
  }
};

/**
 * Generate a unique filename to prevent conflicts
 * @param {string} originalname - Original filename
 * @param {string} extension - File extension
 * @returns {string} Unique filename
 */
function generateUniqueFilename(originalname, extension) {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const baseName = path.basename(originalname, extension);
  
  return `${baseName}_${timestamp}_${randomString}${extension}`;
}

/**
 * Generate SHA-256 checksum for a file
 * @param {Buffer} buffer - File buffer
 * @returns {Promise<string>} File checksum
 */
async function generateChecksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Validate file type based on MIME type and extension
 * @param {string} mimetype - File MIME type
 * @param {string} originalname - Original filename
 * @param {UploadConfig} config - Upload configuration
 * @returns {boolean} Whether file type is valid
 */
function validateFileType(mimetype, originalname, config) {
  const extension = path.extname(originalname).toLowerCase();
  
  // Check MIME type
  const validMimeType = config.allowedMimeTypes.includes(mimetype);
  
  // Check file extension
  const validExtension = config.allowedExtensions.includes(extension);
  
  return validMimeType && validExtension;
}

/**
 * Create storage configuration for multer
 * @param {UploadConfig} config - Upload configuration
 * @returns {multer.StorageEngine} Multer storage engine
 */
function createStorage(config) {
  return multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        // Ensure destination directory exists
        await fs.mkdir(config.destination, { recursive: true });
        cb(null, config.destination);
      } catch (error) {
        cb(error);
      }
    },
    filename: (req, file, cb) => {
      const extension = path.extname(file.originalname);
      
      if (config.preserveOriginalName) {
        // Use original name but add timestamp to prevent conflicts
        const baseName = path.basename(file.originalname, extension);
        const timestamp = Date.now();
        cb(null, `${baseName}_${timestamp}${extension}`);
      } else {
        // Generate completely unique filename
        cb(null, generateUniqueFilename(file.originalname, extension));
      }
    }
  });
}

/**
 * File filter function for multer
 * @param {UploadConfig} config - Upload configuration
 * @returns {Function} File filter function
 */
function createFileFilter(config) {
  return (req, file, cb) => {
    // Check file size
    if (file.size && file.size > config.maxFileSize) {
      return cb(new Error(`File size exceeds limit of ${config.maxFileSize / (1024 * 1024)}MB`), false);
    }
    
    // Validate file type
    if (!validateFileType(file.mimetype, file.originalname, config)) {
      const allowedTypes = config.allowedExtensions.join(', ');
      return cb(new Error(`Invalid file type. Allowed types: ${allowedTypes}`), false);
    }
    
    cb(null, true);
  };
}

/**
 * Create multer instance with specific configuration
 * @param {string} configType - Type of upload configuration to use
 * @param {Object} options - Additional options
 * @returns {multer.Multer} Configured multer instance
 */
function createUploader(configType, options = {}) {
  const config = { ...UPLOAD_CONFIGS[configType], ...options };
  
  if (!config) {
    throw new Error(`Invalid upload configuration type: ${configType}`);
  }
  
  return multer({
    storage: createStorage(config),
    fileFilter: createFileFilter(config),
    limits: {
      fileSize: config.maxFileSize,
      files: options.maxFiles || 1,
      fields: options.maxFields || 10
    }
  });
}

/**
 * Middleware for single file upload
 * @param {string} configType - Type of upload configuration
 * @param {string} fieldName - Form field name for the file
 * @param {Object} options - Additional options
 * @returns {Function} Express middleware
 */
function singleFileUpload(configType, fieldName, options = {}) {
  const uploader = createUploader(configType, options);
  
  return (req, res, next) => {
    uploader.single(fieldName)(req, res, async (err) => {
      if (err) {
        return next(err);
      }
      
      if (!req.file) {
        return next(new Error(`No file uploaded in field '${fieldName}'`));
      }
      
      try {
        // Generate checksum
        const fileBuffer = await fs.readFile(req.file.path);
        const checksum = await generateChecksum(fileBuffer);
        
        // Add additional metadata
        req.file.uploadDate = new Date();
        req.file.checksum = checksum;
        
        // Add file info to request for logging
        req.uploadedFile = {
          fieldname: req.file.fieldname,
          originalname: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
          destination: req.file.destination,
          filename: req.file.filename,
          path: req.file.path,
          uploadDate: req.file.uploadDate,
          checksum: req.file.checksum
        };
        
        next();
      } catch (error) {
        next(error);
      }
    });
  };
}

/**
 * Middleware for multiple file upload
 * @param {string} configType - Type of upload configuration
 * @param {string} fieldName - Form field name for the files
 * @param {Object} options - Additional options
 * @returns {Function} Express middleware
 */
function multipleFileUpload(configType, fieldName, options = {}) {
  const uploader = createUploader(configType, { ...options, maxFiles: options.maxFiles || 10 });
  
  return (req, res, next) => {
    uploader.array(fieldName, options.maxFiles || 10)(req, res, async (err) => {
      if (err) {
        return next(err);
      }
      
      if (!req.files || req.files.length === 0) {
        return next(new Error(`No files uploaded in field '${fieldName}'`));
      }
      
      try {
        // Process each file
        const processedFiles = [];
        
        for (const file of req.files) {
          const fileBuffer = await fs.readFile(file.path);
          const checksum = await generateChecksum(fileBuffer);
          
          file.uploadDate = new Date();
          file.checksum = checksum;
          
          processedFiles.push({
            fieldname: file.fieldname,
            originalname: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
            destination: file.destination,
            filename: file.filename,
            path: file.path,
            uploadDate: file.uploadDate,
            checksum: file.checksum
          });
        }
        
        req.uploadedFiles = processedFiles;
        next();
      } catch (error) {
        next(error);
      }
    });
  };
}

/**
 * Middleware for mixed file and field uploads
 * @param {string} configType - Type of upload configuration
 * @param {Object} options - Additional options
 * @returns {Function} Express middleware
 */
function mixedUpload(configType, options = {}) {
  const uploader = createUploader(configType, options);
  
  return (req, res, next) => {
    uploader.any()(req, res, async (err) => {
      if (err) {
        return next(err);
      }
      
      try {
        const processedFiles = [];
        
        if (req.files && req.files.length > 0) {
          for (const file of req.files) {
            const fileBuffer = await fs.readFile(file.path);
            const checksum = await generateChecksum(fileBuffer);
            
            file.uploadDate = new Date();
            file.checksum = checksum;
            
            processedFiles.push({
              fieldname: file.fieldname,
              originalname: file.originalname,
              size: file.size,
              mimetype: file.mimetype,
              destination: file.destination,
              filename: file.filename,
              path: file.path,
              uploadDate: file.uploadDate,
              checksum: file.checksum
            });
          }
        }
        
        req.uploadedFiles = processedFiles;
        next();
      } catch (error) {
        next(error);
      }
    });
  };
}

/**
 * Clean up uploaded files after processing
 * @param {string|string[]} filePaths - File path(s) to remove
 * @returns {Promise<void>}
 */
async function cleanupFiles(filePaths) {
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  
  for (const filePath of paths) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Log error but don't throw - cleanup failures shouldn't break the flow
      console.error(`Failed to cleanup file ${filePath}:`, error.message);
    }
  }
}

/**
 * Clean up temporary files after a specified delay
 * @param {string|string[]} filePaths - File path(s) to remove
 * @param {number} delayMs - Delay in milliseconds before cleanup
 * @returns {Promise<void>}
 */
async function cleanupFilesDelayed(filePaths, delayMs = 300000) { // Default: 5 minutes
  setTimeout(async () => {
    await cleanupFiles(filePaths);
  }, delayMs);
}

/**
 * Get file information without uploading
 * @param {Express.Request} req - Express request object
 * @returns {Object} File information
 */
function getFileInfo(req) {
  if (req.file) {
    return {
      single: req.uploadedFile,
      multiple: null
    };
  } else if (req.files) {
    return {
      single: null,
      multiple: req.uploadedFiles
    };
  }
  
  return {
    single: null,
    multiple: null
  };
}

module.exports = {
  // Upload configurations
  UPLOAD_CONFIGS,
  
  // Upload middleware functions
  singleFileUpload,
  multipleFileUpload,
  mixedUpload,
  
  // Utility functions
  createUploader,
  generateUniqueFilename,
  generateChecksum,
  validateFileType,
  cleanupFiles,
  cleanupFilesDelayed,
  getFileInfo,
  
  // Pre-configured uploaders for common use cases
  templateUpload: (fieldName = 'template', options = {}) => 
    singleFileUpload('template', fieldName, options),
  
  csvUpload: (fieldName = 'csv', options = {}) => 
    singleFileUpload('csv', fieldName, options),
  
  batchUpload: (fieldName = 'files', options = {}) => 
    multipleFileUpload('batch', fieldName, options),
  
  templateComparisonUpload: (options = {}) => 
    multipleFileUpload('template', 'templates', { ...options, maxFiles: 2 })
};
