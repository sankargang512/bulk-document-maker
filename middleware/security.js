const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const helmet = require('helmet');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const loggingService = require('../services/loggingService');

/**
 * Security Middleware Configuration
 * Implements comprehensive security measures for production use
 */

// Rate limiting configuration
const createRateLimiters = () => {
  // General API rate limiting
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: {
      success: false,
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      loggingService.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method
      });
      res.status(429).json({
        success: false,
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
      });
    }
  });

  // Document generation endpoint rate limiting (more restrictive)
  const generationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // Limit each IP to 100 generation requests per hour
    message: {
      success: false,
      error: 'Document generation rate limit exceeded. Please try again later.',
      retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      loggingService.warn('Document generation rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method
      });
      res.status(429).json({
        success: false,
        error: 'Document generation rate limit exceeded. Please try again later.',
        retryAfter: '1 hour'
      });
    }
  });

  // File upload rate limiting
  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Limit each IP to 50 file uploads per 15 minutes
    message: {
      success: false,
      error: 'Too many file uploads from this IP, please try again later.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      loggingService.warn('File upload rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method
      });
      res.status(429).json({
        success: false,
        error: 'Too many file uploads from this IP, please try again later.',
        retryAfter: '15 minutes'
      });
    }
  });

  return {
    general: generalLimiter,
    generation: generationLimiter,
    upload: uploadLimiter
  };
};

// Speed limiting (gradual slowdown for repeated requests)
const createSpeedLimiters = () => {
  const generalSpeedLimiter = slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 100, // Allow 100 requests per 15 minutes without delay
    delayMs: (used, req) => {
      const delayAfter = req.slowDown.limit;
      return (used - delayAfter) * 500;
    },
    maxDelayMs: 20000, // Maximum delay of 20 seconds
    skipSuccessfulRequests: true, // Don't delay successful requests
    skipFailedRequests: false // Do delay failed requests
  });

  const generationSpeedLimiter = slowDown({
    windowMs: 60 * 60 * 1000, // 1 hour
    delayAfter: 50, // Allow 50 requests per hour without delay
    delayMs: (used, req) => {
      const delayAfter = req.slowDown.limit;
      return (used - delayAfter) * 1000;
    },
    maxDelayMs: 30000, // Maximum delay of 30 seconds
    skipSuccessfulRequests: true,
    skipFailedRequests: false
  });

  return {
    general: generalSpeedLimiter,
    generation: generationSpeedLimiter
  };
};

// CORS configuration
const createCorsConfig = () => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',') 
    : ['http://localhost:3000', 'http://localhost:3001'];

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        loggingService.warn('CORS blocked request', { origin, allowedOrigins });
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin', 
      'X-Requested-With', 
      'Content-Type', 
      'Accept', 
      'Authorization',
      'X-API-Key',
      'X-Request-ID'
    ],
    exposedHeaders: ['X-Request-ID', 'X-Rate-Limit-Remaining'],
    maxAge: 86400 // 24 hours
  });
};

// Helmet security configuration
const createHelmetConfig = () => {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' },
    xssFilter: true,
    hidePoweredBy: true
  });
};

// Request size limits
const createSizeLimits = () => {
  return {
    // JSON payload limits
    json: {
      limit: '10mb'
    },
    // URL-encoded payload limits
    urlencoded: {
      limit: '10mb',
      extended: true
    },
    // Raw body limits
    raw: {
      limit: '50mb'
    },
    // File upload limits (handled by multer)
    fileUpload: {
      maxFileSize: 50 * 1024 * 1024, // 50MB
      maxFiles: 20
    }
  };
};

// Request ID middleware
const requestIdMiddleware = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};

// Security headers middleware
const securityHeadersMiddleware = (req, res, next) => {
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  next();
};

// Request logging middleware
const requestLoggingMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  loggingService.info('Incoming request', {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    headers: req.headers
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - startTime;
    
    // Log response
    loggingService.info('Outgoing response', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('Content-Length'),
      headers: res.getHeaders()
    });

    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Error handling middleware
const errorHandlingMiddleware = (err, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  
  // Log error
  loggingService.error('Request error', {
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    error: err.message,
    stack: err.stack,
    headers: req.headers
  });

  // Don't expose internal errors to client
  const isProduction = process.env.NODE_ENV === 'production';
  const errorMessage = isProduction ? 'Internal server error' : err.message;
  const errorDetails = isProduction ? {} : { stack: err.stack };

  res.status(err.status || 500).json({
    success: false,
    error: errorMessage,
    requestId,
    ...errorDetails
  });
};

// IP address extraction middleware
const ipAddressMiddleware = (req, res, next) => {
  // Get real IP address (handles proxy/load balancer scenarios)
  req.realIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               req.ip ||
               'unknown';
  
  next();
};

// Request validation middleware
const requestValidationMiddleware = (req, res, next) => {
  // Validate request method
  const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
  if (!allowedMethods.includes(req.method)) {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      allowedMethods
    });
  }

  // Validate content type for POST/PUT requests
  if ((req.method === 'POST' || req.method === 'PUT') && req.headers['content-type']) {
    const contentType = req.headers['content-type'].toLowerCase();
    if (!contentType.includes('application/json') && 
        !contentType.includes('multipart/form-data') &&
        !contentType.includes('application/x-www-form-urlencoded')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid content type',
        allowedTypes: ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded']
      });
    }
  }

  next();
};

module.exports = {
  createRateLimiters,
  createSpeedLimiters,
  createCorsConfig,
  createHelmetConfig,
  createSizeLimits,
  requestIdMiddleware,
  securityHeadersMiddleware,
  requestLoggingMiddleware,
  errorHandlingMiddleware,
  ipAddressMiddleware,
  requestValidationMiddleware
};
