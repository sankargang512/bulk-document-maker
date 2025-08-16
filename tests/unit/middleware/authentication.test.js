const authentication = require('../../../middleware/authentication');

// Mock logging service
jest.mock('../../../services/loggingService', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('Authentication Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      ip: '127.0.0.1',
      realIP: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent',
        'x-api-key': 'test-api-key-12345678901234567890123456789012',
        'authorization': 'Bearer test-jwt-token',
        'x-request-id': 'test-request-id'
      },
      requestId: 'test-request-id'
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    mockNext = jest.fn();
  });

  describe('validateApiKey', () => {
    it('should accept valid API key', () => {
      authentication.validateApiKey(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject request without API key', () => {
      delete mockReq.headers['x-api-key'];
      
      authentication.validateApiKey(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'API key is required',
          code: 'MISSING_API_KEY'
        })
      );
    });

    it('should reject API key that is too short', () => {
      mockReq.headers['x-api-key'] = 'short-key';
      
      authentication.validateApiKey(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid API key format',
          code: 'INVALID_API_KEY_FORMAT'
        })
      );
    });

    it('should reject invalid API key', () => {
      mockReq.headers['x-api-key'] = 'invalid-api-key-12345678901234567890123456789012';
      
      authentication.validateApiKey(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid API key',
          code: 'INVALID_API_KEY'
        })
      );
    });

    it('should handle environment variable API keys', () => {
      process.env.VALID_API_KEYS = 'env-key-1,env-key-2';
      mockReq.headers['x-api-key'] = 'env-key-1';
      
      authentication.validateApiKey(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      
      // Reset environment
      delete process.env.VALID_API_KEYS;
    });
  });

  describe('validateJWT', () => {
    it('should accept valid JWT token', () => {
      // Mock JWT verification
      const originalJwt = require('jsonwebtoken');
      jest.doMock('jsonwebtoken', () => ({
        verify: jest.fn().mockReturnValue({
          userId: 'test-user-id',
          role: 'user'
        })
      }));
      
      authentication.validateJWT(mockReq, mockRes, mockNext);
      
      expect(mockReq.user).toBeDefined();
      expect(mockReq.userId).toBe('test-user-id');
      expect(mockNext).toHaveBeenCalled();
      
      // Restore original module
      jest.dontMock('jsonwebtoken');
    });

    it('should reject request without Bearer token', () => {
      delete mockReq.headers.authorization;
      
      authentication.validateJWT(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Bearer token is required',
          code: 'MISSING_BEARER_TOKEN'
        })
      );
    });

    it('should reject request with invalid Bearer format', () => {
      mockReq.headers.authorization = 'Invalid test-token';
      
      authentication.validateJWT(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Bearer token is required',
          code: 'MISSING_BEARER_TOKEN'
        })
      );
    });

    it('should handle expired token', () => {
      // Mock JWT verification to throw expired error
      const originalJwt = require('jsonwebtoken');
      jest.doMock('jsonwebtoken', () => ({
        verify: jest.fn().mockImplementation(() => {
          const error = new Error('jwt expired');
          error.name = 'TokenExpiredError';
          throw error;
        })
      }));
      
      authentication.validateJWT(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Token has expired',
          code: 'TOKEN_EXPIRED'
        })
      );
      
      // Restore original module
      jest.dontMock('jsonwebtoken');
    });

    it('should handle invalid token', () => {
      // Mock JWT verification to throw invalid error
      const originalJwt = require('jsonwebtoken');
      jest.doMock('jsonwebtoken', () => ({
        verify: jest.fn().mockImplementation(() => {
          const error = new Error('invalid token');
          error.name = 'JsonWebTokenError';
          throw error;
        })
      }));
      
      authentication.validateJWT(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid token',
          code: 'INVALID_TOKEN'
        })
      );
      
      // Restore original module
      jest.dontMock('jsonwebtoken');
    });
  });

  describe('optionalJWT', () => {
    it('should continue without token', () => {
      delete mockReq.headers.authorization;
      
      authentication.optionalJWT(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeUndefined();
      expect(mockReq.userId).toBeUndefined();
    });

    it('should set user info if valid token provided', () => {
      // Mock JWT verification
      const originalJwt = require('jsonwebtoken');
      jest.doMock('jsonwebtoken', () => ({
        verify: jest.fn().mockReturnValue({
          userId: 'test-user-id',
          role: 'user'
        })
      }));
      
      authentication.optionalJWT(mockReq, mockRes, mockNext);
      
      expect(mockReq.user).toBeDefined();
      expect(mockReq.userId).toBe('test-user-id');
      expect(mockNext).toHaveBeenCalled();
      
      // Restore original module
      jest.dontMock('jsonwebtoken');
    });

    it('should continue even if token validation fails', () => {
      // Mock JWT verification to throw error
      const originalJwt = require('jsonwebtoken');
      jest.doMock('jsonwebtoken', () => ({
        verify: jest.fn().mockImplementation(() => {
          throw new Error('invalid token');
        })
      }));
      
      authentication.optionalJWT(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeUndefined();
      expect(mockReq.userId).toBeUndefined();
      
      // Restore original module
      jest.dontMock('jsonwebtoken');
    });
  });

  describe('requireRole', () => {
    it('should allow access for user with required role', () => {
      mockReq.user = { userId: 'test-user', role: 'admin' };
      mockReq.userId = 'test-user';
      
      const middleware = authentication.requireRole(['admin', 'user']);
      middleware(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access for user without required role', () => {
      mockReq.user = { userId: 'test-user', role: 'user' };
      mockReq.userId = 'test-user';
      
      const middleware = authentication.requireRole(['admin']);
      middleware(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS'
        })
      );
    });

    it('should require authentication', () => {
      const middleware = authentication.requireRole(['admin']);
      middleware(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED'
        })
      );
    });
  });

  describe('validateRequestSignature', () => {
    it('should reject request without signature', () => {
      authentication.validateRequestSignature(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Request signature and timestamp are required for this operation',
          code: 'MISSING_SIGNATURE'
        })
      );
    });

    it('should reject request without timestamp', () => {
      mockReq.headers['x-request-signature'] = 'test-signature';
      
      authentication.validateRequestSignature(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Request signature and timestamp are required for this operation',
          code: 'MISSING_SIGNATURE'
        })
      );
    });

    it('should reject request with expired timestamp', () => {
      const oldTimestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago
      mockReq.headers['x-request-signature'] = 'test-signature';
      mockReq.headers['x-request-timestamp'] = oldTimestamp.toString();
      
      authentication.validateRequestSignature(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Request timestamp is too old',
          code: 'TIMESTAMP_EXPIRED'
        })
      );
    });

    it('should reject request with invalid signature', () => {
      const timestamp = Date.now().toString();
      mockReq.headers['x-request-signature'] = 'invalid-signature';
      mockReq.headers['x-request-timestamp'] = timestamp;
      mockReq.method = 'POST';
      mockReq.path = '/test';
      mockReq.body = { test: 'data' };
      
      authentication.validateRequestSignature(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid request signature',
          code: 'INVALID_SIGNATURE'
        })
      );
    });

    it('should accept request with valid signature', () => {
      const timestamp = Date.now().toString();
      mockReq.method = 'POST';
      mockReq.path = '/test';
      mockReq.body = { test: 'data' };
      
      // Calculate expected signature
      const secret = process.env.REQUEST_SIGNING_SECRET || 'your-signing-secret';
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${mockReq.method}${mockReq.path}${timestamp}${JSON.stringify(mockReq.body)}`)
        .digest('hex');
      
      mockReq.headers['x-request-signature'] = expectedSignature;
      mockReq.headers['x-request-timestamp'] = timestamp;
      
      authentication.validateRequestSignature(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('createUserRateLimiter', () => {
    it('should skip rate limiting for unauthenticated users', () => {
      const middleware = authentication.createUserRateLimiter(10, 60000);
      middleware(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should apply rate limiting for authenticated users', () => {
      mockReq.userId = 'test-user';
      
      const middleware = authentication.createUserRateLimiter(2, 60000);
      
      // First two requests should pass
      middleware(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
      mockNext.mockClear();
      
      middleware(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
      mockNext.mockClear();
      
      // Third request should be blocked
      middleware(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Rate limit exceeded for this user',
          code: 'USER_RATE_LIMIT_EXCEEDED'
        })
      );
    });
  });
});
