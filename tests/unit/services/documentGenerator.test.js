const DocumentGenerator = require('../../services/documentGenerator');
const fs = require('fs-extra');
const path = require('path');

// Mock external dependencies
jest.mock('fs-extra');
jest.mock('path');

describe('Document Generator Service', () => {
  let documentGenerator;
  
  beforeEach(() => {
    documentGenerator = new DocumentGenerator();
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('generateDocument', () => {
    it('should generate document from template and data successfully', async () => {
      const templatePath = '/test/path/template.docx';
      const data = { name: 'John Doe', company: 'ACME Corp', role: 'Developer' };
      const outputPath = '/test/output/generated.docx';
      
      const mockTemplateContent = 'Hello {{name}}, welcome to {{company}}! Your role is {{role}}.';
      const mockGeneratedContent = 'Hello John Doe, welcome to ACME Corp! Your role is Developer.';
      
      fs.readFile.mockResolvedValue(mockTemplateContent);
      fs.writeFile.mockResolvedValue();
      
      const result = await documentGenerator.generateDocument(templatePath, data, outputPath);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('outputPath');
      expect(result).toHaveProperty('generatedAt');
      expect(result.success).toBe(true);
      expect(result.outputPath).toBe(outputPath);
      expect(fs.writeFile).toHaveBeenCalledWith(outputPath, mockGeneratedContent);
    });
    
    it('should handle template file read errors', async () => {
      const templatePath = '/test/path/nonexistent.docx';
      const data = { name: 'John Doe' };
      const outputPath = '/test/output/generated.docx';
      
      const error = new Error('Template file not found');
      fs.readFile.mockRejectedValue(error);
      
      await expect(documentGenerator.generateDocument(templatePath, data, outputPath)).rejects.toThrow('Template file not found');
    });
    
    it('should handle output directory creation errors', async () => {
      const templatePath = '/test/path/template.docx';
      const data = { name: 'John Doe' };
      const outputPath = '/test/output/generated.docx';
      
      const mockTemplateContent = 'Hello {{name}}!';
      const error = new Error('Permission denied');
      
      fs.readFile.mockResolvedValue(mockTemplateContent);
      fs.ensureDir.mockRejectedValue(error);
      
      await expect(documentGenerator.generateDocument(templatePath, data, outputPath)).rejects.toThrow('Permission denied');
    });
  });
  
  describe('processTemplate', () => {
    it('should process template with simple placeholders', () => {
      const template = 'Hello {{name}}, welcome to {{company}}!';
      const data = { name: 'John Doe', company: 'ACME Corp' };
      
      const result = documentGenerator.processTemplate(template, data);
      
      expect(result).toBe('Hello John Doe, welcome to ACME Corp!');
    });
    
    it('should process template with nested placeholders', () => {
      const template = 'Hello {{user.name}}, welcome to {{company.name}}!';
      const data = { 
        user: { name: 'John Doe' }, 
        company: { name: 'ACME Corp' } 
      };
      
      const result = documentGenerator.processTemplate(template, data);
      
      expect(result).toBe('Hello John Doe, welcome to ACME Corp!');
    });
    
    it('should process template with array placeholders', () => {
      const template = 'Hello {{name}}, your skills are: {{skills[0]}}, {{skills[1]}}.';
      const data = { 
        name: 'John Doe', 
        skills: ['JavaScript', 'Python'] 
      };
      
      const result = documentGenerator.processTemplate(template, data);
      
      expect(result).toBe('Hello John Doe, your skills are: JavaScript, Python.');
    });
    
    it('should handle missing placeholder data', () => {
      const template = 'Hello {{name}}, welcome to {{company}}!';
      const data = { name: 'John Doe' }; // Missing company
      
      const result = documentGenerator.processTemplate(template, data);
      
      expect(result).toBe('Hello John Doe, welcome to {{company}}!');
    });
    
    it('should handle empty template', () => {
      const template = '';
      const data = { name: 'John Doe' };
      
      const result = documentGenerator.processTemplate(template, data);
      
      expect(result).toBe('');
    });
    
    it('should handle template with no placeholders', () => {
      const template = 'Hello, this is a static template.';
      const data = { name: 'John Doe' };
      
      const result = documentGenerator.processTemplate(template, data);
      
      expect(result).toBe('Hello, this is a static template.');
    });
    
    it('should handle special characters in data', () => {
      const template = 'Hello {{name}}, your email is {{email}}!';
      const data = { 
        name: 'John "Doe"', 
        email: 'john@example.com' 
      };
      
      const result = documentGenerator.processTemplate(template, data);
      
      expect(result).toBe('Hello John "Doe", your email is john@example.com!');
    });
  });
  
  describe('generateBulkDocuments', () => {
    it('should generate multiple documents successfully', async () => {
      const templatePath = '/test/path/template.docx';
      const dataArray = [
        { name: 'John Doe', company: 'ACME Corp' },
        { name: 'Jane Smith', company: 'Tech Inc' },
        { name: 'Bob Johnson', company: 'Startup LLC' }
      ];
      const outputDir = '/test/output';
      
      const mockTemplateContent = 'Hello {{name}}, welcome to {{company}}!';
      
      fs.readFile.mockResolvedValue(mockTemplateContent);
      fs.ensureDir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      const results = await documentGenerator.generateBulkDocuments(templatePath, dataArray, outputDir);
      
      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.outputPath).toContain(dataArray[index].name.replace(/\s+/g, '_'));
      });
    });
    
    it('should handle partial failures in bulk generation', async () => {
      const templatePath = '/test/path/template.docx';
      const dataArray = [
        { name: 'John Doe', company: 'ACME Corp' },
        { name: 'Jane Smith', company: 'Tech Inc' },
        { name: 'Bob Johnson', company: 'Startup LLC' }
      ];
      const outputDir = '/test/output';
      
      const mockTemplateContent = 'Hello {{name}}, welcome to {{company}}!';
      
      fs.readFile.mockResolvedValue(mockTemplateContent);
      fs.ensureDir.mockResolvedValue();
      fs.writeFile
        .mockResolvedValueOnce() // First write succeeds
        .mockRejectedValueOnce(new Error('Write failed')) // Second write fails
        .mockResolvedValueOnce(); // Third write succeeds
      
      const results = await documentGenerator.generateBulkDocuments(templatePath, dataArray, outputDir);
      
      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });
    
    it('should handle empty data array', async () => {
      const templatePath = '/test/path/template.docx';
      const dataArray = [];
      const outputDir = '/test/output';
      
      const results = await documentGenerator.generateBulkDocuments(templatePath, dataArray, outputDir);
      
      expect(results).toEqual([]);
    });
  });
  
  describe('validateData', () => {
    it('should validate data structure successfully', () => {
      const data = { name: 'John Doe', email: 'john@example.com', company: 'ACME Corp' };
      const requiredFields = ['name', 'email', 'company'];
      
      const validation = documentGenerator.validateData(data, requiredFields);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
    
    it('should detect missing required fields', () => {
      const data = { name: 'John Doe', email: 'john@example.com' };
      const requiredFields = ['name', 'email', 'company'];
      
      const validation = documentGenerator.validateData(data, requiredFields);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Missing required field: company');
    });
    
    it('should detect empty required fields', () => {
      const data = { name: 'John Doe', email: '', company: 'ACME Corp' };
      const requiredFields = ['name', 'email', 'company'];
      
      const validation = documentGenerator.validateData(data, requiredFields);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Required field is empty: email');
    });
    
    it('should handle nested field validation', () => {
      const data = { 
        user: { name: 'John Doe', email: 'john@example.com' }, 
        company: 'ACME Corp' 
      };
      const requiredFields = ['user.name', 'user.email', 'company'];
      
      const validation = documentGenerator.validateData(data, requiredFields);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });
  
  describe('formatOutput', () => {
    it('should format output filename correctly', () => {
      const baseName = 'template';
      const data = { name: 'John Doe', company: 'ACME Corp' };
      const extension = 'docx';
      
      const filename = documentGenerator.formatOutput(baseName, data, extension);
      
      expect(filename).toContain('John_Doe');
      expect(filename).toContain('ACME_Corp');
      expect(filename).toContain('.docx');
    });
    
    it('should handle special characters in filename', () => {
      const baseName = 'template';
      const data = { name: 'John "Doe"', company: 'ACME & Corp' };
      const extension = 'docx';
      
      const filename = documentGenerator.formatOutput(baseName, data, extension);
      
      expect(filename).not.toContain('"');
      expect(filename).not.toContain('&');
      expect(filename).toContain('John_Doe');
      expect(filename).toContain('ACME_Corp');
    });
    
    it('should handle empty data fields', () => {
      const baseName = 'template';
      const data = { name: '', company: 'ACME Corp' };
      const extension = 'docx';
      
      const filename = documentGenerator.formatOutput(baseName, data, extension);
      
      expect(filename).toContain('ACME_Corp');
      expect(filename).not.toContain('__'); // No double underscores
    });
  });
  
  describe('compressOutput', () => {
    it('should compress output files successfully', async () => {
      const outputDir = '/test/output';
      const files = [
        '/test/output/doc1.docx',
        '/test/output/doc2.docx',
        '/test/output/doc3.docx'
      ];
      const archivePath = '/test/output/archive.zip';
      
      fs.readdir.mockResolvedValue(['doc1.docx', 'doc2.docx', 'doc3.docx']);
      fs.stat.mockResolvedValue({ isFile: () => true });
      fs.createWriteStream.mockReturnValue({
        pipe: jest.fn().mockReturnThis(),
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === 'finish') callback();
          return this;
        })
      });
      
      const result = await documentGenerator.compressOutput(outputDir, archivePath);
      
      expect(result.success).toBe(true);
      expect(result.archivePath).toBe(archivePath);
    });
    
    it('should handle compression errors', async () => {
      const outputDir = '/test/output';
      const archivePath = '/test/output/archive.zip';
      
      const error = new Error('Compression failed');
      fs.readdir.mockRejectedValue(error);
      
      await expect(documentGenerator.compressOutput(outputDir, archivePath)).rejects.toThrow('Compression failed');
    });
  });
  
  describe('Error Handling', () => {
    it('should handle malformed template content', async () => {
      const templatePath = '/test/path/template.docx';
      const data = { name: 'John Doe' };
      const outputPath = '/test/output/generated.docx';
      
      const malformedContent = Buffer.from([0xFF, 0xFE, 0x00, 0x00]);
      fs.readFile.mockResolvedValue(malformedContent);
      
      await expect(documentGenerator.generateDocument(templatePath, data, outputPath)).rejects.toThrow();
    });
    
    it('should handle extremely large data objects', async () => {
      const templatePath = '/test/path/template.docx';
      const largeData = {};
      
      // Create a large data object
      for (let i = 0; i < 1000; i++) {
        largeData[`field${i}`] = `value${i}`.repeat(100);
      }
      
      const outputPath = '/test/output/generated.docx';
      const mockTemplateContent = 'Hello {{field0}}!';
      
      fs.readFile.mockResolvedValue(mockTemplateContent);
      fs.writeFile.mockResolvedValue();
      
      const result = await documentGenerator.generateDocument(templatePath, largeData, outputPath);
      
      expect(result.success).toBe(true);
    });
  });
  
  describe('Performance Tests', () => {
    it('should generate large document within reasonable time', async () => {
      const startTime = Date.now();
      
      const templatePath = '/test/path/template.docx';
      const data = { name: 'John Doe', company: 'ACME Corp' };
      const outputPath = '/test/output/generated.docx';
      
      const largeTemplate = 'Hello {{name}}, welcome to {{company}}! '.repeat(1000);
      
      fs.readFile.mockResolvedValue(largeTemplate);
      fs.writeFile.mockResolvedValue();
      
      const result = await documentGenerator.generateDocument(templatePath, data, outputPath);
      const endTime = Date.now();
      
      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
    
    it('should handle multiple concurrent generations', async () => {
      const templatePath = '/test/path/template.docx';
      const dataArray = Array.from({ length: 10 }, (_, i) => ({
        name: `User ${i}`,
        company: `Company ${i}`
      }));
      const outputDir = '/test/output';
      
      const mockTemplateContent = 'Hello {{name}}, welcome to {{company}}!';
      
      fs.readFile.mockResolvedValue(mockTemplateContent);
      fs.ensureDir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      
      const startTime = Date.now();
      const results = await documentGenerator.generateBulkDocuments(templatePath, dataArray, outputDir);
      const endTime = Date.now();
      
      expect(results).toHaveLength(10);
      results.forEach(result => expect(result.success).toBe(true));
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });
});
