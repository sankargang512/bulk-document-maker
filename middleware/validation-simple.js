const Joi = require('joi');

/**
 * Simple validation schemas for the API
 */

// Template upload validation
const validateTemplateUpload = (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Template file is required'
      });
    }

    // Validate file type
    const allowedTypes = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/pdf'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type. Only .docx, .doc, and .pdf files are allowed'
      });
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        error: 'File size too large. Maximum size is 10MB'
      });
    }

    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'File validation failed: ' + error.message
    });
  }
};

// Template comparison validation
const validateTemplateComparison = (req, res, next) => {
  try {
    if (!req.files || !req.files.template1 || !req.files.template2) {
      return res.status(400).json({
        success: false,
        error: 'Two template files are required for comparison'
      });
    }

    const template1 = req.files.template1[0];
    const template2 = req.files.template2[0];

    // Validate both files
    const allowedTypes = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/pdf'];
    const maxSize = 10 * 1024 * 1024;

    if (!allowedTypes.includes(template1.mimetype) || !allowedTypes.includes(template2.mimetype)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type. Only .docx, .doc, and .pdf files are allowed'
      });
    }

    if (template1.size > maxSize || template2.size > maxSize) {
      return res.status(400).json({
        success: false,
        error: 'File size too large. Maximum size is 10MB per file'
      });
    }

    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'Template comparison validation failed: ' + error.message
    });
  }
};

// CSV file validation
const validateCSVFile = (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'CSV file is required'
      });
    }

    // Validate file type
    if (req.file.mimetype !== 'text/csv' && !req.file.originalname.endsWith('.csv')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type. Only CSV files are allowed'
      });
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        error: 'File size too large. Maximum size is 5MB'
      });
    }

    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'CSV validation failed: ' + error.message
    });
  }
};

// Document generation validation
const validateDocumentGenerate = (req, res, next) => {
  try {
    // Validate files
    if (!req.files || !req.files.template || !req.files.csv) {
      return res.status(400).json({
        success: false,
        error: 'Template and CSV files are required'
      });
    }

    const template = req.files.template[0];
    const csv = req.files.csv[0];

    // Validate template file
    const allowedTemplateTypes = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/pdf'];
    if (!allowedTemplateTypes.includes(template.mimetype)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid template format. Only .docx, .doc, and .pdf files are allowed'
      });
    }

    // Validate CSV file
    if (csv.mimetype !== 'text/csv' && !csv.originalname.endsWith('.csv')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid CSV format. Only CSV files are allowed'
      });
    }

    // Validate file sizes
    const maxTemplateSize = 10 * 1024 * 1024; // 10MB
    const maxCSVSize = 5 * 1024 * 1024; // 5MB
    
    if (template.size > maxTemplateSize) {
      return res.status(400).json({
        success: false,
        error: 'Template file too large. Maximum size is 10MB'
      });
    }
    
    if (csv.size > maxCSVSize) {
      return res.status(400).json({
        success: false,
        error: 'CSV file too large. Maximum size is 5MB'
      });
    }

    // Validate request body
    const { outputFormat, email, customFields } = req.body;
    
    if (!outputFormat || !['pdf', 'docx', 'both'].includes(outputFormat)) {
      return res.status(400).json({
        success: false,
        error: 'Valid output format required: pdf, docx, or both'
      });
    }

    // Validate email if provided
    if (email) {
      const emailSchema = Joi.string().email();
      const { error } = emailSchema.validate(email);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }
    }

    // Validate custom fields if provided
    if (customFields) {
      try {
        const parsed = JSON.parse(customFields);
        if (typeof parsed !== 'object' || parsed === null) {
          return res.status(400).json({
            success: false,
            error: 'Custom fields must be a valid JSON object'
          });
        }
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid custom fields JSON format'
        });
      }
    }

    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'Document generation validation failed: ' + error.message
    });
  }
};

// Batch document generation validation
const validateBatchGenerate = (req, res, next) => {
  try {
    // Validate files
    if (!req.files || !req.files.templates || !req.files.csv) {
      return res.status(400).json({
        success: false,
        error: 'Templates and CSV files are required'
      });
    }

    const templates = req.files.templates;
    const csv = req.files.csv[0];

    // Validate templates
    if (templates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one template file is required'
      });
    }

    if (templates.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 template files allowed'
      });
    }

    const allowedTemplateTypes = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/pdf'];
    const maxTemplateSize = 10 * 1024 * 1024; // 10MB

    for (const template of templates) {
      if (!allowedTemplateTypes.includes(template.mimetype)) {
        return res.status(400).json({
          success: false,
          error: `Invalid template format for ${template.originalname}. Only .docx, .doc, and .pdf files are allowed`
        });
      }

      if (template.size > maxTemplateSize) {
        return res.status(400).json({
          success: false,
          error: `Template file ${template.originalname} too large. Maximum size is 10MB`
        });
      }
    }

    // Validate CSV file
    if (csv.mimetype !== 'text/csv' && !csv.originalname.endsWith('.csv')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid CSV format. Only CSV files are allowed'
      });
    }

    const maxCSVSize = 5 * 1024 * 1024; // 5MB
    if (csv.size > maxCSVSize) {
      return res.status(400).json({
        success: false,
        error: 'CSV file too large. Maximum size is 5MB'
      });
    }

    // Validate request body
    const { outputFormat, email, customFields, parallel, maxConcurrent, includeComparison } = req.body;
    
    if (!outputFormat || !['pdf', 'docx', 'both'].includes(outputFormat)) {
      return res.status(400).json({
        success: false,
        error: 'Valid output format required: pdf, docx, or both'
      });
    }

    // Validate email if provided
    if (email) {
      const emailSchema = Joi.string().email();
      const { error } = emailSchema.validate(email);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }
    }

    // Validate custom fields if provided
    if (customFields) {
      try {
        const parsed = JSON.parse(customFields);
        if (typeof parsed !== 'object' || parsed === null) {
          return res.status(400).json({
            success: false,
            error: 'Custom fields must be a valid JSON object'
          });
        }
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid custom fields JSON format'
        });
      }
    }

    // Validate parallel processing options
    if (parallel !== undefined && typeof parallel !== 'boolean' && parallel !== 'true' && parallel !== 'false') {
      return res.status(400).json({
        success: false,
        error: 'Parallel option must be a boolean or string "true"/"false"'
      });
    }

    if (maxConcurrent !== undefined) {
      const concurrent = parseInt(maxConcurrent);
      if (isNaN(concurrent) || concurrent < 1 || concurrent > 20) {
        return res.status(400).json({
          success: false,
          error: 'Max concurrent must be a number between 1 and 20'
        });
      }
    }

    if (includeComparison !== undefined && typeof includeComparison !== 'boolean' && includeComparison !== 'true' && includeComparison !== 'false') {
      return res.status(400).json({
        success: false,
        error: 'Include comparison option must be a boolean or string "true"/"false"'
      });
    }

    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'Batch document generation validation failed: ' + error.message
    });
  }
};

// Files validation middleware
const validateFiles = (options = {}) => {
  return (req, res, next) => {
    try {
      const { required = [], maxSize = 5 * 1024 * 1024, allowedTypes = [] } = options;

      // Check if files exist
      if (!req.files) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded'
        });
      }

      // Check required files
      for (const field of required) {
        if (!req.files[field] || req.files[field].length === 0) {
          return res.status(400).json({
            success: false,
            error: `Required file field '${field}' is missing`
          });
        }
      }

      // Validate all files
      for (const [field, files] of Object.entries(req.files)) {
        for (const file of files) {
          // Check file size
          if (file.size > maxSize) {
            return res.status(400).json({
              success: false,
              error: `File ${file.originalname} is too large. Maximum size is ${Math.round(maxSize / (1024 * 1024))}MB`
            });
          }

          // Check file type if specified
          if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
            return res.status(400).json({
              success: false,
              error: `File ${file.originalname} has invalid type. Allowed types: ${allowedTypes.join(', ')}`
            });
          }
        }
      }

      next();
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'File validation failed: ' + error.message
      });
    }
  };
};

// Batch ID validation
const validateBatchId = (req, res, next) => {
  try {
    const { batchId } = req.params;
    
    if (!batchId) {
      return res.status(400).json({
        success: false,
        error: 'Batch ID is required'
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(batchId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid batch ID format'
      });
    }

    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'Batch ID validation failed: ' + error.message
    });
  }
};

// Document ID validation
const validateDocumentId = (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Document ID is required'
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid document ID format'
      });
    }

    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'Document ID validation failed: ' + error.message
    });
  }
};

// Pagination validation
const validatePagination = (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        error: 'Page must be a positive number'
      });
    }
    
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be a number between 1 and 100'
      });
    }

    // Add validated values to request
    req.validatedPagination = {
      page: pageNum,
      limit: limitNum,
      offset: (pageNum - 1) * limitNum
    };

    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'Pagination validation failed: ' + error.message
    });
  }
};

// Search query validation
const validateSearchQuery = (req, res, next) => {
  try {
    const { query } = req.params;
    
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }
    
    if (query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters long'
      });
    }
    
    if (query.trim().length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Search query too long. Maximum 100 characters allowed'
      });
    }

    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'Search query validation failed: ' + error.message
    });
  }
};

module.exports = {
  validateTemplateUpload,
  validateTemplateComparison,
  validateCSVFile,
  validateDocumentGenerate,
  validateBatchGenerate,
  validateFiles,
  validateBatchId,
  validateDocumentId,
  validatePagination,
  validateSearchQuery
};
