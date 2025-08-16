// Test environment setup
process.env.NODE_ENV = 'test';
process.env.PORT = 0; // Random port for testing
process.env.DB_PATH = ':memory:'; // In-memory database for testing
process.env.LOG_LEVEL = 'error'; // Minimal logging during tests
process.env.ENABLE_HEALTH_CHECKS = 'false';
process.env.ENABLE_METRICS = 'false';
process.env.ENABLE_ALERTING = 'false';

// Disable external services for testing
process.env.OPENAI_API_KEY = 'test-key';
process.env.EMAIL_ENABLE_NOTIFICATIONS = 'false';
process.env.MAKE_ENABLE_WEBHOOKS = 'false';

// Test-specific security settings
process.env.REQUIRE_API_KEY = 'false';
process.env.REQUIRE_JWT = 'false';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.REQUEST_SIGNING_SECRET = 'test-signing-secret';

// Test file paths
process.env.UPLOADS_PATH = './tests/uploads';
process.env.GENERATED_PATH = './tests/generated';
process.env.TEMP_PATH = './tests/temp';
process.env.COMPRESSED_PATH = './tests/compressed';

// Performance settings for testing
process.env.ENABLE_CACHING = 'false';
process.env.ENABLE_COMPRESSION = 'false';
process.env.ENABLE_FILE_STREAMING = 'false';
process.env.ENABLE_FILE_COMPRESSION = 'false';

console.log('🧪 Test environment configured');
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`DB_PATH: ${process.env.DB_PATH}`);
console.log(`UPLOADS_PATH: ${process.env.UPLOADS_PATH}`);
