const Joi = require('joi');

/**
 * @typedef {Object} ValidationError
 * @property {string} field - Field name that failed validation
 * @property {string} message - Error message
 * @property {string} type - Type of validation error
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether validation passed
 * @property {ValidationError[]} errors - Array of validation errors
 * @property {Object} value - Validated and sanitized data
 */

/**
 * File validation helper function
 */
function validateFile(file, allowedTypes, maxSize, fieldName) {
  if (!file) {
    throw new Error(`${fieldName} is required`);
  }
  
  if (file.size && file.size > maxSize) {
    throw new Error(`${fieldName} must be smaller than ${(maxSize / (1024 * 1024)).toFixed(1)}MB`);
  }
  
  if (file.mimetype && allowedTypes && !allowedTypes.includes(file.mimetype)) {
    throw new Error(`${fieldName} must be one of: ${allowedTypes.join(', ')}`);
  }
  
  return true;
}

/**
 * Common validation schemas used across multiple endpoints
 */
const commonSchemas = {
  /**
   * Email validation schema
   */
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .max(254)
    .trim()
    .lowercase()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'string.max': 'Email address is too long',
      'any.required': 'Email address is required'
    }),

  /**
   * Phone number validation schema
   */
  phone: Joi.string()
    .pattern(/^[\+]?[1-9][\d]{0,15}$/)
    .max(20)
    .trim()
    .optional()
    .messages({
      'string.pattern.base': 'Please provide a valid phone number',
      'string.max': 'Phone number is too long'
    }),

  /**
   * URL validation schema
   */
  url: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .max(2048)
    .trim()
    .optional()
    .messages({
      'string.uri': 'Please provide a valid URL',
      'string.max': 'URL is too long'
    }),

  /**
   * Date validation schema
   */
  date: Joi.date()
    .iso()
    .max('now')
    .optional()
    .messages({
      'date.format': 'Please provide a valid date in ISO format',
      'date.max': 'Date cannot be in the future'
    }),

  /**
   * Pagination parameters schema
   */
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(25),
    sortBy: Joi.string().valid('createdAt', 'updatedAt', 'name', 'size', 'downloads').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),

  /**
   * Search parameters schema
   */
  search: Joi.object({
    query: Joi.string().min(1).max(100).trim().optional(),
    category: Joi.string().max(50).trim().optional(),
    status: Joi.string().valid('active', 'draft', 'archived').optional(),
    dateFrom: Joi.date().iso().optional(),
    dateTo: Joi.date().iso().min(Joi.ref('dateFrom')).optional()
  })
};

/**
 * Template-related validation schemas
 */
const templateSchemas = {
  /**
   * Create template schema
   */
  create: Joi.object({
    name: Joi.string()
      .min(1)
      .max(100)
      .trim()
      .required()
      .messages({
        'string.min': 'Template name must be at least 1 character long',
        'string.max': 'Template name cannot exceed 100 characters',
        'any.required': 'Template name is required'
      }),

    description: Joi.string()
      .max(500)
      .trim()
      .optional()
      .allow('')
      .messages({
        'string.max': 'Description cannot exceed 500 characters'
      }),

    category: Joi.string()
      .max(50)
      .trim()
      .required()
      .messages({
        'string.max': 'Category cannot exceed 50 characters',
        'any.required': 'Category is required'
      }),

    tags: Joi.array()
      .items(Joi.string().max(30).trim())
      .max(10)
      .optional()
      .messages({
        'array.max': 'Cannot have more than 10 tags',
        'string.max': 'Each tag cannot exceed 30 characters'
      }),

    isPublic: Joi.boolean()
      .default(false)
      .optional(),

    metadata: Joi.object({
      author: Joi.string().max(100).trim().optional(),
      version: Joi.string().max(20).trim().optional(),
      language: Joi.string().max(10).trim().optional(),
      industry: Joi.string().max(50).trim().optional()
    }).optional()
  }),

  /**
   * Update template schema
   */
  update: Joi.object({
    name: Joi.string()
      .min(1)
      .max(100)
      .trim()
      .optional()
      .messages({
        'string.min': 'Template name must be at least 1 character long',
        'string.max': 'Template name cannot exceed 100 characters'
      }),

    description: Joi.string()
      .max(500)
      .trim()
      .optional()
      .allow(''),

    category: Joi.string()
      .max(50)
      .trim()
      .optional(),

    tags: Joi.array()
      .items(Joi.string().max(30).trim())
      .max(10)
      .optional(),

    isPublic: Joi.boolean()
      .optional(),

    status: Joi.string()
      .valid('active', 'draft', 'archived')
      .optional(),

    metadata: Joi.object({
      author: Joi.string().max(100).trim().optional(),
      version: Joi.string().max(20).trim().optional(),
      language: Joi.string().max(10).trim().optional(),
      industry: Joi.string().max(50).trim().optional()
    }).optional()
  }),

  /**
   * Template comparison schema
   */
  compare: Joi.object({
          template1: customJoi.fileUpload()
      .required()
      .size(10 * 1024 * 1024) // 10MB
      .type([
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/pdf',
        'text/plain',
        'application/msword'
      ])
      .messages({
        'file.required': 'First template is required',
        'file.size': 'First template must be smaller than 10MB',
        'file.mimetype': 'First template must be a DOCX, PDF, TXT, or DOC file'
      }),

          template2: customJoi.fileUpload()
      .required()
      .size(10 * 1024 * 1024) // 10MB
      .type([
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/pdf',
        'text/plain',
        'application/msword'
      ])
      .messages({
        'file.required': 'Second template is required',
        'file.size': 'Second template must be smaller than 10MB',
        'file.mimetype': 'Second template must be a DOCX, PDF, TXT, or DOC file'
      }),

    options: Joi.object({
      includePlaceholders: Joi.boolean().default(true),
      includeStructure: Joi.boolean().default(true),
      includeMetadata: Joi.boolean().default(true),
      includeComplexity: Joi.boolean().default(true)
    }).optional()
  }),

  /**
   * Template search and filter schema
   */
  search: Joi.object({
    ...commonSchemas.search.keys({
      category: Joi.string().max(50).trim().optional(),
      status: Joi.string().valid('active', 'draft', 'archived').optional(),
      author: Joi.string().max(100).trim().optional(),
      tags: Joi.array().items(Joi.string().max(30).trim()).optional(),
      fileType: Joi.string().valid('docx', 'pdf', 'txt', 'doc').optional(),
      sizeMin: Joi.number().positive().optional(),
      sizeMax: Joi.number().positive().min(Joi.ref('sizeMin')).optional()
    }),
    ...commonSchemas.pagination.keys({
      sortBy: Joi.string().valid('createdAt', 'updatedAt', 'name', 'size', 'downloads', 'rating').default('createdAt')
    })
  })
};

/**
 * Document generation validation schemas
 */
const documentSchemas = {
  /**
   * Generate document schema
   */
  generate: Joi.object({
    templateId: Joi.string()
      .alphanum()
      .length(24)
      .required()
      .messages({
        'string.alphanum': 'Template ID must contain only alphanumeric characters',
        'string.length': 'Template ID must be exactly 24 characters long',
        'any.required': 'Template ID is required'
      }),

    data: Joi.alternatives().try(
      Joi.object().pattern(/^[a-zA-Z0-9_]+$/, Joi.any()),
      Joi.array().items(Joi.object().pattern(/^[a-zA-Z0-9_]+$/, Joi.any()))
    ).required()
      .messages({
        'any.required': 'Data is required for document generation',
        'object.pattern': 'Data keys must contain only alphanumeric characters and underscores'
      }),

    options: Joi.object({
      format: Joi.string().valid('pdf', 'docx', 'txt').default('pdf'),
      quality: Joi.string().valid('low', 'medium', 'high').default('medium'),
      includeMetadata: Joi.boolean().default(true),
      watermark: Joi.string().max(100).trim().optional(),
      password: Joi.string().max(50).trim().optional()
    }).optional(),

    notification: Joi.object({
      email: commonSchemas.email.optional(),
      webhook: commonSchemas.url.optional()
    }).optional()
  }),

  /**
   * Batch document generation schema
   */
  batchGenerate: Joi.object({
    templateId: Joi.string()
      .alphanum()
      .length(24)
      .required(),

          csvFile: customJoi.fileUpload()
      .required()
      .size(5 * 1024 * 1024) // 5MB
      .type(['text/csv', 'text/plain', 'application/csv'])
      .messages({
        'file.required': 'CSV file is required for batch generation',
        'file.size': 'CSV file must be smaller than 5MB',
        'file.mimetype': 'CSV file must be a valid CSV or text file'
      }),

    mapping: Joi.object({
      // Dynamic mapping based on CSV headers
      // This will be validated dynamically
    }).optional(),

    options: Joi.object({
      format: Joi.string().valid('pdf', 'docx', 'txt').default('pdf'),
      quality: Joi.string().valid('low', 'medium', 'high').default('medium'),
      batchSize: Joi.number().integer().min(1).max(1000).default(100),
      parallelProcessing: Joi.boolean().default(true),
      includeMetadata: Joi.boolean().default(true)
    }).optional(),

    notification: Joi.object({
      email: commonSchemas.email.optional(),
      webhook: commonSchemas.url.optional(),
      progressUpdates: Joi.boolean().default(true)
    }).optional()
  }),

  /**
   * Document status query schema
   */
  status: Joi.object({
    jobId: Joi.string()
      .alphanum()
      .length(24)
      .required()
      .messages({
        'string.alphanum': 'Job ID must contain only alphanumeric characters',
        'string.length': 'Job ID must be exactly 24 characters long',
        'any.required': 'Job ID is required'
      })
  })
};

/**
 * User and authentication validation schemas
 */
const userSchemas = {
  /**
   * User registration schema
   */
  register: Joi.object({
    email: commonSchemas.email,
    
    password: Joi.string()
      .min(8)
      .max(128)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters long',
        'string.max': 'Password cannot exceed 128 characters',
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
        'any.required': 'Password is required'
      }),

    confirmPassword: Joi.string()
      .valid(Joi.ref('password'))
      .required()
      .messages({
        'any.only': 'Passwords do not match',
        'any.required': 'Please confirm your password'
      }),

    firstName: Joi.string()
      .min(1)
      .max(50)
      .trim()
      .required()
      .messages({
        'string.min': 'First name is required',
        'string.max': 'First name cannot exceed 50 characters',
        'any.required': 'First name is required'
      }),

    lastName: Joi.string()
      .min(1)
      .max(50)
      .trim()
      .required()
      .messages({
        'string.min': 'Last name is required',
        'string.max': 'Last name cannot exceed 50 characters',
        'any.required': 'Last name is required'
      }),

    company: Joi.string()
      .max(100)
      .trim()
      .optional()
      .allow(''),

    phone: commonSchemas.phone,

    acceptTerms: Joi.boolean()
      .valid(true)
      .required()
      .messages({
        'any.only': 'You must accept the terms and conditions',
        'any.required': 'You must accept the terms and conditions'
      })
  }),

  /**
   * User login schema
   */
  login: Joi.object({
    email: commonSchemas.email,
    
    password: Joi.string()
      .required()
      .messages({
        'any.required': 'Password is required'
      }),

    rememberMe: Joi.boolean()
      .default(false)
      .optional()
  }),

  /**
   * Password reset request schema
   */
  passwordResetRequest: Joi.object({
    email: commonSchemas.email
  }),

  /**
   * Password reset schema
   */
  passwordReset: Joi.object({
    token: Joi.string()
      .required()
      .messages({
        'any.required': 'Reset token is required'
      }),

    password: Joi.string()
      .min(8)
      .max(128)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters long',
        'string.max': 'Password cannot exceed 128 characters',
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
        'any.required': 'New password is required'
      }),

    confirmPassword: Joi.string()
      .valid(Joi.ref('password'))
      .required()
      .messages({
        'any.only': 'Passwords do not match',
        'any.required': 'Please confirm your new password'
      })
  })
};

/**
 * Category management validation schemas
 */
const categorySchemas = {
  /**
   * Create category schema
   */
  create: Joi.object({
    name: Joi.string()
      .min(1)
      .max(50)
      .trim()
      .required()
      .messages({
        'string.min': 'Category name must be at least 1 character long',
        'string.max': 'Category name cannot exceed 50 characters',
        'any.required': 'Category name is required'
      }),

    description: Joi.string()
      .max(200)
      .trim()
      .optional()
      .allow('')
      .messages({
        'string.max': 'Description cannot exceed 200 characters'
      }),

    color: Joi.string()
      .pattern(/^#[0-9A-F]{6}$/i)
      .optional()
      .messages({
        'string.pattern.base': 'Color must be a valid hex color code (e.g., #FF0000)'
      }),

    parentId: Joi.string()
      .alphanum()
      .length(24)
      .optional()
      .allow(null)
      .messages({
        'string.alphanum': 'Parent category ID must contain only alphanumeric characters',
        'string.length': 'Parent category ID must be exactly 24 characters long'
      }),

    isActive: Joi.boolean()
      .default(true)
      .optional()
  }),

  /**
   * Update category schema
   */
  update: Joi.object({
    name: Joi.string()
      .min(1)
      .max(50)
      .trim()
      .optional(),

    description: Joi.string()
      .max(200)
      .trim()
      .optional()
      .allow(''),

    color: Joi.string()
      .pattern(/^#[0-9A-F]{6}$/i)
      .optional(),

    parentId: Joi.string()
      .alphanum()
      .length(24)
      .optional()
      .allow(null),

    isActive: Joi.boolean()
      .optional()
  })
};

/**
 * Webhook and notification validation schemas
 */
const webhookSchemas = {
  /**
   * Webhook configuration schema
   */
  webhook: Joi.object({
    url: commonSchemas.url.required(),
    
    events: Joi.array()
      .items(Joi.string().valid('document.generated', 'document.failed', 'batch.completed', 'batch.failed'))
      .min(1)
      .required()
      .messages({
        'array.min': 'At least one webhook event must be selected',
        'any.required': 'Webhook events are required'
      }),

    secret: Joi.string()
      .min(16)
      .max(128)
      .optional()
      .messages({
        'string.min': 'Webhook secret must be at least 16 characters long',
        'string.max': 'Webhook secret cannot exceed 128 characters'
      }),

    isActive: Joi.boolean()
      .default(true)
      .optional(),

    retryCount: Joi.number()
      .integer()
      .min(0)
      .max(5)
      .default(3)
      .optional()
      .messages({
        'number.min': 'Retry count cannot be negative',
        'number.max': 'Retry count cannot exceed 5'
      })
  })
};

/**
 * Validation middleware factory
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} source - Source of data to validate ('body', 'query', 'params')
 * @returns {Function} Express middleware function
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source];
    
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: 'Please check your input and try again',
        details: validationErrors
      });
    }

    // Replace request data with validated data
    req[source] = value;
    next();
  };
}

/**
 * File validation middleware
 * @param {Object} options - Validation options
 * @returns {Function} Express middleware function
 */
function validateFiles(options = {}) {
  return (req, res, next) => {
    const { required = [], maxFiles = 10, allowedTypes = [] } = options;
    
    // Check if files exist
    if (required.length > 0 && (!req.files && !req.file)) {
      return res.status(400).json({
        success: false,
        error: 'Files required',
        message: `The following files are required: ${required.join(', ')}`
      });
    }

    // Check required files
    if (required.length > 0) {
      const uploadedFiles = req.files || (req.file ? [req.file] : []);
      const uploadedFieldNames = uploadedFiles.map(f => f.fieldname);
      
      for (const requiredField of required) {
        if (!uploadedFieldNames.includes(requiredField)) {
          return res.status(400).json({
            success: false,
            error: 'Missing required file',
            message: `File '${requiredField}' is required`
          });
        }
      }
    }

    // Check file count
    if (req.files && req.files.length > maxFiles) {
      return res.status(400).json({
        success: false,
        error: 'Too many files',
        message: `Maximum ${maxFiles} files allowed`
      });
    }

    // Check file types if specified
    if (allowedTypes.length > 0) {
      const uploadedFiles = req.files || (req.file ? [req.file] : []);
      
      for (const file of uploadedFiles) {
        if (!allowedTypes.includes(file.mimetype)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid file type',
            message: `File '${file.originalname}' has an unsupported type. Allowed types: ${allowedTypes.join(', ')}`
          });
        }
      }
    }

    next();
  };
}

module.exports = {
  // Validation schemas
  schemas: {
    common: commonSchemas,
    template: templateSchemas,
    document: documentSchemas,
    user: userSchemas,
    category: categorySchemas,
    webhook: webhookSchemas
  },

  // Validation middleware
  validate,
  validateFiles,

  // Pre-configured validation middleware for common use cases
  validateTemplateCreate: validate(templateSchemas.create),
  validateTemplateUpdate: validate(templateSchemas.update),
  validateTemplateSearch: validate(templateSchemas.search, 'query'),
  validateDocumentGenerate: validate(documentSchemas.generate),
  validateBatchGenerate: validate(documentSchemas.batchGenerate),
  validateUserRegister: validate(userSchemas.register),
  validateUserLogin: validate(userSchemas.login),
  validateCategoryCreate: validate(categorySchemas.create),
  validateCategoryUpdate: validate(categorySchemas.update),
  validateWebhook: validate(webhookSchemas.webhook)
};
