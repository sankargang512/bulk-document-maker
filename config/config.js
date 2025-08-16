const path = require('path');

const config = {
  // Server configuration
  server: {
    port: process.env.PORT || 3001,
    host: process.env.HOST || 'localhost',
    environment: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
  },

  // Database configuration
  database: {
    path: path.join(__dirname, '..', 'database', 'database.sqlite'),
    timeout: 30000,
    verbose: process.env.NODE_ENV === 'development'
  },

  // File upload configuration
  upload: {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedFileTypes: {
      templates: ['.docx', '.doc', '.pdf', '.html'],
      csv: ['.csv', '.xlsx', '.xls'],
      images: ['.jpg', '.jpeg', '.png', '.gif']
    },
    uploadDir: path.join(__dirname, '..', 'uploads'),
    tempDir: path.join(__dirname, '..', 'temp'),
    generatedDir: path.join(__dirname, '..', 'generated')
  },

  // Security configuration
  security: {
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.'
    },
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
    }
  },

  // Email configuration
  email: {
    service: process.env.EMAIL_SERVICE || 'gmail',
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    from: process.env.EMAIL_FROM || 'noreply@bulkdocgenerator.com',
    replyTo: process.env.EMAIL_REPLY_TO || 'support@bulkdocgenerator.com'
  },

  // Make.com webhook configuration
  make: {
    webhookUrl: process.env.MAKE_WEBHOOK_URL,
    apiKey: process.env.MAKE_API_KEY,
    enabled: process.env.MAKE_ENABLED === 'true'
  },

  // Document generation configuration
  generation: {
    maxConcurrentJobs: 5,
    maxDocumentsPerJob: 1000,
    timeout: 300000, // 5 minutes
    retryAttempts: 3,
    retryDelay: 5000 // 5 seconds
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || path.join(__dirname, '..', 'logs', 'app.log'),
    maxSize: '10m',
    maxFiles: 5
  },

  // API configuration
  api: {
    version: 'v1',
    basePath: '/api',
    documentation: process.env.API_DOCS_URL || '/api/docs'
  },

  // Performance configuration
  performance: {
    compression: true,
    cacheControl: 'public, max-age=3600',
    etag: true
  },

  // Validation configuration
  validation: {
    maxTemplateSize: 10 * 1024 * 1024, // 10MB
    maxCsvSize: 5 * 1024 * 1024, // 5MB
    maxFieldLength: 1000,
    allowedTemplateCategories: [
      'HR Documents',
      'Legal Documents',
      'School Forms',
      'Business Contracts',
      'Certificates',
      'Reports',
      'Other'
    ]
  }
};

// Environment-specific overrides
if (config.server.environment === 'production') {
  config.security.rateLimit.max = 50;
  config.generation.maxConcurrentJobs = 10;
  config.generation.maxDocumentsPerJob = 5000;
}

if (config.server.environment === 'test') {
  config.database.path = ':memory:';
  config.upload.uploadDir = path.join(__dirname, '..', 'temp', 'test-uploads');
  config.upload.generatedDir = path.join(__dirname, '..', 'temp', 'test-generated');
}

module.exports = config;
