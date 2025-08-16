# 🚀 Bulk Document Maker API Documentation

A comprehensive REST API for bulk document generation with template analysis, CSV processing, and automated document creation.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)
- [Request/Response Formats](#requestresponse-formats)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [File Uploads](#file-uploads)
- [Examples](#examples)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

## 🌟 Overview

The Bulk Document Maker API provides a robust solution for generating multiple documents from templates and CSV data. It supports various document formats, includes AI-powered template analysis, and offers comprehensive error handling and monitoring.

### Key Features

- **Template Analysis**: AI-powered extraction of placeholder variables
- **CSV Processing**: Efficient parsing and validation of data files
- **Batch Generation**: Process hundreds of documents simultaneously
- **Multiple Formats**: Support for PDF, DOCX, and TXT output
- **Progress Tracking**: Real-time monitoring of generation jobs
- **Email Notifications**: Automated status updates and completion alerts
- **Health Monitoring**: Comprehensive system health checks
- **Rate Limiting**: Built-in API protection and resource management

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ 
- npm or yarn
- Environment variables configured

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd bulk-document-maker-backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys and configuration

# Start the server
npm start
```

### Environment Variables

```bash
# Server Configuration
PORT=3000
NODE_ENV=development
APP_VERSION=1.0.0

# External API Keys
CRAFTMYPDF_API_KEY=your_craftmypdf_api_key
OPENAI_API_KEY=your_openai_api_key
SENDGRID_API_KEY=your_sendgrid_api_key

# Email Configuration
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=Your Company Name
REPLY_TO_EMAIL=support@yourdomain.com

# Optional Features
USE_AI=true
INITIALIZE_DATABASE=false
```

### Basic Usage

```bash
# Health check
curl http://localhost:3000/api/health

# API documentation
curl http://localhost:3000/api/docs

# Root endpoint
curl http://localhost:3000/
```

## 🔐 Authentication

Currently, the API runs in development mode without authentication. For production use, implement one of these authentication methods:

- **JWT Tokens**: Secure token-based authentication
- **API Keys**: Simple key-based access control
- **OAuth 2.0**: Full OAuth implementation
- **Session-based**: Traditional session authentication

## 📡 API Endpoints

### Health Check Endpoints

#### `GET /api/health`
Basic health check endpoint.

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "responseTime": "45ms",
  "version": "1.0.0",
  "environment": "development",
  "data": {
    "system": { ... },
    "checks": { ... },
    "summary": { ... }
  }
}
```

#### `GET /api/health/ready`
Readiness probe for Kubernetes/container orchestration.

#### `GET /api/health/live`
Liveness probe for Kubernetes/container orchestration.

#### `GET /api/health/detailed`
Comprehensive health check with verbose information.

### Template Analysis Endpoints

#### `POST /api/templates/analyze`
Analyze a template file and extract required variables.

**Request:**
```bash
curl -X POST http://localhost:3000/api/templates/analyze \
  -F "template=@template.docx" \
  -F "useAI=true" \
  -F "extractStructure=true" \
  -F "generateDescriptions=true"
```

**Response:**
```json
{
  "success": true,
  "message": "Template analysis completed successfully",
  "data": {
    "templateId": "template_1705312200000_abc123",
    "fileName": "template.docx",
    "fileType": "docx",
    "placeholders": [
      {
        "name": "firstName",
        "syntax": "[firstName]",
        "type": "string",
        "description": "Employee's first name",
        "required": true,
        "suggestions": ["John", "Jane", "Bob"]
      }
    ],
    "structure": { ... },
    "metadata": { ... }
  }
}
```

#### `POST /api/templates/compare`
Compare two templates for similarity and differences.

**Request:**
```bash
curl -X POST http://localhost:3000/api/templates/compare \
  -F "templates=@template1.docx" \
  -F "templates=@template2.docx"
```

### Document Generation Endpoints

#### `POST /api/documents/generate`
Generate documents from template and CSV data.

**Request:**
```bash
curl -X POST http://localhost:3000/api/documents/generate \
  -F "template=@template.docx" \
  -F "csv=@data.csv" \
  -F "options[format]=pdf" \
  -F "options[quality]=high" \
  -F "options[batchSize]=10" \
  -F "options[watermark]=CONFIDENTIAL" \
  -F "notification[email]=user@example.com"
```

**Response:**
```json
{
  "success": true,
  "message": "Document generation job created successfully",
  "data": {
    "batchId": "job_1705312200000_abc123def",
    "statusUrl": "/api/documents/job_1705312200000_abc123def/status",
    "downloadUrl": "/api/documents/job_1705312200000_abc123def/download",
    "totalDocuments": 100,
    "estimatedTime": "5 minutes",
    "jobStatus": "pending",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

#### `GET /api/documents/:batchId/status`
Check generation progress for a batch.

**Response:**
```json
{
  "success": true,
  "message": "Batch status retrieved successfully",
  "data": {
    "batchId": "job_1705312200000_abc123def",
    "status": "processing",
    "progress": 45,
    "totalDocuments": 100,
    "completedDocuments": 45,
    "failedDocuments": 0,
    "pendingDocuments": 55,
    "estimatedTimeRemaining": "3 minutes",
    "results": [ ... ],
    "errors": [ ... ]
  }
}
```

#### `GET /api/documents/:batchId/download`
Download ZIP file containing all generated documents.

**Response:** ZIP file stream (only available when batch is completed)

#### `POST /api/documents/:batchId/cancel`
Cancel a running generation job.

#### `DELETE /api/documents/:batchId`
Delete a batch and clean up generated files.

#### `GET /api/documents`
List all batches with pagination and filtering.

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 25)
- `status`: Filter by status (pending, processing, completed, failed)
- `sortBy`: Sort field (default: createdAt)
- `sortOrder`: Sort direction (asc, desc)

### Utility Endpoints

#### `GET /`
Root endpoint with API information and available endpoints.

#### `GET /api/docs`
Comprehensive API documentation with examples and schemas.

## 📊 Request/Response Formats

### Standard Response Format

All API responses follow this standard format:

```json
{
  "success": true|false,
  "message": "Human-readable message",
  "data": { ... },
  "error": { ... } // Only present on errors
}
```

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "statusCode": 400,
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "req_1705312200000_abc123",
    "path": "/api/documents/generate",
    "method": "POST",
    "details": [
      {
        "field": "template",
        "message": "Template file is required",
        "code": "VALIDATION_ERROR"
      }
    ],
    "help": "Please check your input and try again"
  }
}
```

### File Upload Format

All file uploads use `multipart/form-data`:

```bash
# Single file
-F "file=@filename.ext"

# Multiple files
-F "files=@file1.ext" -F "files=@file2.ext"

# With additional data
-F "template=@template.docx" \
-F "options[format]=pdf" \
-F "options[quality]=high"
```

## ❌ Error Handling

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `404` - Not Found
- `422` - Unprocessable Entity
- `429` - Too Many Requests (rate limiting)
- `500` - Internal Server Error
- `503` - Service Unavailable

### Error Types

- **ValidationError**: Input validation failed
- **FileUploadError**: File upload issues
- **NotFoundError**: Resource not found
- **FileProcessingError**: File processing failed
- **ExternalServiceError**: External API issues
- **RateLimitError**: Rate limit exceeded

### Error Handling Best Practices

```javascript
try {
  const response = await api.post('/api/documents/generate', formData);
  // Handle success
} catch (error) {
  if (error.response) {
    const { status, data } = error.response;
    
    switch (status) {
      case 400:
        console.log('Validation error:', data.error.details);
        break;
      case 404:
        console.log('Resource not found');
        break;
      case 429:
        console.log('Rate limited, retry later');
        break;
      default:
        console.log('Unexpected error:', data.error.message);
    }
  } else {
    console.log('Network error:', error.message);
  }
}
```

## 🚦 Rate Limiting

The API implements intelligent rate limiting:

- **Document Generation**: 60 requests per minute
- **Template Analysis**: 120 requests per minute
- **Health Checks**: 300 requests per minute
- **Other Endpoints**: 200 requests per minute

### Rate Limit Headers

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1705312260
Retry-After: 15
```

### Handling Rate Limits

```javascript
if (error.response?.status === 429) {
  const retryAfter = error.response.headers['retry-after'];
  console.log(`Rate limited. Retry after ${retryAfter} seconds`);
  
  // Wait and retry
  setTimeout(() => {
    // Retry request
  }, retryAfter * 1000);
}
```

## 📁 File Uploads

### Supported File Types

#### Templates
- **DOCX**: Microsoft Word documents
- **PDF**: Portable Document Format
- **TXT**: Plain text files

#### Data Files
- **CSV**: Comma-separated values
- **TXT**: Tab-delimited or custom-delimited text

### File Size Limits

- **Template Files**: 10MB maximum
- **CSV Files**: 5MB maximum
- **Total Upload**: 50MB maximum

### File Validation

The API automatically validates:

- File type (MIME type checking)
- File size limits
- File content integrity
- Required file presence

### Upload Example

```javascript
const formData = new FormData();
formData.append('template', templateFile);
formData.append('csv', csvFile);
formData.append('options[format]', 'pdf');
formData.append('options[quality]', 'high');

const response = await axios.post('/api/documents/generate', formData, {
  headers: formData.getHeaders()
});
```

## 💡 Examples

### Complete Document Generation Workflow

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

class DocumentGenerator {
  constructor(baseURL) {
    this.api = axios.create({ baseURL });
  }

  async generateDocuments(templatePath, csvPath, options = {}) {
    try {
      // 1. Create generation job
      const job = await this.createJob(templatePath, csvPath, options);
      console.log(`Job created: ${job.batchId}`);

      // 2. Monitor progress
      const result = await this.monitorJob(job.batchId);
      console.log(`Job completed: ${result.status}`);

      // 3. Download results
      if (result.status === 'completed') {
        await this.downloadDocuments(job.batchId, 'output.zip');
        console.log('Documents downloaded successfully');
      }

      return result;
    } catch (error) {
      console.error('Generation failed:', error.message);
      throw error;
    }
  }

  async createJob(templatePath, csvPath, options) {
    const formData = new FormData();
    formData.append('template', fs.createReadStream(templatePath));
    formData.append('csv', fs.createReadStream(csvPath));
    
    Object.entries(options).forEach(([key, value]) => {
      formData.append(`options[${key}]`, value);
    });

    const response = await this.api.post('/api/documents/generate', formData, {
      headers: formData.getHeaders()
    });

    return response.data.data;
  }

  async monitorJob(batchId) {
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes with 5-second intervals

    while (attempts < maxAttempts) {
      const response = await this.api.get(`/api/documents/${batchId}/status`);
      const job = response.data.data;

      console.log(`Progress: ${job.progress}% (${job.completedDocuments}/${job.totalDocuments})`);

      if (job.status === 'completed' || job.status === 'failed') {
        return job;
      }

      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      attempts++;
    }

    throw new Error('Job monitoring timeout');
  }

  async downloadDocuments(batchId, outputPath) {
    const response = await this.api.get(`/api/documents/${batchId}/download`, {
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }
}

// Usage
const generator = new DocumentGenerator('http://localhost:3000');

generator.generateDocuments(
  'template.docx',
  'data.csv',
  { format: 'pdf', quality: 'high' }
).then(result => {
  console.log('Workflow completed successfully');
}).catch(error => {
  console.error('Workflow failed:', error.message);
});
```

### Template Analysis with AI

```javascript
async function analyzeTemplate(templatePath) {
  const formData = new FormData();
  formData.append('template', fs.createReadStream(templatePath));
  formData.append('useAI', 'true');
  formData.append('extractStructure', 'true');
  formData.append('generateDescriptions', 'true');

  const response = await axios.post('/api/templates/analyze', formData, {
    headers: formData.getHeaders()
  });

  const analysis = response.data.data;
  
  console.log('Template Analysis Results:');
  console.log(`- File: ${analysis.fileName}`);
  console.log(`- Type: ${analysis.fileType}`);
  console.log(`- Placeholders: ${analysis.placeholders.length}`);
  
  analysis.placeholders.forEach(placeholder => {
    console.log(`  • ${placeholder.name}: ${placeholder.description}`);
  });

  return analysis;
}
```

### Health Monitoring

```javascript
async function monitorSystemHealth() {
  try {
    // Basic health check
    const basic = await axios.get('/api/health');
    console.log(`System Status: ${basic.data.status}`);

    // Detailed health check
    const detailed = await axios.get('/api/health/detailed');
    const checks = detailed.data.data.checks;
    
    console.log('\nDetailed Health Status:');
    Object.entries(checks).forEach(([service, check]) => {
      const status = check.status === 'healthy' ? '✅' : 
                    check.status === 'degraded' ? '⚠️' : '❌';
      console.log(`${status} ${service}: ${check.status}`);
    });

    // Check for issues
    const unhealthy = Object.values(checks).filter(c => c.status === 'unhealthy');
    if (unhealthy.length > 0) {
      console.log(`\n⚠️  ${unhealthy.length} services are unhealthy`);
    }

  } catch (error) {
    console.error('Health check failed:', error.message);
  }
}

// Monitor every 5 minutes
setInterval(monitorSystemHealth, 5 * 60 * 1000);
monitorSystemHealth(); // Initial check
```

## 🧪 Testing

### Running Tests

```bash
# Install test dependencies
npm install --save-dev axios form-data

# Run comprehensive tests
node test-api-comprehensive.js

# Run with custom API URL
API_BASE_URL=http://localhost:3000 node test-api-comprehensive.js
```

### Test Coverage

The test suite covers:

- ✅ Health check endpoints
- ✅ Template analysis
- ✅ Document generation
- ✅ Job monitoring
- ✅ File downloads
- ✅ Error handling
- ✅ Rate limiting
- ✅ API documentation

### Manual Testing

```bash
# Health check
curl http://localhost:3000/api/health

# Template analysis
curl -X POST http://localhost:3000/api/templates/analyze \
  -F "template=@test-template.txt"

# Document generation
curl -X POST http://localhost:3000/api/documents/generate \
  -F "template=@test-template.txt" \
  -F "csv=@test-data.csv"
```

## 🚀 Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure all API keys
- [ ] Set up SSL/TLS certificates
- [ ] Configure reverse proxy (nginx/Apache)
- [ ] Set up monitoring and logging
- [ ] Configure backup strategies
- [ ] Set up CI/CD pipeline
- [ ] Configure rate limiting
- [ ] Set up authentication
- [ ] Configure CORS properly

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

```bash
# Build and run
docker build -t bulk-doc-generator .
docker run -p 3000:3000 --env-file .env bulk-doc-generator
```

### Environment-Specific Configuration

```bash
# Development
NODE_ENV=development
LOG_LEVEL=debug
CORS_ORIGIN=http://localhost:3000

# Staging
NODE_ENV=staging
LOG_LEVEL=info
CORS_ORIGIN=https://staging.yourapp.com

# Production
NODE_ENV=production
LOG_LEVEL=warn
CORS_ORIGIN=https://yourapp.com
```

## 🔧 Troubleshooting

### Common Issues

#### 1. File Upload Failures

**Problem:** File upload returns 400 error
**Solution:** Check file size, type, and required fields

```bash
# Verify file size
ls -lh template.docx

# Check file type
file template.docx

# Validate CSV format
head -5 data.csv
```

#### 2. Job Stuck in Processing

**Problem:** Job status remains "processing" indefinitely
**Solution:** Check external API connectivity and logs

```bash
# Check health status
curl http://localhost:3000/api/health/detailed

# Check logs
tail -f logs/app.log

# Restart service if needed
npm restart
```

#### 3. Memory Issues

**Problem:** High memory usage or crashes
**Solution:** Optimize batch sizes and monitor resources

```bash
# Check memory usage
curl http://localhost:3000/api/health | jq '.data.system.memory'

# Reduce batch size
curl -X POST http://localhost:3000/api/documents/generate \
  -F "options[batchSize]=5" # Reduce from default 10
```

#### 4. Rate Limiting

**Problem:** Getting 429 errors
**Solution:** Implement exponential backoff and respect rate limits

```javascript
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function makeRequestWithRetry() {
  try {
    return await api.post('/api/documents/generate', formData);
  } catch (error) {
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'] || 60;
      console.log(`Rate limited, waiting ${retryAfter} seconds...`);
      await delay(retryAfter * 1000);
      return await api.post('/api/documents/generate', formData);
    }
    throw error;
  }
}
```

### Debug Mode

Enable debug logging:

```bash
# Set debug environment variable
DEBUG=* npm start

# Or set log level
LOG_LEVEL=debug npm start
```

### Performance Monitoring

```bash
# Check response times
curl -w "@curl-format.txt" http://localhost:3000/api/health

# Monitor system resources
curl http://localhost:3000/api/health/detailed | jq '.data.checks.system'
```

## 📚 Additional Resources

### API Documentation

- **Swagger/OpenAPI**: `/api/docs`
- **Health Dashboard**: `/api/health/detailed`
- **Root Endpoint**: `/` (overview and links)

### SDKs and Libraries

- **JavaScript/Node.js**: Built-in examples above
- **Python**: Use `requests` library with examples above
- **PHP**: Use `cURL` or `Guzzle` HTTP client
- **Java**: Use `OkHttp` or `Apache HttpClient`
- **C#**: Use `HttpClient` or `RestSharp`

### Support

- **Documentation**: This README and `/api/docs`
- **Health Checks**: `/api/health` endpoints
- **Logs**: Check application logs for detailed error information
- **Issues**: Create GitHub issues for bugs or feature requests

---

**Built with ❤️ for the Bulk Document Maker platform**

*Last updated: January 2024*
*API Version: 1.0.0*
