# Bulk Document Maker API Documentation

## Overview
The Bulk Document Maker API is a production-ready REST API for generating personalized documents from templates and CSV data. It's designed for HR professionals, schools, agencies, and legal teams who need to generate large volumes of personalized documents.

## Base URL
```
http://localhost:3001/api
```

## Authentication
Currently, the API uses API key authentication. Include your API key in the `X-API-Key` header:
```
X-API-Key: your-api-key-here
```

## Rate Limiting
- **Limit**: 100 requests per 15 minutes per IP
- **Headers**: Rate limit information is included in response headers

## Health Check

### GET /api/health
Check the overall health status of the API.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "memory": {
    "rss": 123456789,
    "heapTotal": 987654321,
    "heapUsed": 123456789,
    "external": 12345
  },
  "environment": "development",
  "directories": {
    "uploads": "accessible",
    "generated": "accessible",
    "temp": "accessible",
    "database": "connected"
  }
}
```

### GET /api/health/detailed
Get detailed system information.

## Document Generation

### POST /api/documents/generate
Generate documents from a single template and CSV data.

**Request:**
- **Content-Type**: `multipart/form-data`
- **Files**:
  - `template`: Template file (DOCX, DOC, PDF, HTML)
  - `csvData`: CSV file with data
- **Body**:
  - `email` (optional): Email for notifications
  - `customFields` (optional): Additional field mappings
  - `outputFormat` (optional): Output format (docx, pdf, txt, html) - defaults to docx

**Response:**
```json
{
  "success": true,
  "jobId": "uuid-here",
  "message": "Generated 100 documents",
  "downloadUrl": "/api/documents/batch/uuid-here/download",
  "statusUrl": "/api/documents/batch/uuid-here/status",
  "jobInfo": {
    "id": "uuid-here",
    "status": "completed",
    "templateName": "contract.docx",
    "recordsProcessed": 100,
    "documentsGenerated": 100,
    "outputFormat": "docx",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "email": "user@example.com"
  }
}
```

### POST /api/documents/generate-batch
Generate documents from multiple templates and CSV data.

**Request:**
- **Content-Type**: `multipart/form-data`
- **Files**:
  - `templates`: Multiple template files (max 10)
  - `csvData`: CSV file with data
- **Body**:
  - `email` (optional): Email for notifications
  - `customFields` (optional): Additional field mappings
  - `outputFormat` (optional): Output format (docx, pdf, txt, html) - defaults to docx

**Response:**
```json
{
  "success": true,
  "jobId": "uuid-here",
  "status": "completed",
  "message": "Generated 300 documents from 3 templates",
  "downloadUrl": "/api/documents/batch/uuid-here/download",
  "statusUrl": "/api/documents/batch/uuid-here/status",
  "results": [
    {
      "templateName": "contract.docx",
      "success": true,
      "documentsGenerated": 100
    }
  ],
  "summary": {
    "totalTemplates": 3,
    "successfulTemplates": 3,
    "failedTemplates": 0,
    "totalDocuments": 300
  }
}
```

## Document Status & Management

### GET /api/documents/:id/status
Get the status of a single document generation job.

**Response:**
```json
{
  "success": true,
  "document": {
    "id": "uuid-here",
    "status": "completed",
    "progress": 100,
    "templateName": "contract.docx",
    "recordsProcessed": 100,
    "documentsGenerated": 100,
    "outputFormat": "docx",
    "startedAt": "2024-01-15T10:30:00.000Z",
    "completedAt": "2024-01-15T10:31:00.000Z"
  }
}
```

### GET /api/documents/batch/:batchId/status
Get the status of a batch document generation job.

**Response:**
```json
{
  "success": true,
  "batch": {
    "id": "uuid-here",
    "status": "completed",
    "progress": 100,
    "templateCount": 3,
    "totalRecords": 100,
    "documentsGenerated": 300,
    "outputFormat": "docx",
    "startedAt": "2024-01-15T10:30:00.000Z",
    "completedAt": "2024-01-15T10:35:00.000Z",
    "downloadUrl": "/api/documents/batch/uuid-here/download",
    "templates": [
      {
        "name": "contract.docx",
        "status": "completed",
        "documentsGenerated": 100
      }
    ]
  }
}
```

### POST /api/documents/batch/status
Get status for multiple batch jobs.

**Request:**
```json
{
  "ids": ["uuid1", "uuid2", "uuid3"]
}
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "total": 3,
    "completed": 2,
    "processing": 1,
    "failed": 0,
    "notFound": 0
  },
  "statuses": [
    {
      "id": "uuid1",
      "status": "completed",
      "progress": 100,
      "documentsGenerated": 100
    }
  ]
}
```

## Document Download

### GET /api/documents/:id/download
Download a single generated document.

### GET /api/documents/batch/:batchId/download
Download all documents from a batch as a ZIP file.

**Response:**
- **Content-Type**: `application/zip`
- **File**: ZIP archive containing all generated documents

## Template Management

### POST /api/templates/upload
Upload a new template.

**Request:**
- **Content-Type**: `multipart/form-data`
- **Files**:
  - `template`: Template file
- **Body**:
  - `name` (optional): Template name
  - `category` (optional): Template category
  - `description` (optional): Template description
  - `tags` (optional): Array of tags
  - `isPublic` (optional): Whether template is public

**Response:**
```json
{
  "success": true,
  "template": {
    "id": "uuid-here",
    "name": "Employment Contract",
    "filename": "contract.docx",
    "size": 12345,
    "category": "HR Documents",
    "placeholders": {
      "count": 15,
      "all": ["employeeName", "startDate", "salary"],
      "categorized": {
        "text": ["employeeName"],
        "date": ["startDate"],
        "number": ["salary"]
      }
    },
    "complexity": "Medium",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### POST /api/templates/analyze
Analyze a template without uploading it (for new templates).

**Request:**
- **Content-Type**: `multipart/form-data`
- **Files**:
  - `template`: Template file to analyze

**Response:**
```json
{
  "success": true,
  "analysis": {
    "filename": "contract.docx",
    "fileSize": 12345,
    "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "wordCount": 500,
    "paragraphCount": 25,
    "complexity": "Medium",
    "placeholders": {
      "count": 15,
      "all": ["employeeName", "startDate", "salary"],
      "categorized": {
        "text": ["employeeName"],
        "date": ["startDate"],
        "number": ["salary"]
      }
    },
    "structure": {
      "sections": 5,
      "headings": 3,
      "lists": 2,
      "tables": 1
    },
    "validation": {
      "isValid": true,
      "issues": []
    }
  },
  "fields": [
    {
      "name": "employeeName",
      "type": "text",
      "required": true,
      "description": "Full name of the employee",
      "sample": "John Doe",
      "mapping": ["fullName", "name", "complete_name"]
    }
  ],
  "sampleData": [
    {
      "employeeName": "John Doe",
      "startDate": "2024-01-15",
      "salary": "75000"
    }
  ],
  "processingEstimate": {
    "timePerDocument": "2.5s",
    "totalTime": "4m 10s",
    "recommendedBatchSize": 100
  },
  "fieldMapping": {
    "employeeName": ["fullName", "name", "complete_name"],
    "startDate": ["date", "startDate", "effectiveDate"],
    "salary": ["salary", "amount", "price", "rate"]
  },
  "recommendations": [
    {
      "type": "success",
      "message": "Template is well-structured and ready for bulk generation",
      "action": "none"
    }
  ]
}
```

### GET /api/templates/:id/fields
Get template fields and analysis for an uploaded template.

**Response:**
```json
{
  "success": true,
  "fields": [
    {
      "name": "employeeName",
      "type": "text",
      "required": true,
      "description": "Full name of the employee",
      "sample": "John Doe"
    }
  ],
  "analysis": {
    "totalFields": 15,
    "categorizedFields": {
      "text": 8,
      "date": 3,
      "number": 4
    },
    "complexity": "Medium",
    "structure": {
      "sections": 5,
      "headings": 3,
      "lists": 2,
      "tables": 1
    },
    "processingEstimate": {
      "timePerDocument": "2.5s",
      "totalTime": "4m 10s"
    }
  },
  "sampleData": [
    {
      "employeeName": "John Doe",
      "startDate": "2024-01-15",
      "salary": "75000"
    }
  ]
}
```

## Error Handling

All endpoints return consistent error responses:

**Error Response Format:**
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": "Additional error details"
}
```

**Common HTTP Status Codes:**
- `200`: Success
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (missing/invalid API key)
- `404`: Not Found
- `429`: Too Many Requests (rate limit exceeded)
- `500`: Internal Server Error

## File Upload Limits

- **Template files**: Max 10MB
- **CSV files**: Max 5MB
- **Total request size**: Max 50MB

## Supported File Formats

### Templates
- DOCX (Microsoft Word)
- DOC (Microsoft Word)
- PDF (Portable Document Format)
- HTML (HyperText Markup Language)

### Data
- CSV (Comma-Separated Values)
- XLSX (Microsoft Excel)
- XLS (Microsoft Excel)

### Output
- DOCX (Microsoft Word)
- PDF (Portable Document Format)
- TXT (Plain Text)
- HTML (HyperText Markup Language)

## Webhook Integration

### POST /api/documents/webhook/make
Handle Make.com webhook events.

**Request:**
```json
{
  "event": "document_generated",
  "data": {
    "jobId": "uuid-here",
    "status": "completed"
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "signature": "webhook-signature"
}
```

## Best Practices

1. **Batch Processing**: Use batch endpoints for large document sets
2. **Status Monitoring**: Check job status before attempting download
3. **Error Handling**: Always check the `success` field in responses
4. **File Validation**: Ensure templates and CSV data are properly formatted
5. **Rate Limiting**: Implement exponential backoff for rate limit errors
6. **Webhooks**: Use webhooks for real-time status updates in production

## Testing

Test the API endpoints using the provided test scripts:

```bash
# Test template analyzer
npm run test:analyzer

# Test API health
curl http://localhost:3001/api/health

# Test document generation (with sample files)
# Use the /api/templates/analyze endpoint first to validate templates
```

## Support

For API support and questions:
- Email: support@bulkdocgenerator.com
- Documentation: `/api/docs` (when implemented)
- Health Check: `/api/health`
