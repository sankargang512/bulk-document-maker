const TemplateAnalyzer = require('../../services/templateAnalyzer');
const fs = require('fs-extra');
const path = require('path');

// Mock external dependencies
jest.mock('fs-extra');
jest.mock('path');
jest.mock('openai', () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Mock AI analysis' } }]
        })
      }
    }
  }))
}));

describe('Template Analyzer Service', () => {
  let templateAnalyzer;
  
  beforeEach(() => {
    templateAnalyzer = new TemplateAnalyzer();
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('analyzeTemplate', () => {
    it('should analyze DOCX template successfully', async () => {
      const templatePath = '/test/path/template.docx';
      const mockContent = 'Hello {{name}}, welcome to {{company}}!';
      
      fs.readFile.mockResolvedValue(mockContent);
      
      const result = await templateAnalyzer.analyzeTemplate(templatePath);
      
      expect(result).toHaveProperty('templatePath');
      expect(result).toHaveProperty('fileType');
      expect(result).toHaveProperty('fields');
      expect(result).toHaveProperty('analysis');
      expect(result.fileType).toBe('docx');
      expect(result.fields).toContain('name');
      expect(result.fields).toContain('company');
    });
    
    it('should analyze PDF template successfully', async () => {
      const templatePath = '/test/path/template.pdf';
      const mockContent = 'Hello {{name}}, welcome to {{company}}!';
      
      fs.readFile.mockResolvedValue(mockContent);
      
      const result = await templateAnalyzer.analyzeTemplate(templatePath);
      
      expect(result.fileType).toBe('pdf');
      expect(result.fields).toContain('name');
      expect(result.fields).toContain('company');
    });
    
    it('should handle unsupported file types', async () => {
      const templatePath = '/test/path/template.txt';
      
      await expect(templateAnalyzer.analyzeTemplate(templatePath)).rejects.toThrow();
    });
    
    it('should handle file read errors', async () => {
      const templatePath = '/test/path/nonexistent.docx';
      const error = new Error('File not found');
      
      fs.readFile.mockRejectedValue(error);
      
      await expect(templateAnalyzer.analyzeTemplate(templatePath)).rejects.toThrow('File not found');
    });
  });
  
  describe('extractFields', () => {
    it('should extract simple placeholder fields', () => {
      const content = 'Hello {{name}}, welcome to {{company}}! Your role is {{role}}.';
      const expectedFields = ['name', 'company', 'role'];
      
      const fields = templateAnalyzer.extractFields(content);
      expect(fields).toEqual(expect.arrayContaining(expectedFields));
    });
    
    it('should extract nested placeholder fields', () => {
      const content = 'Hello {{user.name}}, welcome to {{company.name}}! Your role is {{user.role}}.';
      const expectedFields = ['user.name', 'company.name', 'user.role'];
      
      const fields = templateAnalyzer.extractFields(content);
      expect(fields).toEqual(expect.arrayContaining(expectedFields));
    });
    
    it('should extract array placeholder fields', () => {
      const content = 'Hello {{name}}, your skills are: {{skills[0]}}, {{skills[1]}}, {{skills[2]}}.';
      const expectedFields = ['name', 'skills[0]', 'skills[1]', 'skills[2]'];
      
      const fields = templateAnalyzer.extractFields(content);
      expect(fields).toEqual(expect.arrayContaining(expectedFields));
    });
    
    it('should handle complex placeholder patterns', () => {
      const content = 'Hello {{name}}, your ID is {{id:format="0000"}}, and your status is {{status:default="active"}}.';
      const expectedFields = ['name', 'id:format="0000"', 'status:default="active"'];
      
      const fields = templateAnalyzer.extractFields(content);
      expect(fields).toEqual(expect.arrayContaining(expectedFields));
    });
    
    it('should handle no placeholders', () => {
      const content = 'Hello, this is a static template with no placeholders.';
      
      const fields = templateAnalyzer.extractFields(content);
      expect(fields).toEqual([]);
    });
    
    it('should handle duplicate placeholders', () => {
      const content = 'Hello {{name}}, welcome {{name}}! Your company is {{company}}.';
      const expectedFields = ['name', 'company'];
      
      const fields = templateAnalyzer.extractFields(content);
      expect(fields).toEqual(expect.arrayContaining(expectedFields));
      expect(fields).toHaveLength(2); // No duplicates
    });
  });
  
  describe('analyzeTemplateStructure', () => {
    it('should analyze template structure successfully', () => {
      const content = 'Hello {{name}},\n\nWelcome to {{company}}!\n\nYour role: {{role}}\nDepartment: {{department}}';
      const fields = ['name', 'company', 'role', 'department'];
      
      const structure = templateAnalyzer.analyzeTemplateStructure(content, fields);
      
      expect(structure).toHaveProperty('fieldCount');
      expect(structure).toHaveProperty('fieldTypes');
      expect(structure).toHaveProperty('complexity');
      expect(structure).toHaveProperty('sections');
      expect(structure.fieldCount).toBe(4);
    });
    
    it('should categorize field types correctly', () => {
      const content = 'Hello {{name}}, your ID is {{id:format="0000"}}, and your skills are {{skills[0]}}, {{skills[1]}}.';
      const fields = ['name', 'id:format="0000"', 'skills[0]', 'skills[1]'];
      
      const structure = templateAnalyzer.analyzeTemplateStructure(content, fields);
      
      expect(structure.fieldTypes).toHaveProperty('simple');
      expect(structure.fieldTypes).toHaveProperty('formatted');
      expect(structure.fieldTypes).toHaveProperty('array');
    });
    
    it('should calculate complexity score', () => {
      const content = 'Hello {{name}}, welcome to {{company}}!';
      const fields = ['name', 'company'];
      
      const structure = templateAnalyzer.analyzeTemplateStructure(content, fields);
      
      expect(structure.complexity).toBeGreaterThan(0);
      expect(structure.complexity).toBeLessThanOrEqual(10);
    });
  });
  
  describe('validateTemplateCompatibility', () => {
    it('should validate template compatibility successfully', () => {
      const templateFields = ['name', 'email', 'company'];
      const csvFields = ['name', 'email', 'company', 'role', 'department'];
      
      const validation = templateAnalyzer.validateTemplateCompatibility(templateFields, csvFields);
      
      expect(validation.isCompatible).toBe(true);
      expect(validation.missingFields).toEqual([]);
      expect(validation.extraFields).toEqual(['role', 'department']);
    });
    
    it('should detect missing required fields', () => {
      const templateFields = ['name', 'email', 'company', 'role'];
      const csvFields = ['name', 'email'];
      
      const validation = templateAnalyzer.validateTemplateCompatibility(templateFields, csvFields);
      
      expect(validation.isCompatible).toBe(false);
      expect(validation.missingFields).toEqual(['company', 'role']);
      expect(validation.extraFields).toEqual([]);
    });
    
    it('should handle empty field arrays', () => {
      const templateFields = [];
      const csvFields = ['name', 'email'];
      
      const validation = templateAnalyzer.validateTemplateCompatibility(templateFields, csvFields);
      
      expect(validation.isCompatible).toBe(true);
      expect(validation.missingFields).toEqual([]);
      expect(validation.extraFields).toEqual(['name', 'email']);
    });
  });
  
  describe('generateFieldMapping', () => {
    it('should generate field mapping successfully', () => {
      const templateFields = ['name', 'email', 'company'];
      const csvFields = ['fullName', 'emailAddress', 'companyName'];
      
      const mapping = templateAnalyzer.generateFieldMapping(templateFields, csvFields);
      
      expect(mapping).toHaveProperty('name');
      expect(mapping).toHaveProperty('email');
      expect(mapping).toHaveProperty('company');
      expect(mapping.name).toBe('fullName');
      expect(mapping.email).toBe('emailAddress');
      expect(mapping.company).toBe('companyName');
    });
    
    it('should handle partial field mapping', () => {
      const templateFields = ['name', 'email', 'company', 'role'];
      const csvFields = ['fullName', 'emailAddress'];
      
      const mapping = templateAnalyzer.generateFieldMapping(templateFields, csvFields);
      
      expect(mapping.name).toBe('fullName');
      expect(mapping.email).toBe('emailAddress');
      expect(mapping.company).toBeUndefined();
      expect(mapping.role).toBeUndefined();
    });
    
    it('should use exact matches when available', () => {
      const templateFields = ['name', 'email', 'company'];
      const csvFields = ['name', 'email', 'company'];
      
      const mapping = templateAnalyzer.generateFieldMapping(templateFields, csvFields);
      
      expect(mapping.name).toBe('name');
      expect(mapping.email).toBe('email');
      expect(mapping.company).toBe('company');
    });
  });
  
  describe('AI-powered Analysis', () => {
    it('should perform AI analysis on template content', async () => {
      const content = 'Hello {{name}}, welcome to {{company}}! Your role is {{role}}.';
      const fields = ['name', 'company', 'role'];
      
      const aiAnalysis = await templateAnalyzer.performAIAnalysis(content, fields);
      
      expect(aiAnalysis).toHaveProperty('suggestions');
      expect(aiAnalysis).toHaveProperty('improvements');
      expect(aiAnalysis).toHaveProperty('complexity');
    });
    
    it('should handle AI analysis errors gracefully', async () => {
      // Mock OpenAI to throw an error
      const mockOpenAI = require('openai');
      mockOpenAI.OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(new Error('AI service unavailable'))
          }
        }
      }));
      
      const content = 'Hello {{name}}!';
      const fields = ['name'];
      
      const aiAnalysis = await templateAnalyzer.performAIAnalysis(content, fields);
      
      expect(aiAnalysis).toHaveProperty('error');
      expect(aiAnalysis.error).toBe('AI service unavailable');
    });
  });
  
  describe('Template Optimization', () => {
    it('should suggest template optimizations', () => {
      const content = 'Hello {{name}}, welcome to {{company}}! Your role is {{role}}.';
      const fields = ['name', 'company', 'role'];
      
      const optimizations = templateAnalyzer.suggestOptimizations(content, fields);
      
      expect(optimizations).toHaveProperty('suggestions');
      expect(optimizations).toHaveProperty('performance');
      expect(optimizations).toHaveProperty('accessibility');
    });
    
    it('should detect performance issues', () => {
      const content = 'Hello {{name}}, welcome to {{company}}! Your role is {{role}}.'.repeat(100);
      const fields = ['name', 'company', 'role'];
      
      const optimizations = templateAnalyzer.suggestOptimizations(content, fields);
      
      expect(optimizations.performance).toHaveProperty('issues');
      expect(optimizations.performance.issues.length).toBeGreaterThan(0);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle malformed template content', async () => {
      const malformedContent = Buffer.from([0xFF, 0xFE, 0x00, 0x00]);
      
      await expect(templateAnalyzer.analyzeTemplate('/test/path/malformed.docx')).rejects.toThrow();
    });
    
    it('should handle extremely large templates', async () => {
      const largeContent = 'Hello {{name}}! '.repeat(100000); // Very large template
      
      fs.readFile.mockResolvedValue(largeContent);
      
      const result = await templateAnalyzer.analyzeTemplate('/test/path/large.docx');
      
      expect(result).toHaveProperty('fields');
      expect(result.fields).toContain('name');
    });
  });
  
  describe('Performance Tests', () => {
    it('should analyze large template within reasonable time', async () => {
      const startTime = Date.now();
      
      const largeContent = 'Hello {{name}}, welcome to {{company}}! Your role is {{role}}. '.repeat(1000);
      const fields = ['name', 'company', 'role'];
      
      fs.readFile.mockResolvedValue(largeContent);
      
      const result = await templateAnalyzer.analyzeTemplate('/test/path/large.docx');
      const endTime = Date.now();
      
      expect(result.fields).toContain('name');
      expect(endTime - startTime).toBeLessThan(3000); // Should complete within 3 seconds
    });
    
    it('should handle multiple concurrent analyses', async () => {
      const templatePaths = [
        '/test/path/template1.docx',
        '/test/path/template2.docx',
        '/test/path/template3.docx'
      ];
      
      const mockContent = 'Hello {{name}}!';
      fs.readFile.mockResolvedValue(mockContent);
      
      const promises = templatePaths.map(path => templateAnalyzer.analyzeTemplate(path));
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.fields).toContain('name');
      });
    });
  });
});
