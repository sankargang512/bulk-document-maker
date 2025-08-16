const Document = require('../../models/Document');
const db = require('../../database/connection');

// Mock database connection
jest.mock('../../database/connection', () => ({
  get: jest.fn(),
  all: jest.fn(),
  run: jest.fn(),
  prepare: jest.fn(() => ({
    run: jest.fn(),
    get: jest.fn(),
    all: jest.fn(),
    finalize: jest.fn()
  }))
}));

describe('Document Model', () => {
  let document;
  
  beforeEach(() => {
    document = new Document();
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('create', () => {
    it('should create a new document successfully', async () => {
      const documentData = {
        templateId: 1,
        batchId: 1,
        fileName: 'generated_document.docx',
        filePath: '/generated/doc1.docx',
        status: 'completed',
        metadata: { name: 'John Doe', company: 'ACME Corp' },
        userId: 1
      };
      
      const mockStmt = {
        run: jest.fn().mockResolvedValue({ lastID: 1 }),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Document.create(documentData);
      
      expect(result).toHaveProperty('id');
      expect(result.id).toBe(1);
      expect(result.templateId).toBe(documentData.templateId);
      expect(result.batchId).toBe(documentData.batchId);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.run).toHaveBeenCalled();
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should handle database errors during creation', async () => {
      const documentData = {
        templateId: 1,
        fileName: 'test.docx',
        filePath: '/test/doc.docx'
      };
      
      const error = new Error('Database error');
      const mockStmt = {
        run: jest.fn().mockRejectedValue(error),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      await expect(Document.create(documentData)).rejects.toThrow('Database error');
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should validate required fields before creation', async () => {
      const invalidDocumentData = {
        description: 'Missing required fields'
      };
      
      await expect(Document.create(invalidDocumentData)).rejects.toThrow();
    });
  });
  
  describe('findById', () => {
    it('should find document by ID successfully', async () => {
      const documentId = 1;
      const mockDocument = {
        id: 1,
        templateId: 1,
        batchId: 1,
        fileName: 'generated_document.docx',
        filePath: '/generated/doc1.docx',
        status: 'completed',
        metadata: JSON.stringify({ name: 'John Doe', company: 'ACME Corp' }),
        userId: 1,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };
      
      const mockStmt = {
        get: jest.fn().mockResolvedValue(mockDocument),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Document.findById(documentId);
      
      expect(result).toHaveProperty('id', 1);
      expect(result).toHaveProperty('fileName', 'generated_document.docx');
      expect(result.metadata).toEqual({ name: 'John Doe', company: 'ACME Corp' });
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.get).toHaveBeenCalledWith(documentId);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should return null for non-existent document', async () => {
      const documentId = 999;
      
      const mockStmt = {
        get: jest.fn().mockResolvedValue(null),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Document.findById(documentId);
      
      expect(result).toBeNull();
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('findAll', () => {
    it('should find all documents successfully', async () => {
      const mockDocuments = [
        {
          id: 1,
          fileName: 'Document 1.docx',
          status: 'completed',
          templateId: 1
        },
        {
          id: 2,
          fileName: 'Document 2.docx',
          status: 'processing',
          templateId: 1
        }
      ];
      
      db.all.mockResolvedValue(mockDocuments);
      
      const result = await Document.findAll();
      
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('id', 1);
      expect(result[1]).toHaveProperty('id', 2);
      expect(db.all).toHaveBeenCalled();
    });
    
    it('should find documents with filters', async () => {
      const filters = { status: 'completed', templateId: 1 };
      const mockDocuments = [
        {
          id: 1,
          fileName: 'Document 1.docx',
          status: 'completed',
          templateId: 1
        }
      ];
      
      const mockStmt = {
        all: jest.fn().mockResolvedValue(mockDocuments),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Document.findAll(filters);
      
      expect(result).toHaveLength(1);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.all).toHaveBeenCalled();
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('findByBatchId', () => {
    it('should find documents by batch ID successfully', async () => {
      const batchId = 1;
      const mockDocuments = [
        {
          id: 1,
          fileName: 'Batch 1 Doc 1.docx',
          batchId: 1
        },
        {
          id: 2,
          fileName: 'Batch 1 Doc 2.docx',
          batchId: 1
        }
      ];
      
      const mockStmt = {
        all: jest.fn().mockResolvedValue(mockDocuments),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Document.findByBatchId(batchId);
      
      expect(result).toHaveLength(2);
      expect(result[0].batchId).toBe(1);
      expect(result[1].batchId).toBe(1);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.all).toHaveBeenCalledWith(batchId);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should return empty array for non-existent batch', async () => {
      const batchId = 999;
      
      const mockStmt = {
        all: jest.fn().mockResolvedValue([]),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Document.findByBatchId(batchId);
      
      expect(result).toEqual([]);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('findByTemplateId', () => {
    it('should find documents by template ID successfully', async () => {
      const templateId = 1;
      const mockDocuments = [
        {
          id: 1,
          fileName: 'Template 1 Doc 1.docx',
          templateId: 1
        },
        {
          id: 2,
          fileName: 'Template 1 Doc 2.docx',
          templateId: 1
        }
      ];
      
      const mockStmt = {
        all: jest.fn().mockResolvedValue(mockDocuments),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Document.findByTemplateId(templateId);
      
      expect(result).toHaveLength(2);
      expect(result[0].templateId).toBe(1);
      expect(result[1].templateId).toBe(1);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.all).toHaveBeenCalledWith(templateId);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('findByStatus', () => {
    it('should find documents by status successfully', async () => {
      const status = 'completed';
      const mockDocuments = [
        {
          id: 1,
          fileName: 'Completed Doc 1.docx',
          status: 'completed'
        },
        {
          id: 2,
          fileName: 'Completed Doc 2.docx',
          status: 'completed'
        }
      ];
      
      const mockStmt = {
        all: jest.fn().mockResolvedValue(mockDocuments),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Document.findByStatus(status);
      
      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('completed');
      expect(result[1].status).toBe('completed');
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.all).toHaveBeenCalledWith(status);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('update', () => {
    it('should update document successfully', async () => {
      const documentId = 1;
      const updateData = {
        status: 'completed',
        metadata: { name: 'John Doe', company: 'ACME Corp' }
      };
      
      const mockStmt = {
        run: jest.fn().mockResolvedValue({ changes: 1 }),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Document.update(documentId, updateData);
      
      expect(result).toBe(true);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.run).toHaveBeenCalled();
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should handle non-existent document update', async () => {
      const documentId = 999;
      const updateData = { status: 'completed' };
      
      const mockStmt = {
        run: jest.fn().mockResolvedValue({ changes: 0 }),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Document.update(documentId, updateData);
      
      expect(result).toBe(false);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('delete', () => {
    it('should delete document successfully', async () => {
      const documentId = 1;
      
      const mockStmt = {
        run: jest.fn().mockResolvedValue({ changes: 1 }),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Document.delete(documentId);
      
      expect(result).toBe(true);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.run).toHaveBeenCalledWith(documentId);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should handle non-existent document deletion', async () => {
      const documentId = 999;
      
      const mockStmt = {
        run: jest.fn().mockResolvedValue({ changes: 0 }),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Document.delete(documentId);
      
      expect(result).toBe(false);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('updateStatus', () => {
    it('should update document status successfully', async () => {
      const documentId = 1;
      const newStatus = 'completed';
      
      const mockStmt = {
        run: jest.fn().mockResolvedValue({ changes: 1 }),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Document.updateStatus(documentId, newStatus);
      
      expect(result).toBe(true);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.run).toHaveBeenCalledWith(newStatus, documentId);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should validate status values', async () => {
      const documentId = 1;
      const invalidStatus = 'invalid_status';
      
      await expect(Document.updateStatus(documentId, invalidStatus)).rejects.toThrow();
    });
  });
  
  describe('getDocumentStats', () => {
    it('should get document statistics successfully', async () => {
      const mockStats = [
        { status: 'completed', count: 10 },
        { status: 'processing', count: 5 },
        { status: 'failed', count: 2 }
      ];
      
      db.all.mockResolvedValue(mockStats);
      
      const result = await Document.getDocumentStats();
      
      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('status', 'completed');
      expect(result[0]).toHaveProperty('count', 10);
      expect(db.all).toHaveBeenCalled();
    });
    
    it('should get document statistics by user ID', async () => {
      const userId = 1;
      const mockStats = [
        { status: 'completed', count: 5 },
        { status: 'processing', count: 2 }
      ];
      
      const mockStmt = {
        all: jest.fn().mockResolvedValue(mockStats),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Document.getDocumentStats(userId);
      
      expect(result).toHaveLength(2);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.all).toHaveBeenCalledWith(userId);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('Validation', () => {
    it('should validate document data structure', () => {
      const validData = {
        templateId: 1,
        fileName: 'test.docx',
        filePath: '/test/doc.docx',
        status: 'processing'
      };
      
      const validation = Document.validate(validData);
      expect(validation.isValid).toBe(true);
    });
    
    it('should detect missing required fields', () => {
      const invalidData = {
        description: 'Missing required fields'
      };
      
      const validation = Document.validate(invalidData);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Template ID is required');
      expect(validation.errors).toContain('File name is required');
      expect(validation.errors).toContain('File path is required');
    });
    
    it('should validate status values', () => {
      const invalidData = {
        templateId: 1,
        fileName: 'test.docx',
        filePath: '/test/doc.docx',
        status: 'invalid_status'
      };
      
      const validation = Document.validate(invalidData);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Invalid status value');
    });
    
    it('should validate file extensions', () => {
      const invalidData = {
        templateId: 1,
        fileName: 'test.txt',
        filePath: '/test/doc.txt',
        status: 'processing'
      };
      
      const validation = Document.validate(invalidData);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Invalid file extension');
    });
  });
  
  describe('Error Handling', () => {
    it('should handle malformed JSON in metadata', async () => {
      const documentId = 1;
      const mockDocument = {
        id: 1,
        fileName: 'Test Document',
        metadata: 'invalid-json'
      };
      
      const mockStmt = {
        get: jest.fn().mockResolvedValue(mockDocument),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Document.findById(documentId);
      
      expect(result.metadata).toEqual({}); // Should default to empty object
    });
    
    it('should handle null metadata gracefully', async () => {
      const documentId = 1;
      const mockDocument = {
        id: 1,
        fileName: 'Test Document',
        metadata: null
      };
      
      const mockStmt = {
        get: jest.fn().mockResolvedValue(mockDocument),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Document.findById(documentId);
      
      expect(result.metadata).toEqual({}); // Should default to empty object
    });
  });
  
  describe('Performance Tests', () => {
    it('should handle large number of documents efficiently', async () => {
      const mockDocuments = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        fileName: `Document ${i + 1}.docx`,
        status: 'completed',
        templateId: 1
      }));
      
      db.all.mockResolvedValue(mockDocuments);
      
      const startTime = Date.now();
      const result = await Document.findAll();
      const endTime = Date.now();
      
      expect(result).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
    
    it('should handle complex queries efficiently', async () => {
      const filters = { 
        status: 'completed', 
        templateId: 1, 
        userId: 1,
        createdAt: '2023-01-01'
      };
      
      const mockDocuments = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        fileName: `Document ${i + 1}.docx`,
        status: 'completed',
        templateId: 1,
        userId: 1
      }));
      
      const mockStmt = {
        all: jest.fn().mockResolvedValue(mockDocuments),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const startTime = Date.now();
      const result = await Document.findAll(filters);
      const endTime = Date.now();
      
      expect(result).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(500); // Should complete within 500ms
    });
  });
});
