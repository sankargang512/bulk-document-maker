const express = require('express');
const compression = require('compression');

// Import security middleware
const securityMiddleware = require('../middleware/security');

// Create Express app
const app = express();

// Request ID middleware (must be first)
app.use(securityMiddleware.requestIdMiddleware);

// IP address extraction middleware
app.use(securityMiddleware.ipAddressMiddleware);

// Security headers middleware
app.use(securityMiddleware.securityHeadersMiddleware);

// Enhanced Helmet security configuration
app.use(securityMiddleware.createHelmetConfig());

// Enhanced CORS configuration
app.use(securityMiddleware.createCorsConfig());

// Compression middleware for performance
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Body parsing middleware with size limits from config
const sizeLimits = securityMiddleware.createSizeLimits();
app.use(express.json(sizeLimits.json));
app.use(express.urlencoded(sizeLimits.urlencoded));

// Rate limiting middleware
const rateLimiters = securityMiddleware.createRateLimiters();
const speedLimiters = securityMiddleware.createSpeedLimiters();

// Apply general rate limiting to all routes
app.use(rateLimiters.general);
app.use(speedLimiters.general);

// Basic route
app.get('/', (req, res) => {
  res.json({
    message: 'Bulk Document Maker API - Enhanced Security',
    version: '1.0.0',
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    security: {
      rateLimiting: 'enabled',
      compression: 'enabled',
      securityHeaders: 'enabled',
      cors: 'enabled'
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  });
});

// Document generation endpoint (for testing)
app.post('/api/documents/generate', (req, res) => {
  // Simulate file validation error
  res.status(400).json({
    success: false,
    error: 'Missing template file'
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    requestId: req.requestId
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(405).json({
    success: false,
    error: 'Method not allowed',
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  });
});

module.exports = app;
