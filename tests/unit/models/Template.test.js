const Template = require('../../models/Template');
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

describe('Template Model', () => {
  let template;
  
  beforeEach(() => {
    template = new Template();
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('create', () => {
    it('should create a new template successfully', async () => {
      const templateData = {
        name: 'Test Template',
        description: 'A test template for testing',
        filePath: '/uploads/template.docx',
        fileType: 'docx',
        fields: ['name', 'email', 'company'],
        userId: 1,
        isActive: true
      };
      
      const mockStmt = {
        run: jest.fn().mockResolvedValue({ lastID: 1 }),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Template.create(templateData);
      
      expect(result).toHaveProperty('id');
      expect(result.id).toBe(1);
      expect(result.name).toBe(templateData.name);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.run).toHaveBeenCalled();
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should handle database errors during creation', async () => {
      const templateData = {
        name: 'Test Template',
        filePath: '/uploads/template.docx',
        fileType: 'docx'
      };
      
      const error = new Error('Database error');
      const mockStmt = {
        run: jest.fn().mockRejectedValue(error),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      await expect(Template.create(templateData)).rejects.toThrow('Database error');
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should validate required fields before creation', async () => {
      const invalidTemplateData = {
        description: 'Missing required fields'
      };
      
      await expect(Template.create(invalidTemplateData)).rejects.toThrow();
    });
  });
  
  describe('findById', () => {
    it('should find template by ID successfully', async () => {
      const templateId = 1;
      const mockTemplate = {
        id: 1,
        name: 'Test Template',
        description: 'A test template',
        filePath: '/uploads/template.docx',
        fileType: 'docx',
        fields: JSON.stringify(['name', 'email']),
        userId: 1,
        isActive: 1,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z'
      };
      
      const mockStmt = {
        get: jest.fn().mockResolvedValue(mockTemplate),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Template.findById(templateId);
      
      expect(result).toHaveProperty('id', 1);
      expect(result).toHaveProperty('name', 'Test Template');
      expect(result.fields).toEqual(['name', 'email']);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.get).toHaveBeenCalledWith(templateId);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should return null for non-existent template', async () => {
      const templateId = 999;
      
      const mockStmt = {
        get: jest.fn().mockResolvedValue(null),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Template.findById(templateId);
      
      expect(result).toBeNull();
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should handle database errors during find', async () => {
      const templateId = 1;
      const error = new Error('Database error');
      
      const mockStmt = {
        get: jest.fn().mockRejectedValue(error),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      await expect(Template.findById(templateId)).rejects.toThrow('Database error');
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('findAll', () => {
    it('should find all templates successfully', async () => {
      const mockTemplates = [
        {
          id: 1,
          name: 'Template 1',
          description: 'First template',
          filePath: '/uploads/template1.docx',
          fileType: 'docx',
          fields: JSON.stringify(['name', 'email']),
          userId: 1,
          isActive: 1,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 2,
          name: 'Template 2',
          description: 'Second template',
          filePath: '/uploads/template2.docx',
          fileType: 'docx',
          fields: JSON.stringify(['name', 'company']),
          userId: 1,
          isActive: 1,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z'
        }
      ];
      
      db.all.mockResolvedValue(mockTemplates);
      
      const result = await Template.findAll();
      
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('id', 1);
      expect(result[1]).toHaveProperty('id', 2);
      expect(result[0].fields).toEqual(['name', 'email']);
      expect(result[1].fields).toEqual(['name', 'company']);
      expect(db.all).toHaveBeenCalled();
    });
    
    it('should find templates with filters', async () => {
      const filters = { userId: 1, isActive: true };
      const mockTemplates = [
        {
          id: 1,
          name: 'Template 1',
          userId: 1,
          isActive: 1
        }
      ];
      
      const mockStmt = {
        all: jest.fn().mockResolvedValue(mockTemplates),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Template.findAll(filters);
      
      expect(result).toHaveLength(1);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.all).toHaveBeenCalled();
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should handle database errors during findAll', async () => {
      const error = new Error('Database error');
      db.all.mockRejectedValue(error);
      
      await expect(Template.findAll()).rejects.toThrow('Database error');
    });
  });
  
  describe('update', () => {
    it('should update template successfully', async () => {
      const templateId = 1;
      const updateData = {
        name: 'Updated Template',
        description: 'Updated description'
      };
      
      const mockStmt = {
        run: jest.fn().mockResolvedValue({ changes: 1 }),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Template.update(templateId, updateData);
      
      expect(result).toBe(true);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.run).toHaveBeenCalled();
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should handle non-existent template update', async () => {
      const templateId = 999;
      const updateData = { name: 'Updated Template' };
      
      const mockStmt = {
        run: jest.fn().mockResolvedValue({ changes: 0 }),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Template.update(templateId, updateData);
      
      expect(result).toBe(false);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should handle database errors during update', async () => {
      const templateId = 1;
      const updateData = { name: 'Updated Template' };
      const error = new Error('Database error');
      
      const mockStmt = {
        run: jest.fn().mockRejectedValue(error),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      await expect(Template.update(templateId, updateData)).rejects.toThrow('Database error');
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('delete', () => {
    it('should delete template successfully', async () => {
      const templateId = 1;
      
      const mockStmt = {
        run: jest.fn().mockResolvedValue({ changes: 1 }),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Template.delete(templateId);
      
      expect(result).toBe(true);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.run).toHaveBeenCalledWith(templateId);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should handle non-existent template deletion', async () => {
      const templateId = 999;
      
      const mockStmt = {
        run: jest.fn().mockResolvedValue({ changes: 0 }),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Template.delete(templateId);
      
      expect(result).toBe(false);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should handle database errors during deletion', async () => {
      const templateId = 1;
      const error = new Error('Database error');
      
      const mockStmt = {
        run: jest.fn().mockRejectedValue(error),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      await expect(Template.delete(templateId)).rejects.toThrow('Database error');
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('findByUserId', () => {
    it('should find templates by user ID successfully', async () => {
      const userId = 1;
      const mockTemplates = [
        {
          id: 1,
          name: 'User Template 1',
          userId: 1
        },
        {
          id: 2,
          name: 'User Template 2',
          userId: 1
        }
      ];
      
      const mockStmt = {
        all: jest.fn().mockResolvedValue(mockTemplates),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Template.findByUserId(userId);
      
      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe(1);
      expect(result[1].userId).toBe(1);
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.all).toHaveBeenCalledWith(userId);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should return empty array for user with no templates', async () => {
      const userId = 999;
      
      const mockStmt = {
        all: jest.fn().mockResolvedValue([]),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Template.findByUserId(userId);
      
      expect(result).toEqual([]);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('findByFileType', () => {
    it('should find templates by file type successfully', async () => {
      const fileType = 'docx';
      const mockTemplates = [
        {
          id: 1,
          name: 'DOCX Template 1',
          fileType: 'docx'
        },
        {
          id: 2,
          name: 'DOCX Template 2',
          fileType: 'docx'
        }
      ];
      
      const mockStmt = {
        all: jest.fn().mockResolvedValue(mockTemplates),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Template.findByFileType(fileType);
      
      expect(result).toHaveLength(2);
      expect(result[0].fileType).toBe('docx');
      expect(result[1].fileType).toBe('docx');
      expect(db.prepare).toHaveBeenCalled();
      expect(mockStmt.all).toHaveBeenCalledWith(fileType);
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('Validation', () => {
    it('should validate template data structure', () => {
      const validData = {
        name: 'Test Template',
        filePath: '/uploads/template.docx',
        fileType: 'docx'
      };
      
      const validation = Template.validate(validData);
      expect(validation.isValid).toBe(true);
    });
    
    it('should detect missing required fields', () => {
      const invalidData = {
        description: 'Missing required fields'
      };
      
      const validation = Template.validate(invalidData);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Name is required');
      expect(validation.errors).toContain('File path is required');
      expect(validation.errors).toContain('File type is required');
    });
    
    it('should validate file type', () => {
      const invalidData = {
        name: 'Test Template',
        filePath: '/uploads/template.txt',
        fileType: 'txt'
      };
      
      const validation = Template.validate(invalidData);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Invalid file type. Supported types: docx, pdf');
    });
    
    it('should validate field names', () => {
      const invalidData = {
        name: 'Test Template',
        filePath: '/uploads/template.docx',
        fileType: 'docx',
        fields: ['name', 'email', 'invalid-field-name']
      };
      
      const validation = Template.validate(invalidData);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Invalid field name: invalid-field-name');
    });
  });
  
  describe('Error Handling', () => {
    it('should handle malformed JSON in fields', async () => {
      const templateId = 1;
      const mockTemplate = {
        id: 1,
        name: 'Test Template',
        fields: 'invalid-json'
      };
      
      const mockStmt = {
        get: jest.fn().mockResolvedValue(mockTemplate),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Template.findById(templateId);
      
      expect(result.fields).toEqual([]); // Should default to empty array
    });
    
    it('should handle null fields gracefully', async () => {
      const templateId = 1;
      const mockTemplate = {
        id: 1,
        name: 'Test Template',
        fields: null
      };
      
      const mockStmt = {
        get: jest.fn().mockResolvedValue(mockTemplate),
        finalize: jest.fn()
      };
      
      db.prepare.mockReturnValue(mockStmt);
      
      const result = await Template.findById(templateId);
      
      expect(result.fields).toEqual([]); // Should default to empty array
    });
  });
  
  describe('Performance Tests', () => {
    it('should handle large number of templates efficiently', async () => {
      const mockTemplates = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        name: `Template ${i + 1}`,
        fileType: 'docx',
        fields: JSON.stringify(['name', 'email']),
        userId: 1,
        isActive: 1
      }));
      
      db.all.mockResolvedValue(mockTemplates);
      
      const startTime = Date.now();
      const result = await Template.findAll();
      const endTime = Date.now();
      
      expect(result).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});
