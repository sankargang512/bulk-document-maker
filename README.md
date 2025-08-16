# Bulk Document Maker Backend

A robust Node.js/Express backend API for bulk document generation service, designed for HR professionals, schools, agencies, and legal teams.

## 🚀 Features

- **Document Generation**: Bulk create documents from templates and CSV data
- **Template Management**: Upload, analyze, and manage document templates
- **Job Queue System**: Efficient processing with progress tracking
- **File Processing**: Support for DOCX, PDF, HTML templates
- **CSV Integration**: Parse and map CSV data to template fields
- **Email Notifications**: Automated email delivery of generated documents
- **Make.com Integration**: Webhook support for external automation
- **Security**: Rate limiting, CORS, input validation
- **Logging**: Comprehensive logging with rotation
- **Database**: SQLite with automatic schema management

## 🛠️ Tech Stack

- **Runtime**: Node.js (>=18.0.0)
- **Framework**: Express.js
- **Database**: SQLite3
- **File Processing**: Docx, PDF-lib, Puppeteer
- **Validation**: Joi
- **File Uploads**: Multer
- **Email**: Nodemailer
- **Security**: Helmet, CORS, Rate Limiting
- **Logging**: Custom logging service with rotation

## 📁 Project Structure

```
bulk-document-maker-backend/
├── .cursorrules              # Development guidelines
├── package.json              # Dependencies and scripts
├── server.js                 # Main server file
├── env.example               # Environment variables template
├── config/
│   └── config.js            # Application configuration
├── routes/                   # API route definitions
│   ├── documents.js         # Document generation routes
│   ├── templates.js         # Template management routes
│   └── health.js            # Health check routes
├── controllers/              # Request/response handlers
│   ├── documentController.js # Document generation logic
│   ├── templateController.js # Template management logic
│   └── emailController.js    # Email handling logic
├── services/                 # Business logic services
│   ├── csvParser.js         # CSV parsing and validation
│   ├── documentGenerator.js # Document generation engine
│   ├── templateAnalyzer.js  # Template analysis and field extraction
│   ├── emailService.js      # Email sending service
│   ├── databaseService.js   # Database operations
│   ├── jobQueueService.js   # Job queue management
│   └── loggingService.js    # Application logging
├── middleware/               # Express middleware
│   ├── upload.js            # File upload handling
│   ├── validation.js        # Request validation
│   └── errorHandler.js      # Error handling middleware
├── utils/                    # Utility functions
│   ├── fileUtils.js         # File operations
│   └── responseUtils.js     # Response formatting
├── database/                 # Database files
│   ├── database.sqlite      # SQLite database
│   └── init.js              # Database initialization
├── uploads/                  # Uploaded files
├── generated/                # Generated documents
├── temp/                     # Temporary files
└── logs/                     # Application logs
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd bulk-document-maker-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Initialize the database**
   ```bash
   node database/init.js
   ```

5. **Start the server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

The server will start on `http://localhost:3001` (or the port specified in your `.env` file).

## 🔧 Configuration

### Environment Variables

Create a `.env` file based on `env.example`:

```bash
# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Email Configuration
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Make.com Integration
MAKE_WEBHOOK_URL=https://hook.eu1.make.com/your-webhook
MAKE_API_KEY=your-api-key
MAKE_ENABLED=true
```

### Database Configuration

The application uses SQLite by default. The database will be automatically created and initialized when you run `node database/init.js`.

## 📚 API Documentation

### Base URL
```
http://localhost:3001/api
```

### Endpoints

#### Health Check
- `GET /health` - Basic health status
- `GET /health/detailed` - Detailed system information

#### Templates
- `POST /templates/upload` - Upload a new template
- `GET /templates` - List all templates
- `GET /templates/:id` - Get template details
- `PUT /templates/:id` - Update template
- `DELETE /templates/:id` - Delete template
- `POST /templates/:id/analyze` - Analyze template fields
- `GET /templates/:id/preview` - Preview template
- `GET /templates/:id/fields` - Get template fields

#### Documents
- `POST /documents/generate` - Generate documents from template + CSV
- `POST /documents/generate-batch` - Batch document generation
- `GET /documents` - List all documents
- `GET /documents/:id` - Get document details
- `GET /documents/:id/download` - Download generated document
- `GET /documents/:id/status` - Get document status
- `POST /documents/:id/retry` - Retry failed generation
- `DELETE /documents/:id` - Delete document

#### Webhooks
- `POST /documents/webhook/make` - Make.com webhook integration

## 🔄 Job Queue System

The backend includes a robust job queue system for managing document generation:

- **Concurrent Processing**: Configurable number of simultaneous jobs
- **Priority Queue**: High, normal, and low priority jobs
- **Progress Tracking**: Real-time progress updates
- **Error Handling**: Automatic retry and failure handling
- **Persistence**: Jobs survive server restarts

### Job States
- `queued` - Waiting in queue
- `running` - Currently processing
- `completed` - Successfully finished
- `failed` - Failed with errors
- `cancelled` - User cancelled

## 📧 Email Integration

The email service supports:
- Multiple email providers (Gmail, SMTP, etc.)
- Template-based emails
- Attachment support
- Delivery tracking
- Error handling and retries

## 🔒 Security Features

- **Rate Limiting**: Configurable request limits per IP
- **CORS**: Cross-origin resource sharing configuration
- **Input Validation**: Joi schema validation
- **File Upload Security**: File type and size restrictions
- **Helmet**: Security headers
- **Error Handling**: Secure error responses

## 📊 Monitoring and Logging

### Logging Levels
- `error` - Error conditions
- `warn` - Warning conditions
- `info` - General information
- `debug` - Debug information

### Log Rotation
- Automatic log rotation based on size
- Configurable retention period
- Compressed archive files

### Health Monitoring
- System resource monitoring
- Database connectivity checks
- Directory accessibility verification
- Performance metrics

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 🚀 Deployment

### Production Considerations

1. **Environment Variables**: Set all production environment variables
2. **Database**: Consider using PostgreSQL for production
3. **File Storage**: Use cloud storage (AWS S3, Google Cloud Storage)
4. **Process Management**: Use PM2 or similar process manager
5. **Reverse Proxy**: Use Nginx or Apache
6. **SSL/TLS**: Enable HTTPS
7. **Monitoring**: Set up application monitoring

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the API endpoints

## 🔮 Roadmap

- [ ] Real-time WebSocket updates
- [ ] Advanced template editor
- [ ] Multi-format export support
- [ ] Advanced field mapping
- [ ] Template versioning
- [ ] User authentication and authorization
- [ ] API rate limiting per user
- [ ] Advanced analytics and reporting
- [ ] Cloud deployment templates
- [ ] Mobile app support

## Template Analyzer Service

The `TemplateAnalyzer` service provides comprehensive analysis of document templates to support bulk document generation workflows.

### Features

#### 🔍 **Multi-Format Support**
- **DOCX/DOC**: Microsoft Word documents using mammoth.js
- **PDF**: PDF documents using pdf-parse
- **TXT/HTML**: Plain text and HTML files
- **Auto-detection**: Automatically detects file type from extension

#### 🏷️ **Advanced Placeholder Detection**
- **Standard patterns**: `{{placeholder}}`, `$variable`, `[field]`, `{value}`, `%data%`
- **Conditional logic**: `{{#if condition}}`, `{{#unless condition}}`
- **Loop structures**: `{{#each array}}`, `{{#for item in array}}`
- **Partials & Helpers**: `{{> partial}}`, `{{@helper}}`

#### 📊 **Smart Categorization**
Placeholders are automatically categorized by type:
- **Text**: Names, descriptions, general text
- **Numbers**: Amounts, prices, quantities, counts
- **Dates**: Dates, times, days, months, years
- **Contact**: Emails, phones, addresses
- **Custom**: Special patterns and advanced features

#### 🏗️ **Document Structure Analysis**
- **Section detection**: Identifies document sections and boundaries
- **Heading hierarchy**: Analyzes heading levels and types
- **List identification**: Detects bullet, numbered, and lettered lists
- **Table detection**: Identifies tabular data structures
- **Paragraph analysis**: Counts and analyzes text paragraphs

#### ⚡ **Performance Estimation**
- **Processing time**: Estimates generation time for bulk operations
- **Complexity scoring**: Simple, Medium, or Complex classification
- **Resource analysis**: File size, word count, and placeholder impact
- **Scalability insights**: Performance predictions for large batches

#### 🧪 **Sample Data Generation**
- **Auto-generated samples**: Creates realistic test data for all placeholders
- **Type-aware values**: Generates appropriate data types (dates, emails, etc.)
- **Multiple samples**: Creates multiple rows for testing loops and variations
- **Realistic content**: Uses common names, addresses, and business data

#### ✅ **Template Validation**
- **File size limits**: Configurable maximum file sizes
- **Word count limits**: Document length restrictions
- **Placeholder limits**: Maximum number of dynamic fields
- **Compatibility checks**: Ensures templates meet system requirements

### Usage Examples

#### Basic Template Analysis
```javascript
const templateAnalyzer = require('./services/templateAnalyzer');

// Analyze a template
const analysis = await templateAnalyzer.analyzeTemplate(
  '/path/to/template.docx', 
  'docx'
);

console.log(`Template has ${analysis.placeholders.count} placeholders`);
console.log(`Complexity: ${analysis.complexity}`);
```

#### Generate Sample Data
```javascript
// Create sample data for testing
const sampleData = templateAnalyzer.generateSampleData(
  analysis.placeholders, 
  5 // Generate 5 sample rows
);

// Use sample data for preview or testing
sampleData.forEach((row, index) => {
  console.log(`Row ${index + 1}:`, row);
});
```

#### Estimate Processing Time
```javascript
// Estimate time for generating 1000 documents
const estimate = templateAnalyzer.estimateProcessingTime(analysis, 1000);

console.log(`Estimated total time: ${estimate.totalTime}ms`);
console.log(`Per document: ${estimate.perDocument}ms`);
console.log(`Complexity factor: ${estimate.complexity}`);
```

### API Integration

The template analyzer is integrated into the API through:

- **`POST /api/templates/upload`**: Analyzes uploaded templates
- **`GET /api/templates/:id/fields`**: Returns analyzed fields with samples
- **`POST /api/templates/:id/analyze`**: Performs detailed analysis
- **`GET /api/templates/:id/preview`**: Generates previews with sample data

### Testing

Run the template analyzer test:

```bash
npm run test:analyzer
```

This will create a sample employment contract template and demonstrate all analysis features.

### Configuration

Template validation limits can be configured in the `validateTemplate` method:

```javascript
// Current limits
- Maximum file size: 10MB
- Maximum word count: 10,000 words  
- Maximum placeholders: 50 fields
```

### Performance Considerations

- **Large files**: Analysis time scales with file size and complexity
- **Complex templates**: Templates with many placeholders take longer to process
- **Batch processing**: Use processing estimates for large document generation jobs
- **Caching**: Consider caching analysis results for frequently used templates
