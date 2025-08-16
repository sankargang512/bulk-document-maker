const LoggingService = require('../../services/loggingService');
const fs = require('fs-extra');
const path = require('path');

// Mock external dependencies
jest.mock('fs-extra');
jest.mock('path');

describe('Logging Service', () => {
  let loggingService;
  
  beforeEach(() => {
    loggingService = new LoggingService();
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('log', () => {
    it('should log message with default level', async () => {
      const message = 'Test log message';
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.log(message);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining(message),
        'utf8'
      );
    });
    
    it('should log message with specified level', async () => {
      const message = 'Error message';
      const level = 'error';
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.log(message, level);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('ERROR'),
        'utf8'
      );
    });
    
    it('should log message with context', async () => {
      const message = 'User login attempt';
      const level = 'info';
      const context = { userId: 123, ip: '192.168.1.1' };
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.log(message, level, context);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('User login attempt'),
        'utf8'
      );
    });
    
    it('should handle file write errors', async () => {
      const message = 'Test message';
      const error = new Error('Write failed');
      
      fs.appendFile.mockRejectedValue(error);
      
      await expect(loggingService.log(message)).rejects.toThrow('Write failed');
    });
  });
  
  describe('logLevel methods', () => {
    it('should log debug messages', async () => {
      const message = 'Debug information';
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.debug(message);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('DEBUG'),
        'utf8'
      );
    });
    
    it('should log info messages', async () => {
      const message = 'Information message';
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.info(message);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('INFO'),
        'utf8'
      );
    });
    
    it('should log warning messages', async () => {
      const message = 'Warning message';
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.warn(message);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('WARN'),
        'utf8'
      );
    });
    
    it('should log error messages', async () => {
      const message = 'Error message';
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.error(message);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('ERROR'),
        'utf8'
      );
    });
    
    it('should log fatal messages', async () => {
      const message = 'Fatal error';
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.fatal(message);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('FATAL'),
        'utf8'
      );
    });
  });
  
  describe('logRequest', () => {
    it('should log HTTP request details', async () => {
      const req = {
        method: 'POST',
        url: '/api/documents',
        ip: '192.168.1.1',
        headers: { 'user-agent': 'Mozilla/5.0' }
      };
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logRequest(req);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('POST /api/documents'),
        'utf8'
      );
    });
    
    it('should log request with user information', async () => {
      const req = {
        method: 'GET',
        url: '/api/templates',
        ip: '192.168.1.1',
        user: { id: 123, email: 'user@example.com' }
      };
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logRequest(req);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('user@example.com'),
        'utf8'
      );
    });
  });
  
  describe('logResponse', () => {
    it('should log HTTP response details', async () => {
      const req = {
        method: 'POST',
        url: '/api/documents'
      };
      const res = {
        statusCode: 201,
        locals: { responseTime: 150 }
      };
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logResponse(req, res);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('201'),
        'utf8'
      );
    });
    
    it('should log response time', async () => {
      const req = {
        method: 'GET',
        url: '/api/templates'
      };
      const res = {
        statusCode: 200,
        locals: { responseTime: 75 }
      };
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logResponse(req, res);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('75ms'),
        'utf8'
      );
    });
  });
  
  describe('logError', () => {
    it('should log error with stack trace', async () => {
      const error = new Error('Database connection failed');
      const req = {
        method: 'POST',
        url: '/api/documents'
      };
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logError(error, req);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('Database connection failed'),
        'utf8'
      );
    });
    
    it('should log error without request context', async () => {
      const error = new Error('System error');
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logError(error);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('System error'),
        'utf8'
      );
    });
    
    it('should handle circular reference errors', async () => {
      const error = new Error('Circular reference');
      const circularObj = {};
      circularObj.self = circularObj;
      error.context = circularObj;
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logError(error);
      
      expect(fs.appendFile).toHaveBeenCalled();
    });
  });
  
  describe('logPerformance', () => {
    it('should log performance metrics', async () => {
      const operation = 'document_generation';
      const duration = 1250;
      const metadata = { documentCount: 100, templateSize: '2MB' };
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logPerformance(operation, duration, metadata);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('PERFORMANCE'),
        'utf8'
      );
    });
    
    it('should log slow operations as warnings', async () => {
      const operation = 'csv_parsing';
      const duration = 5000; // 5 seconds - slow operation
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logPerformance(operation, duration);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('WARN'),
        'utf8'
      );
    });
  });
  
  describe('logSecurity', () => {
    it('should log security events', async () => {
      const event = 'failed_login';
      const details = {
        ip: '192.168.1.1',
        email: 'user@example.com',
        reason: 'Invalid password'
      };
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logSecurity(event, details);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('SECURITY'),
        'utf8'
      );
    });
    
    it('should log suspicious activities', async () => {
      const event = 'suspicious_activity';
      const details = {
        ip: '192.168.1.1',
        action: 'multiple_failed_logins',
        count: 15
      };
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logSecurity(event, details);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('SUSPICIOUS'),
        'utf8'
      );
    });
  });
  
  describe('logDatabase', () => {
    it('should log database operations', async () => {
      const operation = 'SELECT';
      const table = 'users';
      const duration = 45;
      const query = 'SELECT * FROM users WHERE status = ?';
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logDatabase(operation, table, duration, query);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('DATABASE'),
        'utf8'
      );
    });
    
    it('should log slow database queries', async () => {
      const operation = 'UPDATE';
      const table = 'documents';
      const duration = 2500; // 2.5 seconds - slow query
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logDatabase(operation, table, duration);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('WARN'),
        'utf8'
      );
    });
  });
  
  describe('logFileOperation', () => {
    it('should log file operations', async () => {
      const operation = 'upload';
      const filePath = '/uploads/template.docx';
      const fileSize = 1024000; // 1MB
      const metadata = { userId: 123, fileType: 'docx' };
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logFileOperation(operation, filePath, fileSize, metadata);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('FILE'),
        'utf8'
      );
    });
    
    it('should log large file operations as warnings', async () => {
      const operation = 'download';
      const filePath = '/generated/documents.zip';
      const fileSize = 52428800; // 50MB - large file
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logFileOperation(operation, filePath, fileSize);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('WARN'),
        'utf8'
      );
    });
  });
  
  describe('logUserAction', () => {
    it('should log user actions', async () => {
      const userId = 123;
      const action = 'template_created';
      const details = {
        templateName: 'Invoice Template',
        templateId: 456
      };
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logUserAction(userId, action, details);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('USER_ACTION'),
        'utf8'
      );
    });
    
    it('should log sensitive user actions', async () => {
      const userId = 123;
      const action = 'password_changed';
      const details = { ip: '192.168.1.1' };
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logUserAction(userId, action, details);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('SECURITY'),
        'utf8'
      );
    });
  });
  
  describe('logSystem', () => {
    it('should log system events', async () => {
      const event = 'server_startup';
      const details = {
        version: '1.0.0',
        environment: 'production',
        timestamp: new Date().toISOString()
      };
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logSystem(event, details);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('SYSTEM'),
        'utf8'
      );
    });
    
    it('should log system warnings', async () => {
      const event = 'high_memory_usage';
      const details = {
        memoryUsage: '85%',
        threshold: '80%'
      };
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.logSystem(event, details);
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.stringContaining('WARN'),
        'utf8'
      );
    });
  });
  
  describe('Log Rotation', () => {
    it('should rotate log files when they exceed size limit', async () => {
      const logPath = '/logs/app.log';
      const logStats = { size: 10485760 }; // 10MB
      
      fs.stat.mockResolvedValue(logStats);
      fs.rename.mockResolvedValue();
      fs.appendFile.mockResolvedValue();
      
      await loggingService.log('Test message');
      
      expect(fs.rename).toHaveBeenCalled();
    });
    
    it('should handle log rotation errors gracefully', async () => {
      const logPath = '/logs/app.log';
      const logStats = { size: 10485760 }; // 10MB
      
      fs.stat.mockResolvedValue(logStats);
      fs.rename.mockRejectedValue(new Error('Rotation failed'));
      fs.appendFile.mockResolvedValue();
      
      await loggingService.log('Test message');
      
      expect(fs.appendFile).toHaveBeenCalled();
    });
  });
  
  describe('Log Formatting', () => {
    it('should format log messages with timestamp', async () => {
      const message = 'Test message';
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.log(message);
      
      const logCall = fs.appendFile.mock.calls[0];
      const logContent = logCall[1];
      
      expect(logContent).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });
    
    it('should format log messages with level', async () => {
      const message = 'Test message';
      const level = 'error';
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.log(message, level);
      
      const logCall = fs.appendFile.mock.calls[0];
      const logContent = logCall[1];
      
      expect(logContent).toContain('[ERROR]');
    });
    
    it('should format log messages with context', async () => {
      const message = 'Test message';
      const context = { userId: 123, action: 'login' };
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.log(message, 'info', context);
      
      const logCall = fs.appendFile.mock.calls[0];
      const logContent = logCall[1];
      
      expect(logContent).toContain('userId: 123');
      expect(logContent).toContain('action: login');
    });
  });
  
  describe('Error Handling', () => {
    it('should handle circular reference errors in context', async () => {
      const message = 'Test message';
      const context = {};
      context.self = context; // Circular reference
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.log(message, 'info', context);
      
      expect(fs.appendFile).toHaveBeenCalled();
    });
    
    it('should handle undefined context gracefully', async () => {
      const message = 'Test message';
      
      fs.appendFile.mockResolvedValue();
      
      await loggingService.log(message, 'info', undefined);
      
      expect(fs.appendFile).toHaveBeenCalled();
    });
  });
  
  describe('Performance Tests', () => {
    it('should handle high-volume logging efficiently', async () => {
      const messages = Array.from({ length: 1000 }, (_, i) => `Message ${i + 1}`);
      
      fs.appendFile.mockResolvedValue();
      
      const startTime = Date.now();
      const promises = messages.map(msg => loggingService.log(msg));
      await Promise.all(promises);
      const endTime = Date.now();
      
      expect(fs.appendFile).toHaveBeenCalledTimes(1000);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
    
    it('should handle concurrent logging operations', async () => {
      const concurrentLogs = 100;
      
      fs.appendFile.mockResolvedValue();
      
      const startTime = Date.now();
      const promises = Array.from({ length: concurrentLogs }, (_, i) => 
        loggingService.log(`Concurrent log ${i + 1}`)
      );
      await Promise.all(promises);
      const endTime = Date.now();
      
      expect(fs.appendFile).toHaveBeenCalledTimes(concurrentLogs);
      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});
