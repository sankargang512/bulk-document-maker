const fileValidation = require('../../../middleware/fileValidation');
const fs = require('fs-extra');
const path = require('path');

// Mock logging service
jest.mock('../../../services/loggingService', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('File Validation Middleware', () => {
  let testDir;
  let testFilePath;

  beforeAll(async () => {
    testDir = path.join(__dirname, '../../../tests/temp/fileValidation');
    await fs.ensureDir(testDir);
  });

  afterAll(async () => {
    await fs.remove(testDir);
  });

  beforeEach(async () => {
    testFilePath = path.join(testDir, `test-${Date.now()}.txt`);
  });

  afterEach(async () => {
    if (await fs.pathExists(testFilePath)) {
      await fs.remove(testFilePath);
    }
  });

  describe('checkMagicNumber', () => {
    it('should return true for null signature', () => {
      const buffer = Buffer.from('test content');
      const result = fileValidation.checkMagicNumber(buffer, null);
      expect(result).toBe(true);
    });

    it('should return true for empty signature', () => {
      const buffer = Buffer.from('test content');
      const result = fileValidation.checkMagicNumber(buffer, []);
      expect(result).toBe(true);
    });

    it('should return false for buffer too small', () => {
      const buffer = Buffer.from('test');
      const signature = [0x50, 0x4B, 0x03, 0x04, 0x05];
      const result = fileValidation.checkMagicNumber(buffer, signature);
      expect(result).toBe(false);
    });

    it('should return true for matching signature', () => {
      const buffer = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
      const signature = [0x50, 0x4B, 0x03, 0x04];
      const result = fileValidation.checkMagicNumber(buffer, signature);
      expect(result).toBe(true);
    });

    it('should return false for non-matching signature', () => {
      const buffer = Buffer.from([0x50, 0x4B, 0x03, 0x05, 0x00, 0x00, 0x00, 0x00]);
      const signature = [0x50, 0x4B, 0x03, 0x04];
      const result = fileValidation.checkMagicNumber(buffer, signature);
      expect(result).toBe(false);
    });
  });

  describe('validateFileContent', () => {
    it('should validate DOCX file with correct magic number', async () => {
      const docxContent = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
      await fs.writeFile(testFilePath, docxContent);
      
      const result = await fileValidation.validateFileContent(
        testFilePath,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      
      expect(result.isValid).toBe(true);
      expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(result.description).toBe('Microsoft Word Document (DOCX)');
    });

    it('should validate PDF file with correct magic number', async () => {
      const pdfContent = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x00, 0x00, 0x00]);
      await fs.writeFile(testFilePath, pdfContent);
      
      const result = await fileValidation.validateFileContent(
        testFilePath,
        'application/pdf'
      );
      
      expect(result.isValid).toBe(true);
      expect(result.mimeType).toBe('application/pdf');
      expect(result.description).toBe('Portable Document Format (PDF)');
    });

    it('should reject file with wrong magic number', async () => {
      const wrongContent = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      await fs.writeFile(testFilePath, wrongContent);
      
      const result = await fileValidation.validateFileContent(
        testFilePath,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('File content does not match expected format');
    });

    it('should validate CSV file structure', async () => {
      const csvContent = 'name,email,company\nJohn,john@test.com,Test Corp\nJane,jane@test.com,Test Corp';
      await fs.writeFile(testFilePath, csvContent);
      
      const result = await fileValidation.validateFileContent(
        testFilePath,
        'text/csv'
      );
      
      expect(result.isValid).toBe(true);
      expect(result.mimeType).toBe('text/csv');
      expect(result.description).toBe('Comma-Separated Values (CSV)');
    });

    it('should reject CSV with inconsistent columns', async () => {
      const invalidCsv = 'name,email,company\nJohn,john@test.com\nJane,jane@test.com,Test Corp';
      await fs.writeFile(testFilePath, invalidCsv);
      
      const result = await fileValidation.validateFileContent(
        testFilePath,
        'text/csv'
      );
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('CSV row 2 has 2 columns, expected 3');
    });

    it('should reject CSV with insufficient rows', async () => {
      const invalidCsv = 'name,email,company';
      await fs.writeFile(testFilePath, invalidCsv);
      
      const result = await fileValidation.validateFileContent(
        testFilePath,
        'text/csv'
      );
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('CSV file must contain at least a header row and one data row');
    });

    it('should handle unsupported MIME type', async () => {
      const content = 'test content';
      await fs.writeFile(testFilePath, content);
      
      const result = await fileValidation.validateFileContent(
        testFilePath,
        'unsupported/type'
      );
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unsupported MIME type');
      expect(result.allowedTypes).toBeDefined();
    });

    it('should handle file read errors gracefully', async () => {
      const result = await fileValidation.validateFileContent(
        '/nonexistent/file',
        'text/plain'
      );
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('File validation failed');
    });
  });

  describe('createFileValidationMiddleware', () => {
    let middleware;
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
      mockReq = {
        files: null,
        file: null,
        requestId: 'test-request-id'
      };

      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      mockNext = jest.fn();
    });

    it('should create middleware with default options', () => {
      middleware = fileValidation.createFileValidationMiddleware();
      expect(typeof middleware).toBe('function');
    });

    it('should create middleware with custom options', () => {
      middleware = fileValidation.createFileValidationMiddleware({
        allowedMimeTypes: ['text/plain'],
        maxFileSize: 1024,
        validateContent: false
      });
      expect(typeof middleware).toBe('function');
    });

    it('should skip validation when no files present', async () => {
      middleware = fileValidation.createFileValidationMiddleware();
      
      await middleware(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.fileValidationResults).toEqual([]);
    });

    it('should validate single file upload', async () => {
      const testFile = {
        originalname: 'test.txt',
        mimetype: 'text/plain',
        size: 100,
        path: testFilePath
      };

      mockReq.file = testFile;
      await fs.writeFile(testFilePath, 'test content');

      middleware = fileValidation.createFileValidationMiddleware({
        allowedMimeTypes: ['text/plain'],
        maxFileSize: 1024,
        validateContent: false
      });

      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.fileValidationResults).toHaveLength(1);
      expect(mockReq.fileValidationResults[0].isValid).toBe(true);
    });

    it('should validate multiple file uploads', async () => {
      const testFiles = [
        {
          originalname: 'test1.txt',
          mimetype: 'text/plain',
          size: 100,
          path: testFilePath
        },
        {
          originalname: 'test2.txt',
          mimetype: 'text/plain',
          size: 200,
          path: testFilePath
        }
      ];

      mockReq.files = { files: testFiles };
      await fs.writeFile(testFilePath, 'test content');

      middleware = fileValidation.createFileValidationMiddleware({
        allowedMimeTypes: ['text/plain'],
        maxFileSize: 1024,
        validateContent: false
      });

      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.fileValidationResults).toHaveLength(2);
      expect(mockReq.fileValidationResults.every(r => r.isValid)).toBe(true);
    });

    it('should reject file exceeding size limit', async () => {
      const testFile = {
        originalname: 'large.txt',
        mimetype: 'text/plain',
        size: 2048,
        path: testFilePath
      };

      mockReq.file = testFile;

      middleware = fileValidation.createFileValidationMiddleware({
        allowedMimeTypes: ['text/plain'],
        maxFileSize: 1024,
        validateContent: false
      });

      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('exceeds maximum size limit')
        })
      );
    });

    it('should reject file with invalid MIME type', async () => {
      const testFile = {
        originalname: 'test.exe',
        mimetype: 'application/x-executable',
        size: 100,
        path: testFilePath
      };

      mockReq.file = testFile;

      middleware = fileValidation.createFileValidationMiddleware({
        allowedMimeTypes: ['text/plain'],
        maxFileSize: 1024,
        validateContent: false
      });

      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('is not allowed')
        })
      );
    });

    it('should reject file with invalid extension', async () => {
      const testFile = {
        originalname: 'test.exe',
        mimetype: 'text/plain',
        size: 100,
        path: testFilePath
      };

      mockReq.file = testFile;

      middleware = fileValidation.createFileValidationMiddleware({
        allowedMimeTypes: ['text/plain'],
        maxFileSize: 1024,
        validateContent: false
      });

      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('extension .exe is not allowed')
        })
      );
    });

    it('should handle validation errors gracefully', async () => {
      const testFile = {
        originalname: 'test.txt',
        mimetype: 'text/plain',
        size: 100,
        path: '/invalid/path'
      };

      mockReq.file = testFile;

      middleware = fileValidation.createFileValidationMiddleware({
        allowedMimeTypes: ['text/plain'],
        maxFileSize: 1024,
        validateContent: true
      });

      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'File validation failed'
        })
      );
    });
  });

  describe('Pre-configured middleware', () => {
    it('should have validateTemplateFiles middleware', () => {
      expect(fileValidation.validateTemplateFiles).toBeDefined();
      expect(typeof fileValidation.validateTemplateFiles).toBe('function');
    });

    it('should have validateCSVFiles middleware', () => {
      expect(fileValidation.validateCSVFiles).toBeDefined();
      expect(typeof fileValidation.validateCSVFiles).toBe('function');
    });

    it('should have validateBatchFiles middleware', () => {
      expect(fileValidation.validateBatchFiles).toBeDefined();
      expect(typeof fileValidation.validateBatchFiles).toBe('function');
    });
  });

  describe('Constants', () => {
    it('should export MAGIC_NUMBERS', () => {
      expect(fileValidation.MAGIC_NUMBERS).toBeDefined();
      expect(typeof fileValidation.MAGIC_NUMBERS).toBe('object');
    });

    it('should export ALLOWED_EXTENSIONS', () => {
      expect(fileValidation.ALLOWED_EXTENSIONS).toBeDefined();
      expect(typeof fileValidation.ALLOWED_EXTENSIONS).toBe('object');
    });

    it('should export FILE_SIZE_LIMITS', () => {
      expect(fileValidation.FILE_SIZE_LIMITS).toBeDefined();
      expect(typeof fileValidation.FILE_SIZE_LIMITS).toBe('object');
    });
  });
});
