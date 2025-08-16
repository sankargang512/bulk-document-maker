console.log('🚀 Starting simplified server initialization...');

// Load environment configuration
require('dotenv').config();
console.log('✅ Dotenv loaded');

const express = require('express');
console.log('✅ Express loaded');

const compression = require('compression');
console.log('✅ Compression loaded');

// Import security middleware
const securityMiddleware = require('./middleware/security');
console.log('✅ Security middleware loaded');

console.log('🔄 Creating Express app...');
const app = express();
console.log('✅ Express app created');

const PORT = process.env.PORT || 3001;
console.log(`📊 Port set to: ${PORT}`);

console.log('🔄 Setting up middleware...');

// Request ID middleware (must be first)
console.log('📝 Setting up request ID middleware...');
app.use(securityMiddleware.requestIdMiddleware);
console.log('✅ Request ID middleware set');

// IP address extraction middleware
console.log('🌐 Setting up IP address middleware...');
app.use(securityMiddleware.ipAddressMiddleware);
console.log('✅ IP address middleware set');

// Security headers middleware
console.log('🛡️ Setting up security headers middleware...');
app.use(securityMiddleware.securityHeadersMiddleware);
console.log('✅ Security headers middleware set');

// Enhanced Helmet security configuration
console.log('🛡️ Setting up enhanced Helmet security...');
app.use(securityMiddleware.createHelmetConfig());
console.log('✅ Enhanced Helmet security set');

// Enhanced CORS configuration
console.log('🌐 Setting up enhanced CORS...');
app.use(securityMiddleware.createCorsConfig());
console.log('✅ Enhanced CORS set');

// Compression middleware for performance
console.log('📦 Setting up compression middleware...');
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
console.log('✅ Compression middleware set');

// Basic body parsing
console.log('📦 Setting up body parsing middleware...');
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
console.log('✅ Body parsing middleware set');

// Rate limiting middleware
console.log('🚦 Setting up rate limiting middleware...');
const rateLimiters = securityMiddleware.createRateLimiters();
const speedLimiters = securityMiddleware.createSpeedLimiters();

// Apply general rate limiting to all routes
app.use(rateLimiters.general);
app.use(speedLimiters.general);
console.log('✅ Rate limiting middleware set');

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

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    requestId: req.requestId
  });
});

// Start server
console.log('🚀 Starting server...');
app.listen(PORT, () => {
  console.log(`🚀 Enhanced Bulk Document Maker API server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('🔒 Security features: Rate limiting, Compression, Security headers, CORS');
});

console.log('✅ Server setup complete');
