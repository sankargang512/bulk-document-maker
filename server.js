console.log('🚀 Starting server initialization...');

// Load environment configuration
require('dotenv').config();
console.log('✅ Dotenv loaded');

// Initialize configuration
const { initializeConfig } = require('./config');
const config = initializeConfig();
console.log('✅ Configuration loaded');

const express = require('express');
console.log('✅ Express loaded');

const cors = require('cors');
console.log('✅ CORS loaded');

const helmet = require('helmet');
console.log('✅ Helmet loaded');

const morgan = require('morgan');
console.log('✅ Morgan loaded');

const path = require('path');
console.log('✅ Path loaded');

const compression = require('compression');
console.log('✅ Compression loaded');

// Import security and performance middleware
const securityMiddleware = require('./middleware/security');
const authenticationMiddleware = require('./middleware/authentication');
const fileValidationMiddleware = require('./middleware/fileValidation');
const uploadEnhancedMiddleware = require('./middleware/upload-enhanced');
console.log('✅ Security middleware loaded');

console.log('🔄 Loading middleware...');

// Import middleware
const { 
  errorHandler, 
  requestIdMiddleware, 
  notFoundHandler 
} = require('./middleware/errorHandler');
console.log('✅ Error handler loaded');

const { initializeDatabase } = require('./database/init');
console.log('✅ Database init loaded');

console.log('🔄 Loading routes...');

// Import routes
const healthRoutes = require('./routes/health');
console.log('✅ Health routes loaded');

const templateRoutes = require('./routes/templates');
console.log('✅ Template routes loaded');

const documentRoutes = require('./routes/documents');
console.log('✅ Document routes loaded');

console.log('🔄 Creating Express app...');
const app = express();
console.log('✅ Express app created');

const PORT = config.server.port;
console.log(`📊 Port set to: ${PORT}`);

console.log('🔄 Setting up middleware...');

// ===== MIDDLEWARE SETUP =====

// Request ID middleware (must be first)
console.log('📝 Setting up request ID middleware...');
app.use(securityMiddleware.requestIdMiddleware);
console.log('✅ Request ID middleware set');

// IP address extraction middleware
console.log('🌐 Setting up IP address middleware...');
app.use(securityMiddleware.ipAddressMiddleware);
console.log('✅ IP address middleware set');

// Request validation middleware
console.log('✅ Setting up request validation middleware...');
app.use(securityMiddleware.requestValidationMiddleware);
console.log('✅ Request validation middleware set');

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
  level: config.performance.compression.level,
  threshold: config.performance.compression.threshold,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));
console.log('✅ Compression middleware set');

// Request logging middleware
console.log('📝 Setting up request logging middleware...');
app.use(securityMiddleware.requestLoggingMiddleware);
console.log('✅ Request logging middleware set');

// Morgan logging middleware (fallback)
console.log('📝 Setting up Morgan logging middleware...');
app.use(morgan('combined', {
  stream: {
    write: (message) => {
      console.log(message.trim());
    }
  }
}));
console.log('✅ Morgan logging middleware set');

// Body parsing middleware with size limits from config
console.log('📦 Setting up body parsing middleware...');
const sizeLimits = securityMiddleware.createSizeLimits();
app.use(express.json(sizeLimits.json));
app.use(express.urlencoded(sizeLimits.urlencoded));
console.log('✅ Body parsing middleware set');

// Rate limiting middleware
console.log('🚦 Setting up rate limiting middleware...');
const rateLimiters = securityMiddleware.createRateLimiters();
const speedLimiters = securityMiddleware.createSpeedLimiters();

// Apply general rate limiting to all routes
app.use(rateLimiters.general);
app.use(speedLimiters.general);

// Apply specific rate limiting to document generation routes
app.use('/api/documents/generate', rateLimiters.generation);
app.use('/api/documents/generate', speedLimiters.generation);

// Apply upload rate limiting to file upload routes
app.use('/api/documents/generate', rateLimiters.upload);
app.use('/api/templates/upload', rateLimiters.upload);

console.log('✅ Rate limiting middleware set');

// Static file serving
console.log('📁 Setting up static file serving...');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/generated', express.static(path.join(__dirname, 'generated')));
console.log('✅ Static file serving set');

// ===== ROUTES =====
console.log('🔄 Setting up routes...');

// Health check endpoint
console.log('📊 Setting up health routes...');
app.use('/api/health', healthRoutes);
console.log('✅ Health routes set');

// API routes
console.log('📚 Setting up template routes...');
app.use('/api/templates', templateRoutes);
console.log('✅ Template routes set');

console.log('📄 Setting up document routes...');
app.use('/api/documents', documentRoutes);
console.log('✅ Document routes set');

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Bulk Document Maker API',
    version: process.env.APP_VERSION || '1.0.0',
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: {
        basic: '/api/health',
        ready: '/api/health/ready',
        live: '/api/health/live',
        detailed: '/api/health/detailed'
      },
      templates: {
        analyze: '/api/templates/analyze',
        compare: '/api/templates/compare',
        list: '/api/templates',
        upload: '/api/templates/upload'
      },
      documents: {
        generate: '/api/documents/generate',
        status: '/api/documents/:batchId/status',
        download: '/api/documents/:batchId/download',
        cancel: '/api/documents/:batchId/cancel',
        delete: '/api/documents/:batchId',
        list: '/api/documents'
      }
    },
    documentation: {
      swagger: '/api/docs',
      health: '/api/health/detailed'
    }
  });
});

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    message: 'Bulk Document Maker API Documentation',
    version: process.env.APP_VERSION || '1.0.0',
    endpoints: {
      'POST /api/documents/generate': {
        description: 'Generate documents from template and CSV data',
        body: {
          template: 'Template file (DOCX, PDF, TXT)',
          csv: 'CSV data file',
          options: {
            format: 'Output format (pdf, docx, txt)',
            quality: 'Output quality (low, medium, high)',
            batchSize: 'Documents per batch (default: 10)',
            includeMetadata: 'Include metadata (default: true)',
            watermark: 'Watermark text (optional)',
            password: 'Document password (optional)'
          },
          notification: {
            email: 'Email for notifications (optional)'
          }
        },
        response: {
          batchId: 'Unique batch identifier',
          statusUrl: 'URL to check batch status',
          downloadUrl: 'URL to download generated documents',
          totalDocuments: 'Total number of documents to generate',
          estimatedTime: 'Estimated generation time'
        }
      },
      'GET /api/documents/:batchId/status': {
        description: 'Check generation progress for a batch',
        response: {
          status: 'Batch status (pending, processing, completed, failed)',
          progress: 'Progress percentage (0-100)',
          totalDocuments: 'Total number of documents',
          completedDocuments: 'Number of completed documents',
          failedDocuments: 'Number of failed documents',
          estimatedTimeRemaining: 'Estimated time to completion'
        }
      },
      'GET /api/documents/:batchId/download': {
        description: 'Download ZIP file containing all generated documents',
        response: 'ZIP file stream (only available when batch is completed)'
      },
      'POST /api/templates/analyze': {
        description: 'Analyze template file and return required variables',
        body: {
          template: 'Template file (DOCX, PDF, TXT)',
          useAI: 'Use AI for enhanced analysis (default: true)',
          extractStructure: 'Extract document structure (default: true)',
          generateDescriptions: 'Generate variable descriptions (default: true)'
        },
        response: {
          placeholders: 'Array of required variables',
          structure: 'Document structure analysis',
          metadata: 'Template metadata and statistics'
        }
      },
      'GET /api/health': {
        description: 'Basic health check endpoint',
        response: {
          status: 'Overall system health (healthy, degraded, unhealthy)',
          checks: 'Individual service health checks',
          summary: 'Health check summary statistics'
        }
      }
    },
    authentication: 'Currently not required (development mode)',
    rateLimiting: 'Built-in rate limiting for document generation',
    fileLimits: {
      template: '10MB max (DOCX, PDF, TXT)',
      csv: '5MB max (CSV, TXT)'
    }
  });
});

// 404 handler
app.use(notFoundHandler);

// ===== ERROR HANDLING =====

// Enhanced error handling middleware
console.log('🛠️ Setting up enhanced error handling...');
app.use(securityMiddleware.errorHandlingMiddleware);
console.log('✅ Enhanced error handling middleware set');

// Global error handler (must be last)
app.use(errorHandler);

// ===== SERVER STARTUP =====

async function startServer() {
  try {
    // Initialize database (optional for development)
    if (process.env.INITIALIZE_DATABASE === 'true') {
      try {
        console.log('Initializing database...');
        await initializeDatabase();
        console.log('Database initialized successfully');
      } catch (dbError) {
        console.warn('⚠️ Database initialization failed, continuing without database:', dbError.message);
        console.log('💡 You can still test the API endpoints that don\'t require database access');
      }
    }

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Bulk Document Maker API server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📚 API docs: http://localhost:${PORT}/api/docs`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔧 Development mode enabled`);
        console.log(`📁 Uploads: http://localhost:${PORT}/uploads`);
        console.log(`📁 Generated: http://localhost:${PORT}/generated`);
      }
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
console.log('🚀 Attempting to start server...');
startServer().catch(error => {
  console.error('❌ Server startup failed:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
});

module.exports = app;
