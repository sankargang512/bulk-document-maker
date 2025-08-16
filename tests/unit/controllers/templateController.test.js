const TemplateController = require('../../controllers/templateController');
const Template = require('../../models/Template');
const TemplateAnalyzer = require('../../services/templateAnalyzer');
const fs = require('fs-extra');

// Mock dependencies
jest.mock('../../models/Template');
jest.mock('../../services/templateAnalyzer');
jest.mock('fs-extra');

describe('Template Controller', () => {
  let templateController;
  let mockReq;
  let mockRes;
  
  beforeEach(() => {
    templateController = new TemplateController();
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
  
  describe('createTemplate', () => {
    it('should create template successfully', async () => {
      const templateData = {
        name: 'Invoice Template',
        description: 'Template for generating invoices',
        fileType: 'docx',
        fields: ['name', 'email', 'amount']
      };
      
      mockReq.body = templateData;
      mockReq.files = {
        template: {
          originalname: 'invoice.docx',
          buffer: Buffer.from('template content'),
          mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
      };
      
      // Mock file operations
      fs.ensureDir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      // Mock template analysis
      const mockAnalysis = {
        fields: ['name', 'email', 'amount'],
        fileType: 'docx',
        complexity: 'medium'
      };
      TemplateAnalyzer.prototype.analyzeTemplate.mockResolvedValue(mockAnalysis);
      
      // Mock template creation
      const mockTemplate = {
        id: 1,
        name: 'Invoice Template',
        description: 'Template for generating invoices',
        filePath: '/uploads/invoice.docx',
        fileType: 'docx',
        fields: ['name', 'email', 'amount'],
        userId: 1
      };
      Template.create.mockResolvedValue(mockTemplate);
      
      await templateController.createTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockTemplate
      });
      expect(fs.ensureDir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
      expect(TemplateAnalyzer.prototype.analyzeTemplate).toHaveBeenCalled();
      expect(Template.create).toHaveBeenCalled();
    });
    
    it('should handle missing template file', async () => {
      const templateData = {
        name: 'Invoice Template',
        description: 'Template for generating invoices',
        fileType: 'docx'
      };
      
      mockReq.body = templateData;
      mockReq.files = {}; // No template file
      
      await templateController.createTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Template file is required'
      });
    });
    
    it('should validate file type', async () => {
      const templateData = {
        name: 'Invoice Template',
        description: 'Template for generating invoices',
        fileType: 'txt' // Invalid file type
      };
      
      mockReq.body = templateData;
      mockReq.files = {
        template: {
          originalname: 'invoice.txt',
          buffer: Buffer.from('template content'),
          mimetype: 'text/plain'
        }
      };
      
      await templateController.createTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid file type. Only DOCX and PDF files are supported'
      });
    });
    
    it('should handle template analysis errors', async () => {
      const templateData = {
        name: 'Invoice Template',
        description: 'Template for generating invoices',
        fileType: 'docx'
      };
      
      mockReq.body = templateData;
      mockReq.files = {
        template: {
          originalname: 'invoice.docx',
          buffer: Buffer.from('template content'),
          mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
      };
      
      fs.ensureDir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      TemplateAnalyzer.prototype.analyzeTemplate.mockRejectedValue(new Error('Analysis failed'));
      
      await templateController.createTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Analysis failed'
      });
    });
    
    it('should handle file write errors', async () => {
      const templateData = {
        name: 'Invoice Template',
        description: 'Template for generating invoices',
        fileType: 'docx'
      };
      
      mockReq.body = templateData;
      mockReq.files = {
        template: {
          originalname: 'invoice.docx',
          buffer: Buffer.from('template content'),
          mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
      };
      
      fs.ensureDir.mockResolvedValue();
      fs.writeFile.mockRejectedValue(new Error('Write failed'));
      
      await templateController.createTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Write failed'
      });
    });
    
    it('should validate required fields', async () => {
      const invalidData = {
        description: 'Missing required fields'
        // Missing name and fileType
      };
      
      mockReq.body = invalidData;
      
      await templateController.createTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('required')
      });
    });
  });
  
  describe('getTemplate', () => {
    it('should retrieve template by ID successfully', async () => {
      const templateId = '1';
      mockReq.params.id = templateId;
      
      const mockTemplate = {
        id: 1,
        name: 'Invoice Template',
        description: 'Template for generating invoices',
        filePath: '/uploads/invoice.docx',
        fileType: 'docx',
        fields: ['name', 'email', 'amount'],
        userId: 1,
        createdAt: '2023-01-01T00:00:00.000Z'
      };
      
      Template.findById.mockResolvedValue(mockTemplate);
      
      await templateController.getTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockTemplate
      });
      expect(Template.findById).toHaveBeenCalledWith(1);
    });
    
    it('should handle non-existent template', async () => {
      const templateId = '999';
      mockReq.params.id = templateId;
      
      Template.findById.mockResolvedValue(null);
      
      await templateController.getTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Template not found'
      });
    });
    
    it('should handle invalid template ID', async () => {
      const invalidId = 'invalid-id';
      mockReq.params.id = invalidId;
      
      await templateController.getTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid template ID'
      });
    });
  });
  
  describe('getTemplates', () => {
    it('should retrieve templates with filters', async () => {
      const query = {
        fileType: 'docx',
        isActive: 'true',
        limit: '10',
        offset: '0'
      };
      mockReq.query = query;
      
      const mockTemplates = [
        {
          id: 1,
          name: 'Invoice Template',
          fileType: 'docx',
          isActive: true
        },
        {
          id: 2,
          name: 'Contract Template',
          fileType: 'docx',
          isActive: true
        }
      ];
      
      Template.findAll.mockResolvedValue(mockTemplates);
      
      await templateController.getTemplates(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockTemplates,
        pagination: expect.objectContaining({
          limit: 10,
          offset: 0,
          total: 2
        })
      });
    });
    
    it('should return user-specific templates', async () => {
      mockReq.user = { id: 1 };
      mockReq.query = {};
      
      const mockTemplates = [
        {
          id: 1,
          name: 'User Template 1',
          userId: 1
        }
      ];
      
      Template.findAll.mockResolvedValue(mockTemplates);
      
      await templateController.getTemplates(mockReq, mockRes);
      
      expect(Template.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1 })
      );
    });
    
    it('should handle empty results', async () => {
      mockReq.query = { fileType: 'pdf' };
      
      Template.findAll.mockResolvedValue([]);
      
      await templateController.getTemplates(mockReq, mockRes);
      
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
      
      await templateController.getTemplates(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid pagination')
      });
    });
  });
  
  describe('updateTemplate', () => {
    it('should update template successfully', async () => {
      const templateId = '1';
      const updateData = {
        name: 'Updated Invoice Template',
        description: 'Updated description'
      };
      
      mockReq.params.id = templateId;
      mockReq.body = updateData;
      
      const mockTemplate = {
        id: 1,
        name: 'Updated Invoice Template',
        description: 'Updated description',
        fileType: 'docx'
      };
      
      Template.findById.mockResolvedValue(mockTemplate);
      Template.update.mockResolvedValue(true);
      
      await templateController.updateTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockTemplate
      });
      expect(Template.update).toHaveBeenCalledWith(1, updateData);
    });
    
    it('should handle non-existent template update', async () => {
      const templateId = '999';
      mockReq.params.id = templateId;
      mockReq.body = { name: 'Updated Template' };
      
      Template.findById.mockResolvedValue(null);
      
      await templateController.updateTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Template not found'
      });
    });
    
    it('should validate update data', async () => {
      const templateId = '1';
      const invalidUpdateData = {
        fileType: 'invalid_type'
      };
      
      mockReq.params.id = templateId;
      mockReq.body = invalidUpdateData;
      
      await templateController.updateTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid file type')
      });
    });
    
    it('should not allow updating file type', async () => {
      const templateId = '1';
      const updateData = {
        fileType: 'pdf' // Changing from docx to pdf
      };
      
      mockReq.params.id = templateId;
      mockReq.body = updateData;
      
      const mockTemplate = {
        id: 1,
        name: 'Invoice Template',
        fileType: 'docx'
      };
      
      Template.findById.mockResolvedValue(mockTemplate);
      
      await templateController.updateTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'File type cannot be changed after creation'
      });
    });
  });
  
  describe('deleteTemplate', () => {
    it('should delete template successfully', async () => {
      const templateId = '1';
      mockReq.params.id = templateId;
      
      const mockTemplate = {
        id: 1,
        name: 'Invoice Template',
        filePath: '/uploads/invoice.docx',
        status: 'active'
      };
      
      Template.findById.mockResolvedValue(mockTemplate);
      Template.delete.mockResolvedValue(true);
      
      // Mock file deletion
      fs.remove.mockResolvedValue();
      
      await templateController.deleteTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Template deleted successfully'
      });
      expect(Template.delete).toHaveBeenCalledWith(1);
      expect(fs.remove).toHaveBeenCalledWith('/uploads/invoice.docx');
    });
    
    it('should handle non-existent template deletion', async () => {
      const templateId = '999';
      mockReq.params.id = templateId;
      
      Template.findById.mockResolvedValue(null);
      
      await templateController.deleteTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Template not found'
      });
    });
    
    it('should not delete template with active documents', async () => {
      const templateId = '1';
      mockReq.params.id = templateId;
      
      const mockTemplate = {
        id: 1,
        name: 'Invoice Template',
        status: 'active'
      };
      
      Template.findById.mockResolvedValue(mockTemplate);
      
      // Mock check for active documents
      const mockDocuments = [
        { id: 1, templateId: 1, status: 'completed' }
      ];
      
      await templateController.deleteTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot delete template with active documents'
      });
    });
    
    it('should handle file deletion errors gracefully', async () => {
      const templateId = '1';
      mockReq.params.id = templateId;
      
      const mockTemplate = {
        id: 1,
        name: 'Invoice Template',
        filePath: '/uploads/invoice.docx',
        status: 'active'
      };
      
      Template.findById.mockResolvedValue(mockTemplate);
      Template.delete.mockResolvedValue(true);
      
      // Mock file deletion error
      fs.remove.mockRejectedValue(new Error('File not found'));
      
      await templateController.deleteTemplate(mockReq, mockRes);
      
      // Should still succeed even if file deletion fails
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(Template.delete).toHaveBeenCalledWith(1);
    });
  });
  
  describe('uploadTemplate', () => {
    it('should upload template file successfully', async () => {
      const templateId = '1';
      mockReq.params.id = templateId;
      
      mockReq.files = {
        template: {
          originalname: 'new_invoice.docx',
          buffer: Buffer.from('new template content'),
          mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
      };
      
      const mockTemplate = {
        id: 1,
        name: 'Invoice Template',
        filePath: '/uploads/invoice.docx',
        fileType: 'docx'
      };
      
      Template.findById.mockResolvedValue(mockTemplate);
      
      // Mock file operations
      fs.ensureDir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      fs.remove.mockResolvedValue();
      
      // Mock template analysis
      const mockAnalysis = {
        fields: ['name', 'email', 'amount'],
        fileType: 'docx'
      };
      TemplateAnalyzer.prototype.analyzeTemplate.mockResolvedValue(mockAnalysis);
      
      Template.update.mockResolvedValue(true);
      
      await templateController.uploadTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Template file updated successfully'
      });
      expect(fs.writeFile).toHaveBeenCalled();
      expect(TemplateAnalyzer.prototype.analyzeTemplate).toHaveBeenCalled();
      expect(Template.update).toHaveBeenCalled();
    });
    
    it('should handle missing template file', async () => {
      const templateId = '1';
      mockReq.params.id = templateId;
      mockReq.files = {}; // No template file
      
      await templateController.uploadTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Template file is required'
      });
    });
    
    it('should validate file type compatibility', async () => {
      const templateId = '1';
      mockReq.params.id = templateId;
      
      mockReq.files = {
        template: {
          originalname: 'new_invoice.pdf',
          buffer: Buffer.from('new template content'),
          mimetype: 'application/pdf'
        }
      };
      
      const mockTemplate = {
        id: 1,
        name: 'Invoice Template',
        fileType: 'docx' // Original is DOCX, trying to upload PDF
      };
      
      Template.findById.mockResolvedValue(mockTemplate);
      
      await templateController.uploadTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'New file type must match original file type'
      });
    });
    
    it('should handle template analysis errors', async () => {
      const templateId = '1';
      mockReq.params.id = templateId;
      
      mockReq.files = {
        template: {
          originalname: 'new_invoice.docx',
          buffer: Buffer.from('new template content'),
          mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
      };
      
      const mockTemplate = {
        id: 1,
        name: 'Invoice Template',
        fileType: 'docx'
      };
      
      Template.findById.mockResolvedValue(mockTemplate);
      
      fs.ensureDir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      TemplateAnalyzer.prototype.analyzeTemplate.mockRejectedValue(new Error('Analysis failed'));
      
      await templateController.uploadTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Analysis failed'
      });
    });
  });
  
  describe('downloadTemplate', () => {
    it('should download template file successfully', async () => {
      const templateId = '1';
      mockReq.params.id = templateId;
      
      const mockTemplate = {
        id: 1,
        name: 'Invoice Template',
        fileName: 'invoice.docx',
        filePath: '/uploads/invoice.docx',
        fileType: 'docx'
      };
      
      Template.findById.mockResolvedValue(mockTemplate);
      
      // Mock file system operations
      fs.existsSync.mockReturnValue(true);
      fs.createReadStream.mockReturnValue({
        pipe: jest.fn().mockReturnThis(),
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === 'error') return this;
          if (event === 'end') callback();
          return this;
        })
      });
      
      await templateController.downloadTemplate(mockReq, mockRes);
      
      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="invoice.docx"'
      });
    });
    
    it('should handle non-existent template download', async () => {
      const templateId = '999';
      mockReq.params.id = templateId;
      
      Template.findById.mockResolvedValue(null);
      
      await templateController.downloadTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Template not found'
      });
    });
    
    it('should handle missing template file', async () => {
      const templateId = '1';
      mockReq.params.id = templateId;
      
      const mockTemplate = {
        id: 1,
        name: 'Invoice Template',
        fileName: 'invoice.docx',
        filePath: '/uploads/invoice.docx'
      };
      
      Template.findById.mockResolvedValue(mockTemplate);
      
      fs.existsSync.mockReturnValue(false);
      
      await templateController.downloadTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Template file not found'
      });
    });
  });
  
  describe('analyzeTemplate', () => {
    it('should analyze template successfully', async () => {
      const templateId = '1';
      mockReq.params.id = templateId;
      
      const mockTemplate = {
        id: 1,
        name: 'Invoice Template',
        filePath: '/uploads/invoice.docx',
        fileType: 'docx'
      };
      
      Template.findById.mockResolvedValue(mockTemplate);
      
      const mockAnalysis = {
        fields: ['name', 'email', 'amount', 'date'],
        fileType: 'docx',
        complexity: 'medium',
        suggestions: ['Consider adding company logo', 'Optimize field placement']
      };
      
      TemplateAnalyzer.prototype.analyzeTemplate.mockResolvedValue(mockAnalysis);
      
      await templateController.analyzeTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockAnalysis
      });
      expect(TemplateAnalyzer.prototype.analyzeTemplate).toHaveBeenCalledWith('/uploads/invoice.docx');
    });
    
    it('should handle non-existent template analysis', async () => {
      const templateId = '999';
      mockReq.params.id = templateId;
      
      Template.findById.mockResolvedValue(null);
      
      await templateController.analyzeTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Template not found'
      });
    });
    
    it('should handle analysis errors', async () => {
      const templateId = '1';
      mockReq.params.id = templateId;
      
      const mockTemplate = {
        id: 1,
        name: 'Invoice Template',
        filePath: '/uploads/invoice.docx',
        fileType: 'docx'
      };
      
      Template.findById.mockResolvedValue(mockTemplate);
      
      TemplateAnalyzer.prototype.analyzeTemplate.mockRejectedValue(new Error('Analysis failed'));
      
      await templateController.analyzeTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Analysis failed'
      });
    });
  });
  
  describe('getTemplateStats', () => {
    it('should return template statistics', async () => {
      const mockStats = [
        { fileType: 'docx', count: 15 },
        { fileType: 'pdf', count: 8 },
        { status: 'active', count: 20 },
        { status: 'inactive', count: 3 }
      ];
      
      Template.getTemplateStats.mockResolvedValue(mockStats);
      
      await templateController.getTemplateStats(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockStats
      });
    });
    
    it('should return user-specific statistics', async () => {
      mockReq.user = { id: 1 };
      
      const mockStats = [
        { fileType: 'docx', count: 5 },
        { status: 'active', count: 5 }
      ];
      
      Template.getTemplateStats.mockResolvedValue(mockStats);
      
      await templateController.getTemplateStats(mockReq, mockRes);
      
      expect(Template.getTemplateStats).toHaveBeenCalledWith(1);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      mockReq.body = {
        name: 'Test Template',
        fileType: 'docx'
      };
      
      Template.create.mockRejectedValue(new Error('Database connection failed'));
      
      await templateController.createTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Database connection failed'
      });
    });
    
    it('should handle file system errors', async () => {
      const templateId = '1';
      mockReq.params.id = templateId;
      
      const mockTemplate = {
        id: 1,
        name: 'Invoice Template',
        fileName: 'invoice.docx',
        filePath: '/uploads/invoice.docx'
      };
      
      Template.findById.mockResolvedValue(mockTemplate);
      
      fs.existsSync.mockReturnValue(true);
      fs.createReadStream.mockImplementation(() => {
        throw new Error('File read error');
      });
      
      await templateController.downloadTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'File read error'
      });
    });
    
    it('should handle validation errors', async () => {
      const invalidData = {
        name: '', // Empty name
        fileType: 'invalid_type'
      };
      
      mockReq.body = invalidData;
      
      await templateController.createTemplate(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Name cannot be empty')
      });
    });
  });
  
  describe('Performance Tests', () => {
    it('should handle large template analysis efficiently', async () => {
      const templateId = '1';
      mockReq.params.id = templateId;
      
      const mockTemplate = {
        id: 1,
        name: 'Large Template',
        filePath: '/uploads/large_template.docx',
        fileType: 'docx'
      };
      
      Template.findById.mockResolvedValue(mockTemplate);
      
      const mockAnalysis = {
        fields: Array.from({ length: 1000 }, (_, i) => `field${i}`),
        fileType: 'docx',
        complexity: 'high'
      };
      
      TemplateAnalyzer.prototype.analyzeTemplate.mockResolvedValue(mockAnalysis);
      
      const startTime = Date.now();
      await templateController.analyzeTemplate(mockReq, mockRes);
      const endTime = Date.now();
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
    
    it('should handle multiple concurrent template operations', async () => {
      const templateIds = ['1', '2', '3', '4', '5'];
      
      const mockTemplates = templateIds.map(id => ({
        id: parseInt(id),
        name: `Template ${id}`,
        filePath: `/uploads/template${id}.docx`,
        fileType: 'docx'
      }));
      
      Template.findById.mockImplementation((id) => 
        Promise.resolve(mockTemplates.find(t => t.id === parseInt(id)))
      );
      
      const startTime = Date.now();
      const promises = templateIds.map(id => {
        mockReq.params.id = id;
        return templateController.getTemplate(mockReq, mockRes);
      });
      
      await Promise.all(promises);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(3000); // Should complete within 3 seconds
    });
  });
});
