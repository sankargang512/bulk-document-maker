// Response utility functions for consistent API responses

/**
 * Send a successful response
 * @param {Object} res - Express response object
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 * @param {*} data - Response data
 * @param {Object} meta - Additional metadata
 */
function success(res, message = 'Success', statusCode = 200, data = null, meta = {}) {
  const response = {
    success: true,
    message,
    timestamp: new Date().toISOString(),
    ...meta
  };

  if (data !== null) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
}

/**
 * Send an error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {string} details - Additional error details
 * @param {*} debug - Debug information (only in development)
 */
function error(res, message = 'An error occurred', statusCode = 500, details = null, debug = null) {
  const response = {
    success: false,
    error: {
      message,
      statusCode,
      timestamp: new Date().toISOString()
    }
  };

  if (details) {
    response.error.details = details;
  }

  // Include debug information only in development
  if (process.env.NODE_ENV === 'development' && debug) {
    response.error.debug = debug;
  }

  return res.status(statusCode).json(response);
}

/**
 * Send a validation error response
 * @param {Object} res - Express response object
 * @param {Object} errors - Validation errors object
 * @param {string} message - Error message (default: 'Validation failed')
 */
function validationError(res, errors, message = 'Validation failed') {
  return error(res, message, 400, {
    type: 'validation_error',
    errors: errors
  });
}

/**
 * Send a not found response
 * @param {Object} res - Express response object
 * @param {string} resource - Resource name (default: 'Resource')
 * @param {string} message - Custom message
 */
function notFound(res, resource = 'Resource', message = null) {
  const defaultMessage = `${resource} not found`;
  return error(res, message || defaultMessage, 404);
}

/**
 * Send an unauthorized response
 * @param {Object} res - Express response object
 * @param {string} message - Error message (default: 'Unauthorized')
 */
function unauthorized(res, message = 'Unauthorized') {
  return error(res, message, 401);
}

/**
 * Send a forbidden response
 * @param {Object} res - Express response object
 * @param {string} message - Error message (default: 'Forbidden')
 */
function forbidden(res, message = 'Forbidden') {
  return error(res, message, 403);
}

/**
 * Send a conflict response
 * @param {Object} res - Express response object
 * @param {string} message - Error message (default: 'Conflict')
 * @param {*} details - Additional details about the conflict
 */
function conflict(res, message = 'Conflict', details = null) {
  return error(res, message, 409, details);
}

/**
 * Send a rate limit exceeded response
 * @param {Object} res - Express response object
 * @param {string} message - Error message (default: 'Rate limit exceeded')
 * @param {number} retryAfter - Retry after seconds
 */
function rateLimitExceeded(res, message = 'Rate limit exceeded', retryAfter = 60) {
  res.set('Retry-After', retryAfter.toString());
  return error(res, message, 429, {
    retryAfter,
    retryAfterDate: new Date(Date.now() + retryAfter * 1000).toISOString()
  });
}

/**
 * Send a paginated response
 * @param {Object} res - Express response object
 * @param {string} message - Success message
 * @param {Array} data - Array of data items
 * @param {Object} pagination - Pagination information
 * @param {Object} meta - Additional metadata
 */
function paginated(res, message = 'Success', data = [], pagination = {}, meta = {}) {
  const response = {
    success: true,
    message,
    timestamp: new Date().toISOString(),
    data,
    pagination: {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      total: pagination.total || 0,
      totalPages: pagination.totalPages || 0,
      hasNext: pagination.hasNext || false,
      hasPrev: pagination.hasPrev || false
    },
    ...meta
  };

  return res.status(200).json(response);
}

/**
 * Send a created response
 * @param {Object} res - Express response object
 * @param {string} message - Success message (default: 'Resource created successfully')
 * @param {*} data - Created resource data
 * @param {string} location - Location header value
 */
function created(res, message = 'Resource created successfully', data = null, location = null) {
  if (location) {
    res.set('Location', location);
  }

  return success(res, message, 201, data);
}

/**
 * Send a no content response
 * @param {Object} res - Express response object
 */
function noContent(res) {
  return res.status(204).send();
}

/**
 * Send a file download response
 * @param {Object} res - Express response object
 * @param {string} filePath - Path to the file
 * @param {string} filename - Name for the downloaded file
 * @param {string} mimeType - MIME type of the file
 */
function downloadFile(res, filePath, filename, mimeType = 'application/octet-stream') {
  res.set({
    'Content-Type': mimeType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-cache'
  });

  return res.sendFile(filePath);
}

/**
 * Send a streaming response
 * @param {Object} res - Express response object
 * @param {string} filename - Name for the downloaded file
 * @param {string} mimeType - MIME type of the file
 */
function startStreamingResponse(res, filename, mimeType = 'application/octet-stream') {
  res.set({
    'Content-Type': mimeType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-cache',
    'Transfer-Encoding': 'chunked'
  });

  return res;
}

/**
 * Send a progress update response (for SSE)
 * @param {Object} res - Express response object
 * @param {Object} data - Progress data
 */
function sendProgressUpdate(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Send a health check response
 * @param {Object} res - Express response object
 * @param {Object} healthData - Health check data
 */
function healthCheck(res, healthData = {}) {
  const response = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    ...healthData
  };

  return res.status(200).json(response);
}

module.exports = {
  success,
  error,
  validationError,
  notFound,
  unauthorized,
  forbidden,
  conflict,
  rateLimitExceeded,
  paginated,
  created,
  noContent,
  downloadFile,
  startStreamingResponse,
  sendProgressUpdate,
  healthCheck
};
