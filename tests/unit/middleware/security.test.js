const securityMiddleware = require('../../../middleware/security');

// Mock logging service
jest.mock('../../../services/loggingService', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('Security Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      ip: '127.0.0.1',
      method: 'GET',
      path: '/test',
      url: '/test',
      headers: {
        'user-agent': 'test-agent',
        'content-type': 'application/json',
        'content-length': '100'
      },
      body: {},
      get: jest.fn((header) => mockReq.headers[header.toLowerCase()])
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      removeHeader: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({}),
      get: jest.fn((header) => {
        const headers = {
          'content-length': '100',
          'content-type': 'application/json'
        };
        return headers[header.toLowerCase()];
      })
    };

    mockNext = jest.fn();
  });

  describe('createRateLimiters', () => {
    it('should create general rate limiter', () => {
      const limiters = securityMiddleware.createRateLimiters();
      expect(limiters.general).toBeDefined();
      expect(typeof limiters.general).toBe('function');
    });

    it('should create generation rate limiter', () => {
      const limiters = securityMiddleware.createRateLimiters();
      expect(limiters.generation).toBeDefined();
      expect(typeof limiters.generation).toBe('function');
    });

    it('should create upload rate limiter', () => {
      const limiters = securityMiddleware.createRateLimiters();
      expect(limiters.upload).toBeDefined();
      expect(typeof limiters.upload).toBe('function');
    });
  });

  describe('createSpeedLimiters', () => {
    it('should create general speed limiter', () => {
      const limiters = securityMiddleware.createSpeedLimiters();
      expect(limiters.general).toBeDefined();
      expect(typeof limiters.general).toBe('function');
    });

    it('should create generation speed limiter', () => {
      const limiters = securityMiddleware.createSpeedLimiters();
      expect(limiters.generation).toBeDefined();
      expect(typeof limiters.generation).toBe('function');
    });
  });

  describe('createCorsConfig', () => {
    it('should create CORS configuration with default origins', () => {
      const corsConfig = securityMiddleware.createCorsConfig();
      expect(corsConfig).toBeDefined();
      expect(typeof corsConfig).toBe('function');
    });

    it('should handle environment variable origins', () => {
      process.env.ALLOWED_ORIGINS = 'https://example.com,https://test.com';
      const corsConfig = securityMiddleware.createCorsConfig();
      expect(corsConfig).toBeDefined();
      
      // Reset environment
      delete process.env.ALLOWED_ORIGINS;
    });
  });

  describe('createHelmetConfig', () => {
    it('should create Helmet configuration', () => {
      const helmetConfig = securityMiddleware.createHelmetConfig();
      expect(helmetConfig).toBeDefined();
      expect(typeof helmetConfig).toBe('function');
    });
  });

  describe('createSizeLimits', () => {
    it('should return size limit configuration', () => {
      const sizeLimits = securityMiddleware.createSizeLimits();
      expect(sizeLimits).toHaveProperty('json');
      expect(sizeLimits).toHaveProperty('urlencoded');
      expect(sizeLimits).toHaveProperty('raw');
      expect(sizeLimits).toHaveProperty('fileUpload');
    });

    it('should have correct default limits', () => {
      const sizeLimits = securityMiddleware.createSizeLimits();
      expect(sizeLimits.json.limit).toBe('10mb');
      expect(sizeLimits.urlencoded.limit).toBe('10mb');
      expect(sizeLimits.raw.limit).toBe('50mb');
      expect(sizeLimits.fileUpload.maxFileSize).toBe(50 * 1024 * 1024);
    });
  });

  describe('requestIdMiddleware', () => {
    it('should generate request ID if not present', () => {
      securityMiddleware.requestIdMiddleware(mockReq, mockRes, mockNext);
      
      expect(mockReq.requestId).toBeDefined();
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-ID', mockReq.requestId);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use existing request ID if present', () => {
      const existingId = 'existing-request-id';
      mockReq.headers['x-request-id'] = existingId;
      
      securityMiddleware.requestIdMiddleware(mockReq, mockRes, mockNext);
      
      expect(mockReq.requestId).toBe(existingId);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('securityHeadersMiddleware', () => {
    it('should set security headers', () => {
      securityMiddleware.securityHeadersMiddleware(mockReq, mockRes, mockNext);
      
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(mockRes.removeHeader).toHaveBeenCalledWith('X-Powered-By');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requestLoggingMiddleware', () => {
    it('should log request and response', () => {
      mockReq.requestId = 'test-request-id';
      
      // Mock the response end method properly
      const originalEnd = jest.fn();
      mockRes.end = originalEnd;
      
      securityMiddleware.requestLoggingMiddleware(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      
      // Test that the end method was overridden
      expect(mockRes.end).not.toBe(originalEnd);
    });
  });

  describe('errorHandlingMiddleware', () => {
    it('should handle errors and return appropriate response', () => {
      const error = new Error('Test error');
      error.status = 400;
      
      securityMiddleware.errorHandlingMiddleware(error, mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Test error'
        })
      );
    });

    it('should handle errors without status', () => {
      const error = new Error('Test error');
      
      securityMiddleware.errorHandlingMiddleware(error, mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('ipAddressMiddleware', () => {
    it('should extract real IP address from headers', () => {
      mockReq.headers['x-forwarded-for'] = '192.168.1.1, 10.0.0.1';
      
      securityMiddleware.ipAddressMiddleware(mockReq, mockRes, mockNext);
      
      expect(mockReq.realIP).toBe('192.168.1.1');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should fallback to connection remote address', () => {
      mockReq.connection = { remoteAddress: '192.168.1.2' };
      
      securityMiddleware.ipAddressMiddleware(mockReq, mockRes, mockNext);
      
      expect(mockReq.realIP).toBe('192.168.1.2');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requestValidationMiddleware', () => {
    it('should allow valid HTTP methods', () => {
      const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
      
      for (const method of validMethods) {
        mockReq.method = method;
        securityMiddleware.requestValidationMiddleware(mockReq, mockRes, mockNext);
        expect(mockNext).toHaveBeenCalled();
        mockNext.mockClear();
      }
    });

    it('should reject invalid HTTP methods', () => {
      mockReq.method = 'INVALID';
      
      securityMiddleware.requestValidationMiddleware(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(405);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Method not allowed'
        })
      );
    });

    it('should validate content type for POST requests', () => {
      mockReq.method = 'POST';
      mockReq.headers['content-type'] = 'invalid/type';
      
      securityMiddleware.requestValidationMiddleware(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid content type'
        })
      );
    });

    it('should allow valid content types for POST requests', () => {
      mockReq.method = 'POST';
      const validTypes = [
        'application/json',
        'multipart/form-data',
        'application/x-www-form-urlencoded'
      ];
      
      for (const type of validTypes) {
        mockReq.headers['content-type'] = type;
        securityMiddleware.requestValidationMiddleware(mockReq, mockRes, mockNext);
        expect(mockNext).toHaveBeenCalled();
        mockNext.mockClear();
      }
    });
  });
});
