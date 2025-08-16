const logger = require('../services/loggingService');

/**
 * @typedef {Object} ErrorDetail
 * @property {string} field - Field name that caused the error
 * @property {string} message - Error message
 * @property {string} code - Error code for client handling
 */

/**
 * @typedef {Object} ApiError
 * @property {string} name - Error name
 * @property {string} message - Error message
 * @property {number} statusCode - HTTP status code
 * @property {string} code - Error code for client handling
 * @property {ErrorDetail[]} details - Detailed error information
 * @property {boolean} isOperational - Whether this is an operational error
 * @property {Date} timestamp - When the error occurred
 * @property {string} requestId - Unique request identifier
 * @property {string} path - Request path
 * @property {string} method - HTTP method
 */

/**
 * Base error class for API errors
 */
class ApiError extends Error {
  /**
   * Create a new API error
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Error code
   * @param {ErrorDetail[]} details - Error details
   * @param {boolean} isOperational - Whether this is an operational error
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = [], isOperational = true) {
    super(message);
    
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    this.timestamp = new Date();
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error class
 */
class ValidationError extends ApiError {
  constructor(message = 'Validation failed', details = []) {
    super(message, 400, 'VALIDATION_ERROR', details, true);
  }
}

/**
 * File upload error class
 */
class FileUploadError extends ApiError {
  constructor(message = 'File upload failed', details = []) {
    super(message, 400, 'FILE_UPLOAD_ERROR', details, true);
  }
}

/**
 * Authentication error class
 */
class AuthenticationError extends ApiError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR', [], true);
  }
}

/**
 * Authorization error class
 */
class AuthorizationError extends ApiError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR', [], true);
  }
}

/**
 * Not found error class
 */
class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND_ERROR', [], true);
  }
}

/**
 * Conflict error class
 */
class ConflictError extends ApiError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR', [], true);
  }
}

/**
 * Rate limit error class
 */
class RateLimitError extends ApiError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_ERROR', [], true);
  }
}

/**
 * Service unavailable error class
 */
class ServiceUnavailableError extends ApiError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE_ERROR', [], true);
  }
}

/**
 * Database error class
 */
class DatabaseError extends ApiError {
  constructor(message = 'Database operation failed', details = []) {
    super(message, 500, 'DATABASE_ERROR', details, true);
  }
}

/**
 * External service error class
 */
class ExternalServiceError extends ApiError {
  constructor(message = 'External service error', details = []) {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR', details, true);
  }
}

/**
 * File processing error class
 */
class FileProcessingError extends ApiError {
  constructor(message = 'File processing failed', details = []) {
    super(message, 422, 'FILE_PROCESSING_ERROR', details, true);
  }
}

/**
 * Job queue error class
 */
class JobQueueError extends ApiError {
  constructor(message = 'Job queue operation failed', details = []) {
    super(message, 500, 'JOB_QUEUE_ERROR', details, true);
  }
}

/**
 * Generate a unique request ID
 * @returns {string} Unique request identifier
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sanitize error details for client response
 * @param {ErrorDetail[]} details - Error details
 * @returns {ErrorDetail[]} Sanitized error details
 */
function sanitizeErrorDetails(details) {
  return details.map(detail => ({
    field: detail.field,
    message: detail.message,
    code: detail.code
  }));
}

/**
 * Create error response object
 * @param {ApiError} error - API error object
 * @param {string} requestId - Request identifier
 * @param {string} path - Request path
 * @param {string} method - HTTP method
 * @returns {Object} Error response object
 */
function createErrorResponse(error, requestId, path, method) {
  const response = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      timestamp: error.timestamp.toISOString(),
      requestId: requestId,
      path: path,
      method: method
    }
  };

  // Add details if they exist
  if (error.details && error.details.length > 0) {
    response.error.details = sanitizeErrorDetails(error.details);
  }

  // Add help information for common errors
  if (error.code === 'VALIDATION_ERROR') {
    response.error.help = 'Please check your input and try again';
  } else if (error.code === 'FILE_UPLOAD_ERROR') {
    response.error.help = 'Please check file format and size requirements';
  } else if (error.code === 'AUTHENTICATION_ERROR') {
    response.error.help = 'Please provide valid authentication credentials';
  } else if (error.code === 'RATE_LIMIT_ERROR') {
    response.error.help = 'Please wait before making another request';
  }

  return response;
}

/**
 * Log error information
 * @param {Error} error - Error object
 * @param {string} requestId - Request identifier
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function logError(error, requestId, req, res) {
  const logData = {
    requestId: requestId,
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      statusCode: error.statusCode || 500,
      stack: error.stack
    },
    request: {
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      params: req.params,
      headers: {
        'user-agent': req.get('User-Agent'),
        'content-type': req.get('Content-Type'),
        'content-length': req.get('Content-Length'),
        'authorization': req.get('Authorization') ? '[REDACTED]' : undefined
      },
      ip: req.ip || req.connection.remoteAddress,
      userId: req.user?.id || 'anonymous'
    },
    response: {
      statusCode: res.statusCode,
      responseTime: Date.now() - req.startTime
    }
  };

  // Log based on error type
  if (error.isOperational) {
    logger.warn('Operational error occurred', logData);
  } else {
    logger.error('System error occurred', logData);
  }
}

/**
 * Handle multer file upload errors
 * @param {Error} error - Multer error
 * @returns {ApiError} API error object
 */
function handleMulterError(error) {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return new FileUploadError('File size exceeds limit', [{
      field: 'file',
      message: 'File size exceeds the maximum allowed limit',
      code: 'FILE_TOO_LARGE'
    }]);
  }
  
  if (error.code === 'LIMIT_FILE_COUNT') {
    return new FileUploadError('Too many files', [{
      field: 'files',
      message: 'Number of files exceeds the maximum allowed limit',
      code: 'TOO_MANY_FILES'
    }]);
  }
  
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return new FileUploadError('Unexpected file field', [{
      field: error.field,
      message: 'Unexpected file field in request',
      code: 'UNEXPECTED_FILE_FIELD'
    }]);
  }
  
  return new FileUploadError('File upload failed', [{
    field: 'file',
    message: error.message,
    code: 'UPLOAD_FAILED'
  }]);
}

/**
 * Handle Joi validation errors
 * @param {Error} error - Joi validation error
 * @returns {ValidationError} Validation error object
 */
function handleJoiError(error) {
  const details = error.details.map(detail => ({
    field: detail.path.join('.'),
    message: detail.message,
    code: `VALIDATION_${detail.type.toUpperCase()}`
  }));
  
  return new ValidationError('Validation failed', details);
}

/**
 * Handle MongoDB errors
 * @param {Error} error - MongoDB error
 * @returns {ApiError} API error object
 */
function handleMongoError(error) {
  if (error.name === 'ValidationError') {
    const details = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message,
      code: 'MONGO_VALIDATION_ERROR'
    }));
    return new ValidationError('Database validation failed', details);
  }
  
  if (error.name === 'CastError') {
    return new ValidationError('Invalid ID format', [{
      field: error.path,
      message: 'Invalid ID format provided',
      code: 'INVALID_ID_FORMAT'
    }]);
  }
  
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    return new ConflictError('Duplicate entry', [{
      field: field,
      message: `${field} already exists`,
      code: 'DUPLICATE_ENTRY'
    }]);
  }
  
  return new DatabaseError('Database operation failed', [{
    field: 'database',
    message: error.message,
    code: 'DATABASE_OPERATION_FAILED'
  }]);
}

/**
 * Handle file system errors
 * @param {Error} error - File system error
 * @returns {ApiError} API error object
 */
function handleFileSystemError(error) {
  if (error.code === 'ENOENT') {
    return new NotFoundError('File not found', [{
      field: 'file',
      message: 'The requested file does not exist',
      code: 'FILE_NOT_FOUND'
    }]);
  }
  
  if (error.code === 'EACCES') {
    return new AuthorizationError('File access denied', [{
      field: 'file',
      message: 'Access to the file is denied',
      code: 'FILE_ACCESS_DENIED'
    }]);
  }
  
  if (error.code === 'ENOSPC') {
    return new ServiceUnavailableError('Storage space full', [{
      field: 'storage',
      message: 'Storage space is full',
      code: 'STORAGE_FULL'
    }]);
  }
  
  return new FileProcessingError('File operation failed', [{
    field: 'file',
    message: error.message,
    code: 'FILE_OPERATION_FAILED'
  }]);
}

/**
 * Main error handling middleware
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function errorHandler(error, req, res, next) {
  // Generate request ID if not exists
  const requestId = req.requestId || generateRequestId();
  req.requestId = requestId;
  
  // Set request start time for response time calculation
  if (!req.startTime) {
    req.startTime = Date.now();
  }
  
  let apiError;
  
  // Convert different error types to ApiError
  if (error instanceof ApiError) {
    apiError = error;
  } else if (error.name === 'MulterError') {
    apiError = handleMulterError(error);
  } else if (error.name === 'ValidationError' && error.isJoi) {
    apiError = handleJoiError(error);
  } else if (error.name === 'ValidationError' || error.name === 'CastError' || error.code === 11000) {
    apiError = handleMongoError(error);
  } else if (error.code && ['ENOENT', 'EACCES', 'ENOSPC'].includes(error.code)) {
    apiError = handleFileSystemError(error);
  } else {
    // Generic error handling
    apiError = new ApiError(
      error.message || 'An unexpected error occurred',
      error.statusCode || 500,
      'INTERNAL_ERROR',
      [],
      false
    );
  }
  
  // Set response status code
  res.status(apiError.statusCode);
  
  // Create error response
  const errorResponse = createErrorResponse(apiError, requestId, req.path, req.method);
  
  // Log the error
  logError(apiError, requestId, req, res);
  
  // Send error response
  res.json(errorResponse);
}

/**
 * 404 handler for undefined routes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function notFoundHandler(req, res) {
  const requestId = req.requestId || generateRequestId();
  req.requestId = requestId;
  
  const error = new NotFoundError(`Route ${req.method} ${req.path} not found`);
  
  res.status(404);
  const errorResponse = createErrorResponse(error, requestId, req.path, req.method);
  
  logger.warn('Route not found', {
    requestId: requestId,
    method: req.method,
    path: req.path,
    url: req.url
  });
  
  res.json(errorResponse);
}

/**
 * Request ID middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function requestIdMiddleware(req, res, next) {
  req.requestId = req.get('X-Request-ID') || generateRequestId();
  req.startTime = Date.now();
  
  // Add request ID to response headers
  res.set('X-Request-ID', req.requestId);
  
  next();
}

/**
 * Async error wrapper for route handlers
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function that catches async errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Error boundary for unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason,
    promise: promise,
    stack: reason?.stack
  });
  
  // In production, you might want to exit the process
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

/**
 * Error boundary for uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  
  // Always exit for uncaught exceptions
  process.exit(1);
});

module.exports = {
  // Error classes
  ApiError,
  ValidationError,
  FileUploadError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServiceUnavailableError,
  DatabaseError,
  ExternalServiceError,
  FileProcessingError,
  JobQueueError,
  
  // Middleware functions
  errorHandler,
  notFoundHandler,
  requestIdMiddleware,
  asyncHandler,
  
  // Utility functions
  generateRequestId,
  createErrorResponse,
  sanitizeErrorDetails,
  logError,
  
  // Error handlers for specific error types
  handleMulterError,
  handleJoiError,
  handleMongoError,
  handleFileSystemError
};
