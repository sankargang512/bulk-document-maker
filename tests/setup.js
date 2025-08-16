// Test setup and configuration
const fs = require('fs-extra');
const path = require('path');

// Global test timeout
jest.setTimeout(30000);

// Global beforeAll setup
beforeAll(async () => {
  console.log('🧪 Setting up test environment...');
  
  // Create test directories
  const testDirs = [
    './tests/uploads',
    './tests/generated',
    './tests/temp',
    './tests/compressed',
    './tests/logs'
  ];
  
  for (const dir of testDirs) {
    await fs.ensureDir(dir);
  }
  
  console.log('✅ Test directories created');
});

// Global afterAll cleanup
afterAll(async () => {
  console.log('🧹 Cleaning up test environment...');
  
  // Clean up test directories
  const testDirs = [
    './tests/uploads',
    './tests/generated',
    './tests/temp',
    './tests/compressed',
    './tests/logs'
  ];
  
  for (const dir of testDirs) {
    await fs.remove(dir);
  }
  
  console.log('✅ Test directories cleaned up');
});

// Global beforeEach setup
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
  
  // Reset console mocks
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

// Global afterEach cleanup
afterEach(() => {
  // Restore console mocks
  jest.restoreAllMocks();
});

// Global test utilities
global.testUtils = {
  // Create test file
  createTestFile: async (content, filename, directory = './tests/temp') => {
    const filePath = path.join(directory, filename);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content);
    return filePath;
  },
  
  // Create test CSV
  createTestCSV: async (data, filename = 'test.csv') => {
    const csvContent = data.map(row => row.join(',')).join('\n');
    return await global.testUtils.createTestFile(csvContent, filename, './tests/uploads');
  },
  
  // Create test template
  createTestTemplate: async (content, filename = 'test-template.docx') => {
    return await global.testUtils.createTestFile(content, filename, './tests/uploads');
  },
  
  // Clean up test file
  cleanupTestFile: async (filePath) => {
    try {
      await fs.remove(filePath);
    } catch (error) {
      // Ignore cleanup errors
    }
  },
  
  // Wait for async operations
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Mock external API responses
  mockExternalAPI: (service, response) => {
    if (service === 'openai') {
      jest.doMock('openai', () => ({
        OpenAI: jest.fn().mockImplementation(() => ({
          chat: {
            completions: {
              create: jest.fn().mockResolvedValue({
                choices: [{ message: { content: response } }]
              })
            }
          }
        }))
      }));
    }
  },
  
  // Generate test data
  generateTestData: (count = 10) => {
    const data = [];
    for (let i = 0; i < count; i++) {
      data.push({
        id: i + 1,
        name: `Test User ${i + 1}`,
        email: `user${i + 1}@test.com`,
        company: `Test Company ${i + 1}`,
        role: `Role ${i + 1}`,
        department: `Dept ${i + 1}`,
        salary: 50000 + (i * 1000),
        startDate: new Date(2023, 0, 1 + i).toISOString().split('T')[0]
      });
    }
    return data;
  },
  
  // Validate API response
  validateAPIResponse: (response, expectedStatus = 200) => {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toHaveProperty('success');
    
    if (expectedStatus === 200) {
      expect(response.body.success).toBe(true);
    } else {
      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('error');
    }
  },
  
  // Mock file upload
  mockFileUpload: (fieldName, filename, content, mimeType = 'text/plain') => {
    return {
      fieldname: fieldName,
      originalname: filename,
      encoding: '7bit',
      mimetype: mimeType,
      buffer: Buffer.from(content),
      size: Buffer.byteLength(content)
    };
  }
};

// Suppress console output during tests unless explicitly needed
if (process.env.NODE_ENV === 'test') {
  global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  };
}

console.log('🧪 Test setup complete');
