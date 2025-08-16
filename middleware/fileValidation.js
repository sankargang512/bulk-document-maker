const fs = require('fs');
const path = require('path');
const loggingService = require('../services/loggingService');

/**
 * File Validation Middleware
 * Implements comprehensive file validation including magic number checking
 */

// Magic number signatures for common file types
const MAGIC_NUMBERS = {
  // Document formats
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    signature: [0x50, 0x4B, 0x03, 0x04], // ZIP file signature
    extension: '.docx',
    description: 'Microsoft Word Document (DOCX)'
  },
  'application/msword': {
    signature: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], // Compound File Binary
    extension: '.doc',
    description: 'Microsoft Word Document (DOC)'
  },
  'application/pdf': {
    signature: [0x25, 0x50, 0x44, 0x46], // %PDF
    extension: '.pdf',
    description: 'Portable Document Format (PDF)'
  },
  'text/csv': {
    signature: null, // CSV files don't have a specific magic number
    extension: '.csv',
    description: 'Comma-Separated Values (CSV)',
    validateAsText: true
  },
  'text/plain': {
    signature: null,
    extension: '.txt',
    description: 'Plain Text File',
    validateAsText: true
  }
};

// Allowed file extensions for each type
const ALLOWED_EXTENSIONS = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'application/pdf': ['.pdf'],
  'text/csv': ['.csv'],
  'text/plain': ['.txt']
};

// File size limits (in bytes)
const FILE_SIZE_LIMITS = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 10 * 1024 * 1024, // 10MB
  'application/msword': 10 * 1024 * 1024, // 10MB
  'application/pdf': 10 * 1024 * 1024, // 10MB
  'text/csv': 5 * 1024 * 1024, // 5MB
  'text/plain': 5 * 1024 * 1024 // 5MB
};

/**
 * Check if file signature matches expected magic number
 * @param {Buffer} buffer - File buffer
 * @param {Array} expectedSignature - Expected magic number bytes
 * @returns {boolean} - True if signature matches
 */
const checkMagicNumber = (buffer, expectedSignature) => {
  if (!expectedSignature || expectedSignature.length === 0) {
    return true; // No signature to check
  }

  if (buffer.length < expectedSignature.length) {
    return false;
  }

  for (let i = 0; i < expectedSignature.length; i++) {
    if (buffer[i] !== expectedSignature[i]) {
      return false;
    }
  }

  return true;
};

/**
 * Validate file content by reading first few bytes
 * @param {string} filePath - Path to the file
 * @param {string} expectedMimeType - Expected MIME type
 * @returns {Promise<Object>} - Validation result
 */
const validateFileContent = async (filePath, expectedMimeType) => {
  try {
    const fileInfo = MAGIC_NUMBERS[expectedMimeType];
    
    if (!fileInfo) {
      return {
        isValid: false,
        error: `Unsupported MIME type: ${expectedMimeType}`,
        allowedTypes: Object.keys(MAGIC_NUMBERS)
      };
    }

    // Read first 8 bytes for magic number checking
    const buffer = Buffer.alloc(8);
    const fd = await fs.promises.open(filePath, 'r');
    await fd.read(buffer, 0, 8, 0);
    await fd.close();

    // Check magic number if signature exists
    if (fileInfo.signature) {
      const signatureMatches = checkMagicNumber(buffer, fileInfo.signature);
      if (!signatureMatches) {
        return {
          isValid: false,
          error: `File content does not match expected format for ${fileInfo.description}`,
          expectedSignature: fileInfo.signature,
          actualBytes: Array.from(buffer.slice(0, fileInfo.signature.length))
        };
      }
    }

    // For text files, validate content structure
    if (fileInfo.validateAsText) {
      const content = await fs.promises.readFile(filePath, 'utf8');
      if (expectedMimeType === 'text/csv') {
        // Basic CSV validation
        const lines = content.split('\n');
        if (lines.length < 2) {
          return {
            isValid: false,
            error: 'CSV file must contain at least a header row and one data row'
          };
        }
        
        const headerColumns = lines[0].split(',').length;
        for (let i = 1; i < Math.min(lines.length, 10); i++) { // Check first 10 rows
          if (lines[i].trim() && lines[i].split(',').length !== headerColumns) {
            return {
              isValid: false,
              error: `CSV row ${i + 1} has ${lines[i].split(',').length} columns, expected ${headerColumns}`
            };
          }
        }
      }
    }

    return {
      isValid: true,
      mimeType: expectedMimeType,
      description: fileInfo.description,
      extension: fileInfo.extension
    };

  } catch (error) {
    loggingService.error('File content validation failed', {
      filePath,
      expectedMimeType,
      error: error.message
    });

    return {
      isValid: false,
      error: `File validation failed: ${error.message}`
    };
  }
};

/**
 * Comprehensive file validation middleware
 * @param {Object} options - Validation options
 * @returns {Function} - Express middleware function
 */
const createFileValidationMiddleware = (options = {}) => {
  const {
    allowedMimeTypes = Object.keys(MAGIC_NUMBERS),
    maxFileSize = 10 * 1024 * 1024, // 10MB default
    requireMagicNumberCheck = true,
    validateContent = true
  } = options;

  return async (req, res, next) => {
    try {
      if (!req.files && !req.file) {
        return next();
      }

      const files = req.files ? Object.values(req.files).flat() : [req.file];
      const validationResults = [];

      for (const file of files) {
        if (!file) continue;

        // Check file size
        if (file.size > maxFileSize) {
          return res.status(400).json({
            success: false,
            error: `File ${file.originalname} exceeds maximum size limit`,
            maxSize: `${Math.round(maxFileSize / (1024 * 1024))}MB`,
            actualSize: `${Math.round(file.size / (1024 * 1024))}MB`
          });
        }

        // Check MIME type
        if (!allowedMimeTypes.includes(file.mimetype)) {
          return res.status(400).json({
            success: false,
            error: `File type ${file.mimetype} is not allowed`,
            allowedTypes: allowedMimeTypes,
            fileName: file.originalname
          });
        }

        // Check file extension
        const fileExtension = path.extname(file.originalname).toLowerCase();
        const allowedExtensions = ALLOWED_EXTENSIONS[file.mimetype] || [];
        
        if (allowedExtensions.length > 0 && !allowedExtensions.includes(fileExtension)) {
          return res.status(400).json({
            success: false,
            error: `File extension ${fileExtension} is not allowed for ${file.mimetype}`,
            allowedExtensions,
            fileName: file.originalname
          });
        }

        // Content validation (magic number + structure)
        if (validateContent) {
          const contentValidation = await validateFileContent(file.path, file.mimetype);
          if (!contentValidation.isValid) {
            return res.status(400).json({
              success: false,
              error: `File content validation failed: ${contentValidation.error}`,
              fileName: file.originalname,
              details: contentValidation
            });
          }
        }

        // Log successful validation
        loggingService.info('File validation passed', {
          fileName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          requestId: req.requestId
        });

        validationResults.push({
          fileName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          isValid: true
        });
      }

      // Add validation results to request for downstream use
      req.fileValidationResults = validationResults;
      next();

    } catch (error) {
      loggingService.error('File validation middleware error', {
        error: error.message,
        stack: error.stack,
        requestId: req.requestId
      });

      return res.status(500).json({
        success: false,
        error: 'File validation failed',
        requestId: req.requestId
      });
    }
  };
};

/**
 * Specific validation middleware for document templates
 */
const validateTemplateFiles = createFileValidationMiddleware({
  allowedMimeTypes: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/pdf'
  ],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  validateContent: true
});

/**
 * Specific validation middleware for CSV files
 */
const validateCSVFiles = createFileValidationMiddleware({
  allowedMimeTypes: ['text/csv', 'text/plain'],
  maxFileSize: 5 * 1024 * 1024, // 5MB
  validateContent: true
});

/**
 * Specific validation middleware for batch uploads
 */
const validateBatchFiles = createFileValidationMiddleware({
  allowedMimeTypes: Object.keys(MAGIC_NUMBERS),
  maxFileSize: 50 * 1024 * 1024, // 50MB
  validateContent: true
});

module.exports = {
  validateFileContent,
  checkMagicNumber,
  createFileValidationMiddleware,
  validateTemplateFiles,
  validateCSVFiles,
  validateBatchFiles,
  MAGIC_NUMBERS,
  ALLOWED_EXTENSIONS,
  FILE_SIZE_LIMITS
};
