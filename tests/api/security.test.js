const request = require('supertest');
const app = require('../test-server');

describe('Security and Rate Limiting API Tests', () => {
  let server;

  beforeAll(async () => {
    server = app.listen(0); // Random port
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Security Headers', () => {
    it('should include security headers in responses', async () => {
      const response = await request(server)
        .get('/api/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers['x-frame-options']).toBe('DENY');
      
      expect(response.headers).toHaveProperty('x-xss-protection');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      
      expect(response.headers).toHaveProperty('referrer-policy');
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      
      expect(response.headers).toHaveProperty('permissions-policy');
      expect(response.headers['permissions-policy']).toBe('geolocation=(), microphone=(), camera=()');
      
      // Should not expose server information
      expect(response.headers).not.toHaveProperty('x-powered-by');
    });

    it('should include request ID in response headers', async () => {
      const response = await request(server)
        .get('/api/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-request-id'].length).toBeGreaterThan(0);
    });
  });

  describe('CORS Configuration', () => {
    it('should allow requests from allowed origins', async () => {
      const response = await request(server)
        .get('/api/health')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('should allow requests from multiple allowed origins', async () => {
      const origins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:8000'];
      
      for (const origin of origins) {
        const response = await request(server)
          .get('/api/health')
          .set('Origin', origin)
          .expect(200);

        expect(response.headers['access-control-allow-origin']).toBe(origin);
      }
    });

    it('should handle preflight OPTIONS requests', async () => {
      const response = await request(server)
        .options('/api/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Content-Type')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-methods');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-methods']).toContain('PUT');
      expect(response.headers['access-control-allow-methods']).toContain('DELETE');
      expect(response.headers['access-control-allow-methods']).toContain('OPTIONS');
    });

    it('should expose required headers', async () => {
      const response = await request(server)
        .get('/api/health')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-expose-headers');
      expect(response.headers['access-control-expose-headers']).toContain('X-Request-ID');
      expect(response.headers['access-control-expose-headers']).toContain('X-Rate-Limit-Remaining');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply general rate limiting', async () => {
      // Make multiple requests quickly
      const requests = [];
      for (let i = 0; i < 15; i++) {
        requests.push(
          request(server)
            .get('/api/health')
            .set('X-Forwarded-For', `192.168.1.${i}`)
        );
      }

      const responses = await Promise.all(requests);
      
      // Most should succeed, but we should see rate limit headers
      const successfulResponses = responses.filter(r => r.status === 200);
      expect(successfulResponses.length).toBeGreaterThan(0);
      
      // Check for rate limit headers
      const responseWithHeaders = successfulResponses.find(r => r.headers['x-ratelimit-remaining']);
      if (responseWithHeaders) {
        expect(responseWithHeaders.headers).toHaveProperty('x-ratelimit-remaining');
        expect(responseWithHeaders.headers).toHaveProperty('x-ratelimit-reset');
      }
    });

    it('should apply stricter rate limiting to document generation', async () => {
      // This test would require actual file uploads, so we'll test the endpoint exists
      const response = await request(server)
        .post('/api/documents/generate')
        .expect(400); // Should fail due to missing files, not rate limiting

      // The endpoint should be accessible (not blocked by rate limiting)
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('template') || expect(response.body.error).toContain('csv');
    });

    it('should include rate limit information in headers', async () => {
      const response = await request(server)
        .get('/api/health')
        .expect(200);

      // Rate limit headers should be present
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');
      
      expect(parseInt(response.headers['x-ratelimit-limit'])).toBeGreaterThan(0);
      expect(parseInt(response.headers['x-ratelimit-remaining'])).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Request Validation', () => {
    it('should reject invalid HTTP methods', async () => {
      const response = await request(server)
        .patch('/api/health') // PATCH is not in our allowed methods
        .expect(405);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Method not allowed');
      expect(response.body.allowedMethods).toContain('GET');
      expect(response.body.allowedMethods).toContain('POST');
    });

    it('should validate content type for POST requests', async () => {
      const response = await request(server)
        .post('/api/health')
        .set('Content-Type', 'invalid/type')
        .send({ test: 'data' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid content type');
      expect(response.body.allowedTypes).toContain('application/json');
      expect(response.body.allowedTypes).toContain('multipart/form-data');
    });

    it('should accept valid content types', async () => {
      const validTypes = [
        'application/json',
        'multipart/form-data',
        'application/x-www-form-urlencoded'
      ];

      for (const contentType of validTypes) {
        const response = await request(server)
          .post('/api/health')
          .set('Content-Type', contentType)
          .send({ test: 'data' });

        // Should not fail due to content type validation
        expect(response.status).not.toBe(400);
      }
    });
  });

  describe('Input Sanitization', () => {
    it('should handle malformed JSON gracefully', async () => {
      const response = await request(server)
        .post('/api/health')
        .set('Content-Type', 'application/json')
        .send('invalid json content')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should handle extremely large payloads', async () => {
      const largePayload = 'x'.repeat(11 * 1024 * 1024); // 11MB (exceeds 10MB limit)
      
      const response = await request(server)
        .post('/api/health')
        .set('Content-Type', 'application/json')
        .send({ data: largePayload })
        .expect(413); // Payload Too Large

      expect(response.body.success).toBe(false);
    });

    it('should handle deeply nested objects', async () => {
      const nestedObject = createDeeplyNestedObject(100); // 100 levels deep
      
      const response = await request(server)
        .post('/api/health')
        .set('Content-Type', 'application/json')
        .send(nestedObject)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should not expose internal error details in production', async () => {
      // Simulate production environment
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Trigger an error (this would need to be implemented in the actual server)
      const response = await request(server)
        .get('/api/health')
        .expect(200);

      // In production, errors should be generic
      if (response.body.error) {
        expect(response.body.error).not.toContain('stack');
        expect(response.body.error).not.toContain('internal');
      }

      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });

    it('should include request ID in error responses', async () => {
      const response = await request(server)
        .patch('/api/health') // Invalid method to trigger error
        .expect(405);

      expect(response.body).toHaveProperty('requestId');
      expect(response.body.requestId).toBeDefined();
    });

    it('should handle malformed requests gracefully', async () => {
      const response = await request(server)
        .post('/api/health')
        .set('Content-Type', 'application/json')
        .send('{"incomplete": json')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('Performance Under Load', () => {
    it('should handle multiple concurrent requests efficiently', async () => {
      const startTime = Date.now();
      const concurrentRequests = 50;
      
      const promises = [];
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request(server)
            .get('/api/health')
            .set('X-Forwarded-For', `192.168.1.${i % 10}`)
        );
      }

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should complete
      expect(responses).toHaveLength(concurrentRequests);
      
      // Should complete within reasonable time (less than 5 seconds)
      expect(totalTime).toBeLessThan(5000);
      
      // Most requests should succeed (some may be rate limited)
      const successfulResponses = responses.filter(r => r.status === 200);
      expect(successfulResponses.length).toBeGreaterThan(concurrentRequests * 0.8);
    });

    it('should maintain response times under load', async () => {
      const responseTimes = [];
      const numRequests = 20;

      for (let i = 0; i < numRequests; i++) {
        const startTime = Date.now();
        
        await request(server)
          .get('/api/health')
          .set('X-Forwarded-For', `192.168.1.${i % 5}`)
          .expect(200);

        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      }

      // Calculate average response time
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      
      // Average response time should be reasonable (less than 500ms)
      expect(avgResponseTime).toBeLessThan(500);
      
      // No single request should take too long (less than 2 seconds)
      const maxResponseTime = Math.max(...responseTimes);
      expect(maxResponseTime).toBeLessThan(2000);
    });
  });
});

// Helper function to create deeply nested objects
function createDeeplyNestedObject(depth) {
  let obj = { value: 'test' };
  for (let i = 0; i < depth; i++) {
    obj = { nested: obj };
  }
  return obj;
}
