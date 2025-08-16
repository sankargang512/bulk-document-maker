const DocumentController = require('../../controllers/documentController');
const Document = require('../../models/Document');
const Template = require('../../models/Template');
const DocumentGenerator = require('../../services/documentGenerator');
const CSVParser = require('../../services/csvParser');
const EmailService = require('../../services/emailService');

// Mock dependencies
jest.mock('../../models/Document');
jest.mock('../../models/Template');
jest.mock('../../services/documentGenerator');
jest.mock('../../services/csvParser');
jest.mock('../../services/emailService');

describe('Document Controller', () => {
  let documentController;
  let mockReq;
  let mockRes;
  
  beforeEach(() => {
    documentController = new DocumentController();
    jest.clearAllMocks();
    
    // Mock request and response objects
    mockReq = {
      body: {},
      params: {},
      query: {},
      files: {},
      user: { id: 1, email: 'user@example.com' }
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('createDocument', () => {
    it('should create document successfully', async () => {
      const documentData = {
        templateId: 1,
        csvData: 'name,email\nJohn Doe,john@example.com',
        options: { format: 'docx' }
      };
      
      mockReq.body = documentData;
      
      // Mock template retrieval
      const mockTemplate = {
        id: 1,
        name: 'Test Template',
        filePath: '/templates/test.docx',
        fields: ['name', 'email']
      };
      Template.findById.mockResolvedValue(mockTemplate);
      
      // Mock CSV parsing
      const mockParsedData = [
        { name: 'John Doe', email: 'john@example.com' }
      ];
      CSVParser.prototype.parseCSV.mockResolvedValue(mockParsedData);
      
      // Mock document generation
      const mockGeneratedDoc = {
        success: true,
        outputPath: '/generated/doc1.docx'
      };
      DocumentGenerator.prototype.generateDocument.mockResolvedValue(mockGeneratedDoc);
      
      // Mock document creation
      const mockDocument = {
        id: 1,
        templateId: 1,
        fileName: 'generated_document.docx',
        status: 'completed'
      };
      Document.create.mockResolvedValue(mockDocument);
      
      await documentController.createDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockDocument
      });
      expect(Template.findById).toHaveBeenCalledWith(1);
      expect(CSVParser.prototype.parseCSV).toHaveBeenCalledWith(documentData.csvData);
      expect(DocumentGenerator.prototype.generateDocument).toHaveBeenCalled();
      expect(Document.create).toHaveBeenCalled();
    });
    
    it('should handle missing template', async () => {
      const documentData = {
        templateId: 999,
        csvData: 'name,email\nJohn Doe,john@example.com'
      };
      
      mockReq.body = documentData;
      
      Template.findById.mockResolvedValue(null);
      
      await documentController.createDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Template not found'
      });
    });
    
    it('should handle CSV parsing errors', async () => {
      const documentData = {
        templateId: 1,
        csvData: 'invalid,csv,data\n',
        options: { format: 'docx' }
      };
      
      mockReq.body = documentData;
      
      const mockTemplate = {
        id: 1,
        name: 'Test Template',
        fields: ['name', 'email']
      };
      Template.findById.mockResolvedValue(mockTemplate);
      
      CSVParser.prototype.parseCSV.mockRejectedValue(new Error('Invalid CSV format'));
      
      await documentController.createDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid CSV format'
      });
    });
    
    it('should handle document generation errors', async () => {
      const documentData = {
        templateId: 1,
        csvData: 'name,email\nJohn Doe,john@example.com'
      };
      
      mockReq.body = documentData;
      
      const mockTemplate = {
        id: 1,
        name: 'Test Template',
        fields: ['name', 'email']
      };
      Template.findById.mockResolvedValue(mockTemplate);
      
      const mockParsedData = [
        { name: 'John Doe', email: 'john@example.com' }
      ];
      CSVParser.prototype.parseCSV.mockResolvedValue(mockParsedData);
      
      DocumentGenerator.prototype.generateDocument.mockRejectedValue(new Error('Generation failed'));
      
      await documentController.createDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Generation failed'
      });
    });
    
    it('should validate required fields', async () => {
      const invalidData = {
        // Missing templateId and csvData
        options: { format: 'docx' }
      };
      
      mockReq.body = invalidData;
      
      await documentController.createDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('required')
      });
    });
  });
  
  describe('createBulkDocuments', () => {
    it('should create bulk documents successfully', async () => {
      const bulkData = {
        templateId: 1,
        csvData: 'name,email\nJohn Doe,john@example.com\nJane Smith,jane@example.com',
        options: { format: 'docx', compression: true }
      };
      
      mockReq.body = bulkData;
      
      const mockTemplate = {
        id: 1,
        name: 'Test Template',
        fields: ['name', 'email']
      };
      Template.findById.mockResolvedValue(mockTemplate);
      
      const mockParsedData = [
        { name: 'John Doe', email: 'john@example.com' },
        { name: 'Jane Smith', email: 'jane@example.com' }
      ];
      CSVParser.prototype.parseCSV.mockResolvedValue(mockParsedData);
      
      const mockGeneratedDocs = [
        { success: true, outputPath: '/generated/doc1.docx' },
        { success: true, outputPath: '/generated/doc2.docx' }
      ];
      DocumentGenerator.prototype.generateBulkDocuments.mockResolvedValue(mockGeneratedDocs);
      
      const mockBatch = {
        id: 1,
        name: 'Bulk Generation',
        status: 'completed'
      };
      
      await documentController.createBulkDocuments(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          batchId: expect.any(String),
          documentCount: 2
        })
      });
    });
    
    it('should handle large CSV files efficiently', async () => {
      const largeCSV = 'name,email\n' + 
        Array.from({ length: 1000 }, (_, i) => `User ${i},user${i}@example.com`).join('\n');
      
      const bulkData = {
        templateId: 1,
        csvData: largeCSV,
        options: { format: 'docx' }
      };
      
      mockReq.body = bulkData;
      
      const mockTemplate = {
        id: 1,
        name: 'Test Template',
        fields: ['name', 'email']
      };
      Template.findById.mockResolvedValue(mockTemplate);
      
      const mockParsedData = Array.from({ length: 1000 }, (_, i) => ({
        name: `User ${i}`,
        email: `user${i}@example.com`
      }));
      CSVParser.prototype.parseCSV.mockResolvedValue(mockParsedData);
      
      const mockGeneratedDocs = Array.from({ length: 1000 }, (_, i) => ({
        success: true,
        outputPath: `/generated/doc${i}.docx`
      }));
      DocumentGenerator.prototype.generateBulkDocuments.mockResolvedValue(mockGeneratedDocs);
      
      const startTime = Date.now();
      await documentController.createBulkDocuments(mockReq, mockRes);
      const endTime = Date.now();
      
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
    
    it('should handle partial generation failures', async () => {
      const bulkData = {
        templateId: 1,
        csvData: 'name,email\nJohn Doe,john@example.com\nJane Smith,jane@example.com',
        options: { format: 'docx' }
      };
      
      mockReq.body = bulkData;
      
      const mockTemplate = {
        id: 1,
        name: 'Test Template',
        fields: ['name', 'email']
      };
      Template.findById.mockResolvedValue(mockTemplate);
      
      const mockParsedData = [
        { name: 'John Doe', email: 'john@example.com' },
        { name: 'Jane Smith', email: 'jane@example.com' }
      ];
      CSVParser.prototype.parseCSV.mockResolvedValue(mockParsedData);
      
      const mockGeneratedDocs = [
        { success: true, outputPath: '/generated/doc1.docx' },
        { success: false, error: 'Generation failed for Jane Smith' }
      ];
      DocumentGenerator.prototype.generateBulkDocuments.mockResolvedValue(mockGeneratedDocs);
      
      await documentController.createBulkDocuments(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(207); // Multi-status
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          successCount: 1,
          failureCount: 1
        })
      });
    });
  });
  
  describe('getDocument', () => {
    it('should retrieve document by ID successfully', async () => {
      const documentId = '1';
      mockReq.params.id = documentId;
      
      const mockDocument = {
        id: 1,
        templateId: 1,
        fileName: 'generated_document.docx',
        status: 'completed',
        createdAt: '2023-01-01T00:00:00.000Z'
      };
      
      Document.findById.mockResolvedValue(mockDocument);
      
      await documentController.getDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockDocument
      });
      expect(Document.findById).toHaveBeenCalledWith(1);
    });
    
    it('should handle non-existent document', async () => {
      const documentId = '999';
      mockReq.params.id = documentId;
      
      Document.findById.mockResolvedValue(null);
      
      await documentController.getDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Document not found'
      });
    });
    
    it('should handle invalid document ID', async () => {
      const invalidId = 'invalid-id';
      mockReq.params.id = invalidId;
      
      await documentController.getDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid document ID'
      });
    });
  });
  
  describe('getDocuments', () => {
    it('should retrieve documents with filters', async () => {
      const query = {
        status: 'completed',
        templateId: '1',
        limit: '10',
        offset: '0'
      };
      mockReq.query = query;
      
      const mockDocuments = [
        {
          id: 1,
          templateId: 1,
          fileName: 'doc1.docx',
          status: 'completed'
        },
        {
          id: 2,
          templateId: 1,
          fileName: 'doc2.docx',
          status: 'completed'
        }
      ];
      
      Document.findAll.mockResolvedValue(mockDocuments);
      
      await documentController.getDocuments(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockDocuments,
        pagination: expect.objectContaining({
          limit: 10,
          offset: 0,
          total: 2
        })
      });
    });
    
    it('should handle empty results', async () => {
      mockReq.query = { status: 'failed' };
      
      Document.findAll.mockResolvedValue([]);
      
      await documentController.getDocuments(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: [],
        pagination: expect.objectContaining({
          total: 0
        })
      });
    });
    
    it('should validate pagination parameters', async () => {
      mockReq.query = {
        limit: 'invalid',
        offset: '-5'
      };
      
      await documentController.getDocuments(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid pagination')
      });
    });
  });
  
  describe('updateDocument', () => {
    it('should update document successfully', async () => {
      const documentId = '1';
      const updateData = {
        status: 'completed',
        metadata: { processedBy: 'user@example.com' }
      };
      
      mockReq.params.id = documentId;
      mockReq.body = updateData;
      
      const mockDocument = {
        id: 1,
        status: 'completed',
        metadata: { processedBy: 'user@example.com' }
      };
      
      Document.findById.mockResolvedValue(mockDocument);
      Document.update.mockResolvedValue(true);
      
      await documentController.updateDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockDocument
      });
      expect(Document.update).toHaveBeenCalledWith(1, updateData);
    });
    
    it('should handle non-existent document update', async () => {
      const documentId = '999';
      mockReq.params.id = documentId;
      mockReq.body = { status: 'completed' };
      
      Document.findById.mockResolvedValue(null);
      
      await documentController.updateDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Document not found'
      });
    });
    
    it('should validate update data', async () => {
      const documentId = '1';
      const invalidUpdateData = {
        status: 'invalid_status'
      };
      
      mockReq.params.id = documentId;
      mockReq.body = invalidUpdateData;
      
      await documentController.updateDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid status')
      });
    });
  });
  
  describe('deleteDocument', () => {
    it('should delete document successfully', async () => {
      const documentId = '1';
      mockReq.params.id = documentId;
      
      const mockDocument = {
        id: 1,
        fileName: 'test.docx',
        status: 'completed'
      };
      
      Document.findById.mockResolvedValue(mockDocument);
      Document.delete.mockResolvedValue(true);
      
      await documentController.deleteDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Document deleted successfully'
      });
      expect(Document.delete).toHaveBeenCalledWith(1);
    });
    
    it('should not delete processing documents', async () => {
      const documentId = '1';
      mockReq.params.id = documentId;
      
      const mockDocument = {
        id: 1,
        fileName: 'test.docx',
        status: 'processing'
      };
      
      Document.findById.mockResolvedValue(mockDocument);
      
      await documentController.deleteDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot delete document that is currently processing'
      });
    });
  });
  
  describe('downloadDocument', () => {
    it('should download document successfully', async () => {
      const documentId = '1';
      mockReq.params.id = documentId;
      
      const mockDocument = {
        id: 1,
        fileName: 'test.docx',
        filePath: '/generated/test.docx',
        status: 'completed'
      };
      
      Document.findById.mockResolvedValue(mockDocument);
      
      // Mock file system operations
      const fs = require('fs-extra');
      fs.existsSync.mockReturnValue(true);
      fs.createReadStream.mockReturnValue({
        pipe: jest.fn().mockReturnThis(),
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === 'error') return this;
          if (event === 'end') callback();
          return this;
        })
      });
      
      await documentController.downloadDocument(mockReq, mockRes);
      
      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="test.docx"'
      });
    });
    
    it('should handle non-existent document download', async () => {
      const documentId = '999';
      mockReq.params.id = documentId;
      
      Document.findById.mockResolvedValue(null);
      
      await documentController.downloadDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Document not found'
      });
    });
    
    it('should handle missing file', async () => {
      const documentId = '1';
      mockReq.params.id = documentId;
      
      const mockDocument = {
        id: 1,
        fileName: 'test.docx',
        filePath: '/generated/test.docx',
        status: 'completed'
      };
      
      Document.findById.mockResolvedValue(mockDocument);
      
      const fs = require('fs-extra');
      fs.existsSync.mockReturnValue(false);
      
      await documentController.downloadDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Document file not found'
      });
    });
  });
  
  describe('getDocumentStats', () => {
    it('should return document statistics', async () => {
      const mockStats = [
        { status: 'completed', count: 10 },
        { status: 'processing', count: 5 },
        { status: 'failed', count: 2 }
      ];
      
      Document.getDocumentStats.mockResolvedValue(mockStats);
      
      await documentController.getDocumentStats(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockStats
      });
    });
    
    it('should return user-specific statistics', async () => {
      mockReq.user = { id: 1 };
      
      const mockStats = [
        { status: 'completed', count: 5 },
        { status: 'processing', count: 2 }
      ];
      
      Document.getDocumentStats.mockResolvedValue(mockStats);
      
      await documentController.getDocumentStats(mockReq, mockRes);
      
      expect(Document.getDocumentStats).toHaveBeenCalledWith(1);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      mockReq.body = {
        templateId: 1,
        csvData: 'name,email\nJohn Doe,john@example.com'
      };
      
      Template.findById.mockRejectedValue(new Error('Database connection failed'));
      
      await documentController.createDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Database connection failed'
      });
    });
    
    it('should handle file system errors', async () => {
      const documentId = '1';
      mockReq.params.id = documentId;
      
      const mockDocument = {
        id: 1,
        fileName: 'test.docx',
        filePath: '/generated/test.docx'
      };
      
      Document.findById.mockResolvedValue(mockDocument);
      
      const fs = require('fs-extra');
      fs.existsSync.mockReturnValue(true);
      fs.createReadStream.mockImplementation(() => {
        throw new Error('File read error');
      });
      
      await documentController.downloadDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'File read error'
      });
    });
  });
  
  describe('Performance Tests', () => {
    it('should handle large document generation requests efficiently', async () => {
      const largeCSV = 'name,email\n' + 
        Array.from({ length: 5000 }, (_, i) => `User ${i},user${i}@example.com`).join('\n');
      
      const bulkData = {
        templateId: 1,
        csvData: largeCSV,
        options: { format: 'docx' }
      };
      
      mockReq.body = bulkData;
      
      const mockTemplate = {
        id: 1,
        name: 'Test Template',
        fields: ['name', 'email']
      };
      Template.findById.mockResolvedValue(mockTemplate);
      
      const mockParsedData = Array.from({ length: 5000 }, (_, i) => ({
        name: `User ${i}`,
        email: `user${i}@example.com`
      }));
      CSVParser.prototype.parseCSV.mockResolvedValue(mockParsedData);
      
      const mockGeneratedDocs = Array.from({ length: 5000 }, (_, i) => ({
        success: true,
        outputPath: `/generated/doc${i}.docx`
      }));
      DocumentGenerator.prototype.generateBulkDocuments.mockResolvedValue(mockGeneratedDocs);
      
      const startTime = Date.now();
      await documentController.createBulkDocuments(mockReq, mockRes);
      const endTime = Date.now();
      
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(endTime - startTime).toBeLessThan(15000); // Should complete within 15 seconds
    });
  });
});
