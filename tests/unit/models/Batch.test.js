const Batch = require('../../models/Batch');
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

describe('Batch Model', () => {
  let batch;
  
  beforeEach(() => {
    batch = new Batch();
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('create', () => {
    it('should create a new batch successfully', async () => {
      const batchData = {
        name: 'Test Batch',
        description: 'A test batch for testing',
        templateId: 1,
        status: 'processing',
        totalDocuments: 100,
        processedDocuments: 0,
        userId: 1,
        options: { format: 'docx', compression: true }
      };
      
      const mockStmt = {
        run: jest.fn().mockResolvedValue({ lastID: 1 }),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Batch.create(batchData);
      
      expect(result).toHaveProperty('id');
      expect(result.id).toBe(1);
      expect(result.name).toBe(batchData.name);
      expect(result.templateId).toBe(batchData.templateId);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.run).toHaveBeenCalled();
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should handle database errors during creation', async () => {
      const batchData = {
        name: 'Test Batch',
        templateId: 1
      };
      
      const error = new Error('Database error');
      const mockStmt = {
        run: jest.fn().mockRejectedValue(error),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      await expect(Batch.create(batchData)).rejects.toThrow('Database error');
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should validate required fields before creation', async () => {
      const invalidBatchData = {
        description: 'Missing required fields'
      };
      
      await expect(Batch.create(invalidBatchData)).rejects.toThrow();
    });
  });
  
  describe('findById', () => {
    it('should find batch by ID successfully', async () => {
      const batchId = 1;
      const mockBatch = {
        id: 1,
        name: 'Test Batch',
        description: 'A test batch',
        templateId: 1,
        status: 'processing',
        totalDocuments: 100,
        processedDocuments: 50,
        options: JSON.stringify({ format: 'docx', compression: true }),
        userId: 1,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };
      
      const mockStmt = {
        get: jest.fn().mockResolvedValue(mockBatch),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Batch.findById(batchId);
      
      expect(result).toHaveProperty('id', 1);
      expect(result).toHaveProperty('name', 'Test Batch');
      expect(result.options).toEqual({ format: 'docx', compression: true });
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.get).toHaveBeenCalledWith(batchId);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should return null for non-existent batch', async () => {
      const batchId = 999;
      
      const mockStmt = {
        get: jest.fn().mockResolvedValue(null),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Batch.findById(batchId);
      
      expect(result).toBeNull();
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('findAll', () => {
    it('should find all batches successfully', async () => {
      const mockBatches = [
        {
          id: 1,
          name: 'Batch 1',
          status: 'completed',
          templateId: 1,
          totalDocuments: 50,
          processedDocuments: 50
        },
        {
          id: 2,
          name: 'Batch 2',
          status: 'processing',
          templateId: 1,
          totalDocuments: 100,
          processedDocuments: 75
        }
      ];
      
      db.all.mockResolvedValue(mockBatches);
      
      const result = await Batch.findAll();
      
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('id', 1);
      expect(result[1]).toHaveProperty('id', 2);
      expect(db.all).toHaveBeenCalled();
    });
    
    it('should find batches with filters', async () => {
      const filters = { status: 'completed', userId: 1 };
      const mockBatches = [
        {
          id: 1,
          name: 'Completed Batch',
          status: 'completed',
          userId: 1
        }
      ];
      
      const mockStmt = {
        all: jest.fn().mockResolvedValue(mockBatches),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Batch.findAll(filters);
      
      expect(result).toHaveLength(1);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.all).toHaveBeenCalled();
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('findByUserId', () => {
    it('should find batches by user ID successfully', async () => {
      const userId = 1;
      const mockBatches = [
        {
          id: 1,
          name: 'User Batch 1',
          userId: 1
        },
        {
          id: 2,
          name: 'User Batch 2',
          userId: 1
        }
      ];
      
      const mockStmt = {
        all: jest.fn().mockResolvedValue(mockBatches),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Batch.findByUserId(userId);
      
      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe(1);
      expect(result[1].userId).toBe(1);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.all).toHaveBeenCalledWith(userId);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('findByStatus', () => {
    it('should find batches by status successfully', async () => {
      const status = 'processing';
      const mockBatches = [
        {
          id: 1,
          name: 'Processing Batch 1',
          status: 'processing'
        },
        {
          id: 2,
          name: 'Processing Batch 2',
          status: 'processing'
        }
      ];
      
      const mockStmt = {
        all: jest.fn().mockResolvedValue(mockBatches),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Batch.findByStatus(status);
      
      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('processing');
      expect(result[1].status).toBe('processing');
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.all).toHaveBeenCalledWith(status);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('update', () => {
    it('should update batch successfully', async () => {
      const batchId = 1;
      const updateData = {
        status: 'completed',
        processedDocuments: 100
      };
      
      const mockStmt = {
        run: jest.fn().mockResolvedValue({ changes: 1 }),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Batch.update(batchId, updateData);
      
      expect(result).toBe(true);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.run).toHaveBeenCalled();
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should handle non-existent batch update', async () => {
      const batchId = 999;
      const updateData = { status: 'completed' };
      
      const mockStmt = {
        run: jest.fn().mockResolvedValue({ changes: 0 }),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Batch.update(batchId, updateData);
      
      expect(result).toBe(false);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('delete', () => {
    it('should delete batch successfully', async () => {
      const batchId = 1;
      
      const mockStmt = {
        run: jest.fn().mockResolvedValue({ changes: 1 }),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Batch.delete(batchId);
      
      expect(result).toBe(true);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.run).toHaveBeenCalledWith(batchId);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('updateStatus', () => {
    it('should update batch status successfully', async () => {
      const batchId = 1;
      const newStatus = 'completed';
      
      const mockStmt = {
        run: jest.fn().mockResolvedValue({ changes: 1 }),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Batch.updateStatus(batchId, newStatus);
      
      expect(result).toBe(true);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.run).toHaveBeenCalledWith(newStatus, batchId);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should validate status values', async () => {
      const batchId = 1;
      const invalidStatus = 'invalid_status';
      
      await expect(Batch.updateStatus(batchId, invalidStatus)).rejects.toThrow();
    });
  });
  
  describe('updateProgress', () => {
    it('should update batch progress successfully', async () => {
      const batchId = 1;
      const processedCount = 75;
      
      const mockStmt = {
        run: jest.fn().mockResolvedValue({ changes: 1 }),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Batch.updateProgress(batchId, processedCount);
      
      expect(result).toBe(true);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.run).toHaveBeenCalledWith(processedCount, batchId);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should handle invalid progress values', async () => {
      const batchId = 1;
      const invalidProgress = -5;
      
      await expect(Batch.updateProgress(batchId, invalidProgress)).rejects.toThrow();
    });
  });
  
  describe('getBatchStats', () => {
    it('should get batch statistics successfully', async () => {
      const mockStats = [
        { status: 'completed', count: 5 },
        { status: 'processing', count: 3 },
        { status: 'failed', count: 1 }
      ];
      
      db.all.mockResolvedValue(mockStats);
      
      const result = await Batch.getBatchStats();
      
      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('status', 'completed');
      expect(result[0]).toHaveProperty('count', 5);
      expect(db.all).toHaveBeenCalled();
    });
    
    it('should get batch statistics by user ID', async () => {
      const userId = 1;
      const mockStats = [
        { status: 'completed', count: 3 },
        { status: 'processing', count: 1 }
      ];
      
      const mockStmt = {
        all: jest.fn().mockResolvedValue(mockStats),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Batch.getBatchStats(userId);
      
      expect(result).toHaveLength(2);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.all).toHaveBeenCalledWith(userId);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('getBatchProgress', () => {
    it('should calculate batch progress correctly', async () => {
      const batchId = 1;
      const mockBatch = {
        id: 1,
        totalDocuments: 100,
        processedDocuments: 75
      };
      
      const mockStmt = {
        get: jest.fn().mockResolvedValue(mockBatch),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const progress = await Batch.getBatchProgress(batchId);
      
      expect(progress).toBe(75); // 75%
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should handle zero total documents', async () => {
      const batchId = 1;
      const mockBatch = {
        id: 1,
        totalDocuments: 0,
        processedDocuments: 0
      };
      
      const mockStmt = {
        get: jest.fn().mockResolvedValue(mockBatch),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const progress = await Batch.getBatchProgress(batchId);
      
      expect(progress).toBe(0);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('Validation', () => {
    it('should validate batch data structure', () => {
      const validData = {
        name: 'Test Batch',
        templateId: 1,
        status: 'processing'
      };
      
      const validation = Batch.validate(validData);
      expect(validation.isValid).toBe(true);
    });
    
    it('should detect missing required fields', () => {
      const invalidData = {
        description: 'Missing required fields'
      };
      
      const validation = Batch.validate(invalidData);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Name is required');
      expect(validation.errors).toContain('Template ID is required');
    });
    
    it('should validate status values', () => {
      const invalidData = {
        name: 'Test Batch',
        templateId: 1,
        status: 'invalid_status'
      };
      
      const validation = Batch.validate(invalidData);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Invalid status value');
    });
    
    it('should validate document counts', () => {
      const invalidData = {
        name: 'Test Batch',
        templateId: 1,
        totalDocuments: -5
      };
      
      const validation = Batch.validate(invalidData);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Total documents must be a positive number');
    });
  });
  
  describe('Error Handling', () => {
    it('should handle malformed JSON in options', async () => {
      const batchId = 1;
      const mockBatch = {
        id: 1,
        name: 'Test Batch',
        options: 'invalid-json'
      };
      
      const mockStmt = {
        get: jest.fn().mockResolvedValue(mockBatch),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Batch.findById(batchId);
      
      expect(result.options).toEqual({}); // Should default to empty object
    });
    
    it('should handle null options gracefully', async () => {
      const batchId = 1;
      const mockBatch = {
        id: 1,
        name: 'Test Batch',
        options: null
      };
      
      const mockStmt = {
        get: jest.fn().mockResolvedValue(mockBatch),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Batch.findById(batchId);
      
      expect(result.options).toEqual({}); // Should default to empty object
    });
  });
  
  describe('Performance Tests', () => {
    it('should handle large number of batches efficiently', async () => {
      const mockBatches = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        name: `Batch ${i + 1}`,
        status: 'completed',
        templateId: 1
      }));
      
      db.all.mockResolvedValue(mockBatches);
      
      const startTime = Date.now();
      const result = await Batch.findAll();
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
      
      const mockBatches = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: `Batch ${i + 1}`,
        status: 'completed',
        templateId: 1,
        userId: 1
      }));
      
      const mockStmt = {
        all: jest.fn().mockResolvedValue(mockBatches),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const startTime = Date.now();
      const result = await Batch.findAll(filters);
      const endTime = Date.now();
      
      expect(result).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(500); // Should complete within 500ms
    });
  });
});
