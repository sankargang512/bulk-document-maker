const request = require('supertest');
const fs = require('fs-extra');
const path = require('path');
const app = require('../../server-simple');

describe('Document Generation Integration Tests', () => {
  let server;
  let testFiles;

  beforeAll(async () => {
    // Create test files
    testFiles = await createTestFiles();
    
    // Start server
    server = app.listen(0); // Random port
  });

  afterAll(async () => {
    // Clean up test files
    await cleanupTestFiles(testFiles);
    
    // Close server
    if (server) {
      server.close();
    }
  });

  beforeEach(() => {
    // Clear any previous test state
    jest.clearAllMocks();
  });

  describe('Complete Document Generation Workflow', () => {
    it('should generate documents from template and CSV data', async () => {
      const response = await request(server)
        .post('/api/documents/generate')
        .attach('template', testFiles.template)
        .attach('csv', testFiles.csv)
        .field('options', JSON.stringify({
          format: 'pdf',
          quality: 'high',
          batchSize: 5,
          includeMetadata: true
        }))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('batchId');
      expect(response.body).toHaveProperty('statusUrl');
      expect(response.body).toHaveProperty('downloadUrl');
      expect(response.body).toHaveProperty('totalDocuments');
      expect(response.body.totalDocuments).toBeGreaterThan(0);
    });

    it('should handle large CSV files efficiently', async () => {
      const response = await request(server)
        .post('/api/documents/generate')
        .attach('template', testFiles.template)
        .attach('csv', testFiles.largeCsv)
        .field('options', JSON.stringify({
          format: 'docx',
          quality: 'medium',
          batchSize: 100
        }))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.totalDocuments).toBeGreaterThan(100);
    });

    it('should validate file types and reject invalid files', async () => {
      const response = await request(server)
        .post('/api/documents/generate')
        .attach('template', testFiles.invalidFile)
        .attach('csv', testFiles.csv)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('File type');
    });

    it('should handle missing template file', async () => {
      const response = await request(server)
        .post('/api/documents/generate')
        .attach('csv', testFiles.csv)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('template');
    });

    it('should handle missing CSV file', async () => {
      const response = await request(server)
        .post('/api/documents/generate')
        .attach('template', testFiles.template)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('csv');
    });
  });

  describe('Batch Processing and Progress Tracking', () => {
    let batchId;

    beforeEach(async () => {
      // Create a batch first
      const response = await request(server)
        .post('/api/documents/generate')
        .attach('template', testFiles.template)
        .attach('csv', testFiles.csv)
        .field('options', JSON.stringify({ batchSize: 3 }));

      batchId = response.body.batchId;
    });

    it('should track batch progress', async () => {
      const response = await request(server)
        .get(`/api/documents/batch/${batchId}/progress`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('progress');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('totalDocuments');
      expect(response.body).toHaveProperty('completedDocuments');
      expect(response.body).toHaveProperty('failedDocuments');
    });

    it('should provide batch status', async () => {
      const response = await request(server)
        .get(`/api/documents/batch/${batchId}/status`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('batch');
    });

    it('should handle non-existent batch ID', async () => {
      const response = await request(server)
        .get('/api/documents/batch/nonexistent/progress')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('Document Management', () => {
    it('should list all documents', async () => {
      const response = await request(server)
        .get('/api/documents')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('documents');
      expect(Array.isArray(response.body.documents)).toBe(true);
    });

    it('should get document by ID', async () => {
      // First create a document
      const createResponse = await request(server)
        .post('/api/documents/generate')
        .attach('template', testFiles.template)
        .attach('csv', testFiles.csv)
        .field('options', JSON.stringify({ batchSize: 1 }));

      const batchId = createResponse.body.batchId;
      
      // Get document status
      const response = await request(server)
        .get(`/api/documents/${batchId}/status`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('status');
    });

    it('should delete document', async () => {
      // First create a document
      const createResponse = await request(server)
        .post('/api/documents/generate')
        .attach('template', testFiles.template)
        .attach('csv', testFiles.csv)
        .field('options', JSON.stringify({ batchSize: 1 }));

      const batchId = createResponse.body.batchId;
      
      // Delete document
      const response = await request(server)
        .delete(`/api/documents/${batchId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed CSV data', async () => {
      const response = await request(server)
        .post('/api/documents/generate')
        .attach('template', testFiles.template)
        .attach('csv', testFiles.malformedCsv)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('CSV');
    });

    it('should handle empty CSV file', async () => {
      const response = await request(server)
        .post('/api/documents/generate')
        .attach('template', testFiles.template)
        .attach('csv', testFiles.emptyCsv)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('empty');
    });

    it('should handle template with no placeholders', async () => {
      const response = await request(server)
        .post('/api/documents/generate')
        .attach('template', testFiles.noPlaceholderTemplate)
        .attach('csv', testFiles.csv)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('placeholders');
    });

    it('should handle very large template files', async () => {
      const response = await request(server)
        .post('/api/documents/generate')
        .attach('template', testFiles.largeTemplate)
        .attach('csv', testFiles.csv)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('size');
    });
  });

  describe('Performance and Scalability', () => {
    it('should process multiple concurrent requests', async () => {
      const concurrentRequests = 5;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const promise = request(server)
          .post('/api/documents/generate')
          .attach('template', testFiles.template)
          .attach('csv', testFiles.csv)
          .field('options', JSON.stringify({ batchSize: 2 }));

        promises.push(promise);
      }

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body).toHaveProperty('batchId');
      });
    });

    it('should handle memory efficiently with large datasets', async () => {
      const startMemory = process.memoryUsage().heapUsed;
      
      const response = await request(server)
        .post('/api/documents/generate')
        .attach('template', testFiles.template)
        .attach('csv', testFiles.largeCsv)
        .field('options', JSON.stringify({ batchSize: 500 }));

      const endMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = endMemory - startMemory;
      
      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
      expect(response.body.success).toBe(true);
    });
  });
});

// Helper functions
async function createTestFiles() {
  const testDir = path.join(__dirname, '../../tests/fixtures');
  await fs.ensureDir(testDir);

  const files = {};

  // Create sample template
  const templateContent = `
    Dear {{name}},
    
    Thank you for your interest in the {{role}} position at {{company}}.
    
    We will contact you at {{email}} to schedule an interview.
    
    Best regards,
    HR Team
  `;
  files.template = path.join(testDir, 'test-template.txt');
  await fs.writeFile(files.template, templateContent);

  // Create sample CSV
  const csvContent = [
    'name,email,company,role',
    'John Doe,john@example.com,Tech Corp,Developer',
    'Jane Smith,jane@example.com,Tech Corp,Manager',
    'Bob Johnson,bob@example.com,Startup Inc,Designer'
  ].join('\n');
  files.csv = path.join(testDir, 'test-data.csv');
  await fs.writeFile(files.csv, csvContent);

  // Create large CSV for performance testing
  const largeCsvRows = ['name,email,company,role,department,salary'];
  for (let i = 1; i <= 1000; i++) {
    largeCsvRows.push(`User ${i},user${i}@example.com,Company ${i % 10},Role ${i % 5},Dept ${i % 3},${50000 + (i * 100)}`);
  }
  files.largeCsv = path.join(testDir, 'large-data.csv');
  await fs.writeFile(files.largeCsv, largeCsvRows.join('\n'));

  // Create invalid file
  files.invalidFile = path.join(testDir, 'invalid.exe');
  await fs.writeFile(files.invalidFile, 'invalid content');

  // Create malformed CSV
  const malformedCsv = 'name,email,company\nJohn,john@test.com\nJane,jane@test.com,Test Corp,Extra Column';
  files.malformedCsv = path.join(testDir, 'malformed.csv');
  await fs.writeFile(files.malformedCsv, malformedCsv);

  // Create empty CSV
  files.emptyCsv = path.join(testDir, 'empty.csv');
  await fs.writeFile(files.emptyCsv, '');

  // Create template with no placeholders
  files.noPlaceholderTemplate = path.join(testDir, 'no-placeholder.txt');
  await fs.writeFile(files.noPlaceholderTemplate, 'This template has no placeholders.');

  // Create large template
  const largeTemplateContent = 'Large template content. '.repeat(100000); // ~2.7MB
  files.largeTemplate = path.join(testDir, 'large-template.txt');
  await fs.writeFile(files.largeTemplate, largeTemplateContent);

  return files;
}

async function cleanupTestFiles(files) {
  for (const filePath of Object.values(files)) {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
      }
    } catch (error) {
      console.warn(`Failed to clean up test file ${filePath}:`, error.message);
    }
  }
}
