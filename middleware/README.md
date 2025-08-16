# Bulk Document Maker - Middleware Documentation

This directory contains the core middleware components for the Bulk Document Maker backend API, providing comprehensive file upload handling, validation, and error management.

## 📁 **File Structure**

```
middleware/
├── upload.js          # File upload middleware with multer
├── validation.js      # Joi-based validation schemas
├── errorHandler.js    # Comprehensive error handling
└── README.md         # This documentation
```

## 🚀 **Quick Start**

### **1. Basic Setup**

```javascript
const express = require('express');
const { errorHandler, requestIdMiddleware } = require('./middleware/errorHandler');
const { validate } = require('./middleware/validation');
const { templateUpload } = require('./middleware/upload');

const app = express();

// Apply middleware
app.use(requestIdMiddleware);
app.use(express.json());

// Your routes here...

// Error handling (must be last)
app.use(errorHandler);
```

### **2. File Upload Example**

```javascript
const { templateUpload, validateFiles } = require('./middleware/upload');
const { validateTemplateCreate } = require('./middleware/validation');

// Upload template with validation
app.post('/api/templates', 
  templateUpload('template'),
  validateFiles({ required: ['template'], maxFiles: 1 }),
  validateTemplateCreate,
  async (req, res) => {
    // req.file contains uploaded template
    // req.body contains validated template data
    const template = await createTemplate(req.body, req.file);
    res.json({ success: true, template });
  }
);
```

## 📤 **Upload Middleware (upload.js)**

### **Features**
- **Multiple file type support**: DOCX, PDF, TXT, CSV
- **Configurable size limits**: Template (10MB), CSV (5MB), Batch (50MB)
- **Unique filename generation**: Prevents conflicts
- **File checksums**: SHA-256 for integrity
- **Automatic cleanup**: Temporary file management
- **Drag & drop support**: Frontend integration ready

### **Pre-configured Uploaders**

```javascript
const { 
  templateUpload,      // Single template file
  csvUpload,          // Single CSV file
  batchUpload,        // Multiple files for batch operations
  templateComparisonUpload // Two templates for comparison
} = require('./middleware/upload');

// Usage examples
app.post('/api/templates', templateUpload('template'));
app.post('/api/data', csvUpload('csv'));
app.post('/api/batch', batchUpload('files', { maxFiles: 20 }));
app.post('/api/compare', templateComparisonUpload());
```

### **Custom Upload Configuration**

```javascript
const { createUploader } = require('./middleware/upload');

const customUploader = createUploader('template', {
  maxFileSize: 20 * 1024 * 1024, // 20MB
  maxFiles: 5,
  preserveOriginalName: true
});

app.post('/api/custom', customUploader.array('files', 5));
```

### **File Cleanup**

```javascript
const { cleanupFiles, cleanupFilesDelayed } = require('./middleware/upload');

// Immediate cleanup
await cleanupFiles([req.file.path]);

// Delayed cleanup (5 minutes)
cleanupFilesDelayed([req.file.path], 300000);
```

## ✅ **Validation Middleware (validation.js)**

### **Features**
- **Joi-based schemas**: Type-safe validation
- **Custom file validation**: Integrated with upload middleware
- **Comprehensive schemas**: Templates, documents, users, categories
- **Detailed error messages**: User-friendly validation feedback
- **Sanitization**: Automatic data cleaning

### **Available Schemas**

```javascript
const { schemas } = require('./middleware/validation');

// Template schemas
schemas.template.create      // Create template
schemas.template.update      // Update template
schemas.template.search      // Search and filter
schemas.template.compare     // Template comparison

// Document schemas
schemas.document.generate    // Single document generation
schemas.document.batchGenerate // Batch document generation

// User schemas
schemas.user.register        // User registration
schemas.user.login          // User login
schemas.user.passwordReset  // Password reset

// Category schemas
schemas.category.create      // Create category
schemas.category.update      // Update category
```

### **Pre-configured Validation**

```javascript
const {
  validateTemplateCreate,
  validateTemplateUpdate,
  validateDocumentGenerate,
  validateUserRegister
} = require('./middleware/validation');

// Apply validation middleware
app.post('/api/templates', validateTemplateCreate);
app.put('/api/templates/:id', validateTemplateUpdate);
app.post('/api/documents', validateDocumentGenerate);
app.post('/api/auth/register', validateUserRegister);
```

### **Custom Validation**

```javascript
const { validate } = require('./middleware/validation');

const customSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  email: Joi.string().email().required()
});

app.post('/api/custom', validate(customSchema));
```

### **File Validation**

```javascript
const { validateFiles } = require('./middleware/validation');

// Validate required files and types
app.post('/api/upload', 
  uploadMiddleware,
  validateFiles({
    required: ['template', 'csv'],
    maxFiles: 2,
    allowedTypes: ['application/pdf', 'text/csv']
  }),
  routeHandler
);
```

## 🚨 **Error Handling Middleware (errorHandler.js)**

### **Features**
- **Structured error responses**: Consistent API error format
- **Request tracking**: Unique request IDs for debugging
- **Comprehensive logging**: Detailed error information
- **Error classification**: Operational vs system errors
- **Automatic error conversion**: Multer, Joi, MongoDB errors

### **Error Classes**

```javascript
const {
  ValidationError,        // 400 - Validation failed
  FileUploadError,        // 400 - File upload issues
  AuthenticationError,    // 401 - Authentication required
  AuthorizationError,     // 403 - Access denied
  NotFoundError,         // 404 - Resource not found
  ConflictError,         // 409 - Resource conflict
  RateLimitError,        // 429 - Too many requests
  ServiceUnavailableError, // 503 - Service unavailable
  DatabaseError,         // 500 - Database issues
  ExternalServiceError,  // 502 - External service issues
  FileProcessingError,   // 422 - File processing failed
  JobQueueError          // 500 - Job queue issues
} = require('./middleware/errorHandler');
```

### **Usage in Controllers**

```javascript
const { NotFoundError, ValidationError } = require('../middleware/errorHandler');

async function getTemplate(req, res, next) {
  try {
    const template = await Template.findById(req.params.id);
    
    if (!template) {
      throw new NotFoundError('Template not found');
    }
    
    res.json({ success: true, template });
  } catch (error) {
    next(error); // Pass to error handler
  }
}

// Or use asyncHandler wrapper
const getTemplate = asyncHandler(async (req, res) => {
  const template = await Template.findById(req.params.id);
  
  if (!template) {
    throw new NotFoundError('Template not found');
  }
  
  res.json({ success: true, template });
});
```

### **Error Response Format**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "statusCode": 400,
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "req_1705312200000_abc123def",
    "path": "/api/templates",
    "method": "POST",
    "details": [
      {
        "field": "name",
        "message": "Template name is required",
        "code": "VALIDATION_ANY_REQUIRED"
      }
    ],
    "help": "Please check your input and try again"
  }
}
```

## 🔧 **Integration Examples**

### **Complete Template Upload Route**

```javascript
const express = require('express');
const router = express.Router();

const { templateUpload } = require('../middleware/upload');
const { validateTemplateCreate, validateFiles } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

router.post('/templates',
  templateUpload('template'),
  validateFiles({ required: ['template'] }),
  validateTemplateCreate,
  asyncHandler(async (req, res) => {
    const template = await createTemplate(req.body, req.file);
    
    res.status(201).json({
      success: true,
      template,
      message: 'Template created successfully'
    });
  })
);
```

### **Template Comparison Route**

```javascript
const { templateComparisonUpload } = require('../middleware/upload');
const { validate } = require('../middleware/validation');
const { schemas } = require('../middleware/validation');

router.post('/templates/compare',
  templateComparisonUpload(),
  validate(schemas.template.compare),
  asyncHandler(async (req, res) => {
    const comparison = await compareTemplates(req.files);
    
    res.json({
      success: true,
      comparison
    });
  })
);
```

### **Batch Document Generation**

```javascript
const { batchUpload } = require('../middleware/upload');
const { validateBatchGenerate } = require('../middleware/validation');

router.post('/documents/batch',
  batchUpload('files'),
  validateBatchGenerate,
  asyncHandler(async (req, res) => {
    const job = await createBatchJob(req.body, req.files);
    
    res.json({
      success: true,
      jobId: job.id,
      message: 'Batch job created successfully'
    });
  })
);
```

## 📊 **Monitoring and Logging**

### **Request Tracking**

```javascript
// Request ID is automatically added to headers
// X-Request-ID: req_1705312200000_abc123def

// Response headers include request ID
res.set('X-Request-ID', req.requestId);
```

### **Error Logging**

```javascript
// Errors are automatically logged with context
logger.error('Database operation failed', {
  requestId: req.requestId,
  userId: req.user?.id,
  operation: 'createTemplate',
  error: error.message
});
```

### **Performance Monitoring**

```javascript
// Response time is automatically tracked
const responseTime = Date.now() - req.startTime;
logger.info('Request completed', { responseTime, path: req.path });
```

## 🛡️ **Security Features**

### **File Validation**
- MIME type checking
- File extension validation
- Size limits enforcement
- Malicious file detection

### **Input Sanitization**
- Automatic data cleaning
- SQL injection prevention
- XSS protection
- Path traversal prevention

### **Error Information**
- No sensitive data exposure
- Sanitized error messages
- Request ID tracking
- Audit trail logging

## 🚀 **Performance Optimizations**

### **File Processing**
- Stream-based file handling
- Asynchronous processing
- Memory-efficient operations
- Automatic cleanup

### **Validation**
- Early validation failure
- Efficient schema checking
- Minimal overhead
- Cached validation results

## 📝 **Best Practices**

### **1. Always Use Error Handling**
```javascript
// ❌ Don't do this
app.get('/api/data', (req, res) => {
  const data = getData(); // Might throw error
  res.json(data);
});

// ✅ Do this
app.get('/api/data', asyncHandler(async (req, res) => {
  const data = await getData();
  res.json({ success: true, data });
}));
```

### **2. Validate All Inputs**
```javascript
// ❌ Don't do this
app.post('/api/templates', (req, res) => {
  createTemplate(req.body); // No validation
});

// ✅ Do this
app.post('/api/templates', 
  validateTemplateCreate,
  asyncHandler(async (req, res) => {
    const template = await createTemplate(req.body);
    res.json({ success: true, template });
  })
);
```

### **3. Handle File Uploads Properly**
```javascript
// ❌ Don't do this
app.post('/api/upload', upload.single('file'), (req, res) => {
  // No file validation or cleanup
});

// ✅ Do this
app.post('/api/upload',
  templateUpload('file'),
  validateFiles({ required: ['file'] }),
  asyncHandler(async (req, res) => {
    const result = await processFile(req.file);
    // Files are automatically cleaned up
    res.json({ success: true, result });
  })
);
```

### **4. Use Appropriate Error Types**
```javascript
// ❌ Don't do this
throw new Error('User not found');

// ✅ Do this
throw new NotFoundError('User not found');
```

## 🔍 **Troubleshooting**

### **Common Issues**

1. **File Upload Fails**
   - Check file size limits
   - Verify file type support
   - Ensure upload directory exists

2. **Validation Errors**
   - Check Joi schema configuration
   - Verify required fields
   - Check data types

3. **Error Handling Issues**
   - Ensure errorHandler is last middleware
   - Check error class usage
   - Verify logging configuration

### **Debug Mode**

```javascript
// Enable detailed error information in development
if (process.env.NODE_ENV === 'development') {
  app.use((err, req, res, next) => {
    console.error('Detailed error:', err);
    next(err);
  });
}
```

## 📚 **Additional Resources**

- [Multer Documentation](https://github.com/expressjs/multer)
- [Joi Validation](https://joi.dev/)
- [Express Error Handling](https://expressjs.com/en/guide/error-handling.html)
- [Node.js File System](https://nodejs.org/api/fs.html)

---

**Need Help?** Check the error logs or create an issue with the request ID for faster debugging.
