const path = require('path');
const fs = require('fs-extra');

/**
 * Configuration Management
 * Handles environment-specific configuration with secure defaults
 */

// Environment detection
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isDevelopment = NODE_ENV === 'development';
const isTest = NODE_ENV === 'test';

// Base configuration
const baseConfig = {
  // Server configuration
  server: {
    port: process.env.PORT || 3001,
    host: process.env.HOST || '0.0.0.0',
    trustProxy: process.env.TRUST_PROXY === 'true',
    enableCompression: process.env.ENABLE_COMPRESSION !== 'false',
    enableCaching: process.env.ENABLE_CACHING !== 'false'
  },

  // Security configuration
  security: {
    // Rate limiting
    rateLimit: {
      general: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: parseInt(process.env.RATE_LIMIT_GENERAL) || 1000
      },
      generation: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: parseInt(process.env.RATE_LIMIT_GENERATION) || 100
      },
      upload: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: parseInt(process.env.RATE_LIMIT_UPLOAD) || 50
      }
    },

    // CORS
    cors: {
      allowedOrigins: process.env.ALLOWED_ORIGINS 
        ? process.env.ALLOWED_ORIGINS.split(',') 
        : ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true,
      maxAge: 86400 // 24 hours
    },

    // Authentication
    auth: {
      requireApiKey: process.env.REQUIRE_API_KEY === 'true',
      requireJWT: process.env.REQUIRE_JWT === 'true',
      jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
      apiKeys: process.env.VALID_API_KEYS 
        ? process.env.VALID_API_KEYS.split(',') 
        : ['test-api-key-12345678901234567890123456789012'],
      requestSigningSecret: process.env.REQUEST_SIGNING_SECRET || 'your-signing-secret'
    },

    // File validation
    fileValidation: {
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB
      allowedMimeTypes: [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/pdf',
        'text/csv',
        'text/plain'
      ],
      enableMagicNumberCheck: process.env.ENABLE_MAGIC_NUMBER_CHECK !== 'false',
      enableContentValidation: process.env.ENABLE_CONTENT_VALIDATION !== 'false'
    }
  },

  // Database configuration
  database: {
    type: process.env.DB_TYPE || 'sqlite',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    name: process.env.DB_NAME || 'bulk_document_maker',
    username: process.env.DB_USERNAME || '',
    password: process.env.DB_PASSWORD || '',
    path: process.env.DB_PATH || './database/database.sqlite',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
    acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 60000,
    timeout: parseInt(process.env.DB_TIMEOUT) || 60000,
    enableLogging: process.env.DB_ENABLE_LOGGING === 'true'
  },

  // File storage configuration
  storage: {
    // Local storage paths
    local: {
      uploads: process.env.UPLOADS_PATH || './uploads',
      generated: process.env.GENERATED_PATH || './generated',
      temp: process.env.TEMP_PATH || './temp',
      compressed: process.env.COMPRESSED_PATH || './compressed'
    },

    // Cloud storage (optional)
    cloud: {
      provider: process.env.CLOUD_STORAGE_PROVIDER || null, // 'aws', 'gcp', 'azure'
      bucket: process.env.CLOUD_STORAGE_BUCKET || null,
      region: process.env.CLOUD_STORAGE_REGION || null,
      accessKey: process.env.CLOUD_STORAGE_ACCESS_KEY || null,
      secretKey: process.env.CLOUD_STORAGE_SECRET_KEY || null,
      enableBackup: process.env.CLOUD_STORAGE_ENABLE_BACKUP === 'true'
    },

    // File processing
    processing: {
      enableCompression: process.env.ENABLE_FILE_COMPRESSION === 'true',
      enableStreaming: process.env.ENABLE_FILE_STREAMING === 'true',
      maxConcurrentUploads: parseInt(process.env.MAX_CONCURRENT_UPLOADS) || 5,
      cleanupDelay: parseInt(process.env.FILE_CLEANUP_DELAY) || 300000 // 5 minutes
    }
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    format: process.env.LOG_FORMAT || (isProduction ? 'json' : 'pretty'),
    enableConsole: process.env.LOG_ENABLE_CONSOLE !== 'false',
    enableFile: process.env.LOG_ENABLE_FILE === 'true',
    logFile: process.env.LOG_FILE || './logs/app.log',
    maxLogSize: process.env.LOG_MAX_SIZE || '10m',
    maxLogFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
    enableRequestLogging: process.env.LOG_ENABLE_REQUESTS !== 'false',
    enableErrorTracking: process.env.LOG_ENABLE_ERROR_TRACKING !== 'false'
  },

  // Performance configuration
  performance: {
    // Caching
    cache: {
      enable: process.env.ENABLE_CACHING !== 'false',
      ttl: parseInt(process.env.CACHE_TTL) || 3600000, // 1 hour
      maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 1000,
      enableCompression: process.env.CACHE_ENABLE_COMPRESSION === 'true'
    },

    // Processing
    processing: {
      maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS) || 5,
      jobTimeout: parseInt(process.env.JOB_TIMEOUT) || 300000, // 5 minutes
      enableWorkerThreads: process.env.ENABLE_WORKER_THREADS === 'true',
      workerThreadCount: parseInt(process.env.WORKER_THREAD_COUNT) || 4
    },

    // Compression
    compression: {
      enable: process.env.ENABLE_COMPRESSION !== 'false',
      level: parseInt(process.env.COMPRESSION_LEVEL) || 6,
      threshold: parseInt(process.env.COMPRESSION_THRESHOLD) || 1024
    }
  },

  // External services
  services: {
    // OpenAI (for template analysis)
    openai: {
      apiKey: process.env.OPENAI_API_KEY || null,
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7
    },

    // Email service
    email: {
      provider: process.env.EMAIL_PROVIDER || 'smtp', // 'smtp', 'sendgrid', 'mailgun'
      host: process.env.EMAIL_HOST || 'localhost',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      username: process.env.EMAIL_USERNAME || '',
      password: process.env.EMAIL_PASSWORD || '',
      from: process.env.EMAIL_FROM || 'noreply@bulkdocumentmaker.com',
      enableNotifications: process.env.EMAIL_ENABLE_NOTIFICATIONS === 'true'
    },

    // Make.com webhook
    make: {
      webhookUrl: process.env.MAKE_WEBHOOK_URL || null,
      enableWebhooks: process.env.MAKE_ENABLE_WEBHOOKS === 'true',
      webhookSecret: process.env.MAKE_WEBHOOK_SECRET || null
    }
  },

  // Monitoring and health checks
  monitoring: {
    enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS !== 'false',
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000, // 30 seconds
    enableMetrics: process.env.ENABLE_METRICS === 'true',
    metricsPort: parseInt(process.env.METRICS_PORT) || 3002,
    enableAlerting: process.env.ENABLE_ALERTING === 'true',
    alertWebhook: process.env.ALERT_WEBHOOK_URL || null
  }
};

// Environment-specific overrides
const environmentConfigs = {
  development: {
    security: {
      auth: {
        requireApiKey: false,
        requireJWT: false
      }
    },
    logging: {
      level: 'debug',
      format: 'pretty'
    },
    performance: {
      cache: {
        enable: false
      }
    }
  },

  test: {
    server: {
      port: 0 // Random port for testing
    },
    database: {
      path: ':memory:' // In-memory database for testing
    },
    logging: {
      level: 'error',
      enableConsole: false
    }
  },

  production: {
    security: {
      auth: {
        requireApiKey: true,
        requireJWT: true
      }
    },
    logging: {
      level: 'info',
      format: 'json',
      enableFile: true
    },
    performance: {
      cache: {
        enable: true
      },
      processing: {
        enableWorkerThreads: true
      }
    }
  }
};

// Merge configurations
const config = {
  ...baseConfig,
  ...environmentConfigs[NODE_ENV],
  env: NODE_ENV,
  isProduction,
  isDevelopment,
  isTest
};

// Validate required configuration
const validateConfig = () => {
  const errors = [];

  // Check required environment variables for production
  if (isProduction) {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
      errors.push('JWT_SECRET must be set in production');
    }

    if (!process.env.REQUEST_SIGNING_SECRET || process.env.REQUEST_SIGNING_SECRET === 'your-signing-secret') {
      errors.push('REQUEST_SIGNING_SECRET must be set in production');
    }

    if (config.services.openai.apiKey && config.services.openai.apiKey === 'your-openai-api-key') {
      errors.push('OPENAI_API_KEY must be set in production');
    }
  }

  // Check file paths exist and are writable
  const storagePaths = [
    config.storage.local.uploads,
    config.storage.local.generated,
    config.storage.local.temp
  ];

  for (const storagePath of storagePaths) {
    try {
      fs.ensureDirSync(storagePath);
      // Test write access
      const testFile = path.join(storagePath, '.test');
      fs.writeFileSync(testFile, 'test');
      fs.removeSync(testFile);
    } catch (error) {
      errors.push(`Storage path ${storagePath} is not writable: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
};

// Load configuration from file if exists
const loadConfigFile = () => {
  const configPath = process.env.CONFIG_FILE || path.join(__dirname, `${NODE_ENV}.json`);
  
  try {
    if (fs.pathExistsSync(configPath)) {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      Object.assign(config, fileConfig);
      console.log(`Configuration loaded from ${configPath}`);
    }
  } catch (error) {
    console.warn(`Failed to load configuration file ${configPath}:`, error.message);
  }
};

// Initialize configuration
const initializeConfig = () => {
  try {
    loadConfigFile();
    validateConfig();
    
    console.log(`Configuration initialized for environment: ${NODE_ENV}`);
    console.log(`Server will run on port: ${config.server.port}`);
    console.log(`Security: API Key required: ${config.security.auth.requireApiKey}, JWT required: ${config.security.auth.requireJWT}`);
    
    return config;
  } catch (error) {
    console.error('Configuration initialization failed:', error.message);
    process.exit(1);
  }
};

// Export configuration
module.exports = {
  config,
  initializeConfig,
  validateConfig,
  NODE_ENV,
  isProduction,
  isDevelopment,
  isTest
};
