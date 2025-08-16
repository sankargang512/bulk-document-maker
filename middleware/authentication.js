const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const loggingService = require('../services/loggingService');

/**
 * Authentication Middleware
 * Implements API key and JWT token authentication
 */

// API key validation
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key is required',
      code: 'MISSING_API_KEY'
    });
  }

  // Validate API key format (should be 32+ characters)
  if (apiKey.length < 32) {
    return res.status(401).json({
      success: false,
      error: 'Invalid API key format',
      code: 'INVALID_API_KEY_FORMAT'
    });
  }

  // Check if API key is valid (in production, this would check against database)
  const validApiKeys = process.env.VALID_API_KEYS 
    ? process.env.VALID_API_KEYS.split(',') 
    : ['test-api-key-12345678901234567890123456789012'];

  if (!validApiKeys.includes(apiKey)) {
    loggingService.warn('Invalid API key attempt', {
      apiKey: apiKey.substring(0, 8) + '...',
      ip: req.realIP || req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.requestId
    });

    return res.status(401).json({
      success: false,
      error: 'Invalid API key',
      code: 'INVALID_API_KEY'
    });
  }

  // Log successful API key validation
  loggingService.info('API key validated', {
    apiKey: apiKey.substring(0, 8) + '...',
    ip: req.realIP || req.ip,
    requestId: req.requestId
  });

  next();
};

// JWT token validation
const validateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Bearer token is required',
      code: 'MISSING_BEARER_TOKEN'
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const decoded = jwt.verify(token, secret);
    
    // Add user info to request
    req.user = decoded;
    req.userId = decoded.userId || decoded.id;
    
    loggingService.info('JWT token validated', {
      userId: req.userId,
      ip: req.realIP || req.ip,
      requestId: req.requestId
    });

    next();
  } catch (error) {
    loggingService.warn('JWT validation failed', {
      error: error.message,
      ip: req.realIP || req.ip,
      requestId: req.requestId
    });

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Token validation failed',
      code: 'TOKEN_VALIDATION_FAILED'
    });
  }
};

// Optional JWT validation (doesn't fail if no token)
const optionalJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // Continue without user info
  }

  const token = authHeader.substring(7);

  try {
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const decoded = jwt.verify(token, secret);
    
    req.user = decoded;
    req.userId = decoded.userId || decoded.id;
    
    loggingService.info('Optional JWT token validated', {
      userId: req.userId,
      ip: req.realIP || req.ip,
      requestId: req.requestId
    });
  } catch (error) {
    // Log but don't fail the request
    loggingService.warn('Optional JWT validation failed', {
      error: error.message,
      ip: req.realIP || req.ip,
      requestId: req.requestId
    });
  }

  next();
};

// Role-based access control
const requireRole = (requiredRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      });
    }

    const userRole = req.user.role || 'user';
    
    if (!requiredRoles.includes(userRole)) {
      loggingService.warn('Insufficient permissions', {
        userId: req.userId,
        userRole,
        requiredRoles,
        ip: req.realIP || req.ip,
        requestId: req.requestId
      });

      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredRoles,
        userRole
      });
    }

    next();
  };
};

// Request signing validation (for sensitive operations)
const validateRequestSignature = (req, res, next) => {
  const signature = req.headers['x-request-signature'];
  const timestamp = req.headers['x-request-timestamp'];
  
  if (!signature || !timestamp) {
    return res.status(400).json({
      success: false,
      error: 'Request signature and timestamp are required for this operation',
      code: 'MISSING_SIGNATURE'
    });
  }

  // Check if timestamp is recent (within 5 minutes)
  const requestTime = parseInt(timestamp);
  const currentTime = Date.now();
  const timeDiff = Math.abs(currentTime - requestTime);
  
  if (timeDiff > 5 * 60 * 1000) { // 5 minutes
    return res.status(400).json({
      success: false,
      error: 'Request timestamp is too old',
      code: 'TIMESTAMP_EXPIRED'
    });
  }

  // Validate signature
  const secret = process.env.REQUEST_SIGNING_SECRET || 'your-signing-secret';
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${req.method}${req.path}${timestamp}${JSON.stringify(req.body || {})}`)
    .digest('hex');

  if (signature !== expectedSignature) {
    loggingService.warn('Invalid request signature', {
      ip: req.realIP || req.ip,
      method: req.method,
      path: req.path,
      requestId: req.requestId
    });

    return res.status(400).json({
      success: false,
      error: 'Invalid request signature',
      code: 'INVALID_SIGNATURE'
    });
  }

  next();
};

// Rate limiting per user (if authenticated)
const createUserRateLimiter = (maxRequests, windowMs) => {
  const userRequests = new Map();

  // Clean up expired rate limit entries
  setInterval(() => {
    const now = Date.now();
    for (const [key] of userRequests) {
      const [, timestamp] = key.split(':');
      if (now - parseInt(timestamp) * 60000 > 60000) { // 1 minute
        userRequests.delete(key);
      }
    }
  }, 60000); // Clean up every minute

  return (req, res, next) => {
    if (!req.userId) {
      return next(); // Skip for unauthenticated requests
    }

    const now = Date.now();
    const userKey = `${req.userId}:${Math.floor(now / windowMs)}`;
    
    if (!userRequests.has(userKey)) {
      userRequests.set(userKey, 0);
    }

    const currentRequests = userRequests.get(userKey);
    
    if (currentRequests >= maxRequests) {
      loggingService.warn('User rate limit exceeded', {
        userId: req.userId,
        ip: req.realIP || req.ip,
        requestId: req.requestId
      });

      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded for this user',
        code: 'USER_RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }

    userRequests.set(userKey, currentRequests + 1);
    next();
  };
};

module.exports = {
  validateApiKey,
  validateJWT,
  optionalJWT,
  requireRole,
  validateRequestSignature,
  createUserRateLimiter
};
