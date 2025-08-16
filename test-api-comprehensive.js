#!/usr/bin/env node

/**
 * Comprehensive API Testing for Bulk Document Maker
 * 
 * This script tests all the main API endpoints to ensure they're working correctly.
 * Run with: node test-api-comprehensive.js
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'test-key';

// Test results tracking
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

/**
 * Test runner utilities
 */
class APITester {
  constructor() {
    this.axios = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    });
  }

  /**
   * Run a test
   * @param {string} name - Test name
   * @param {Function} testFn - Test function
   */
  async runTest(name, testFn) {
    testResults.total++;
    console.log(`\n🧪 Running: ${name}`);
    
    try {
      await testFn();
      testResults.passed++;
      console.log(`✅ PASSED: ${name}`);
    } catch (error) {
      testResults.failed++;
      testResults.errors.push({ name, error: error.message });
      console.log(`❌ FAILED: ${name}`);
      console.log(`   Error: ${error.message}`);
    }
  }

  /**
   * Print test summary
   */
  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${testResults.total}`);
    console.log(`Passed: ${testResults.passed} ✅`);
    console.log(`Failed: ${testResults.failed} ❌`);
    console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
    
    if (testResults.errors.length > 0) {
      console.log('\n❌ FAILED TESTS:');
      testResults.errors.forEach(({ name, error }) => {
        console.log(`  - ${name}: ${error}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
  }
}

/**
 * Test data and utilities
 */
class TestData {
  static createSampleCSV() {
    const csvContent = `name,email,company,position,department
John Doe,john.doe@example.com,Acme Corp,Software Engineer,Engineering
Jane Smith,jane.smith@example.com,Tech Solutions,Product Manager,Product
Bob Johnson,bob.johnson@example.com,Innovation Inc,Designer,Design
Alice Brown,alice.brown@example.com,Startup Co,Marketing Manager,Marketing
Charlie Wilson,charlie.wilson@example.com,Enterprise Ltd,Data Analyst,Analytics`;
    
    const tempPath = path.join(__dirname, 'temp', 'test-data.csv');
    const tempDir = path.dirname(tempPath);
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    fs.writeFileSync(tempPath, csvContent);
    return tempPath;
  }

  static createSampleTemplate() {
    const templateContent = `Dear [name],

We are pleased to offer you the position of [position] at [company].

Your role will be in the [department] department, and we believe your skills and experience will be a great addition to our team.

Please confirm your acceptance by replying to this email at [email].

Best regards,
HR Team
[company]`;
    
    const tempPath = path.join(__dirname, 'temp', 'test-template.txt');
    const tempDir = path.dirname(tempPath);
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    fs.writeFileSync(tempPath, templateContent);
    return tempPath;
  }

  static cleanup() {
    const tempDir = path.join(__dirname, 'temp');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

/**
 * Main test suite
 */
async function runAllTests() {
  const tester = new APITester();
  
  console.log('🚀 Starting Comprehensive API Tests for Bulk Document Maker');
  console.log(`📍 Testing against: ${BASE_URL}`);
  console.log('='.repeat(60));

  // Health check tests
  await tester.runTest('Health Check - Basic', async () => {
    const response = await tester.axios.get('/api/health');
    if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
    if (!response.data.success) throw new Error('Health check should return success: true');
    if (!response.data.status) throw new Error('Health check should return status');
    console.log(`   System Status: ${response.data.status}`);
  });

  await tester.runTest('Health Check - Ready', async () => {
    const response = await tester.axios.get('/api/health/ready');
    if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
    if (!response.data.success) throw new Error('Ready check should return success: true');
    if (response.data.status !== 'ready') throw new Error('Ready check should return status: ready');
  });

  await tester.runTest('Health Check - Live', async () => {
    const response = await tester.axios.get('/api/health/live');
    if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
    if (!response.data.success) throw new Error('Live check should return success: true');
    if (response.data.status !== 'alive') throw new Error('Live check should return status: alive');
  });

  await tester.runTest('Health Check - Detailed', async () => {
    const response = await tester.axios.get('/api/health/detailed');
    if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
    if (!response.data.data.checks) throw new Error('Detailed health should return checks');
    console.log(`   Total Checks: ${response.data.data.summary.totalChecks}`);
  });

  // Template analysis tests
  await tester.runTest('Template Analysis - Text Template', async () => {
    const templatePath = TestData.createSampleTemplate();
    
    try {
      const formData = new FormData();
      formData.append('template', fs.createReadStream(templatePath));
      formData.append('useAI', 'false');
      formData.append('extractStructure', 'true');
      
      const response = await tester.axios.post('/api/templates/analyze', formData, {
        headers: formData.getHeaders()
      });
      
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
      if (!response.data.success) throw new Error('Template analysis should return success: true');
      if (!response.data.data.placeholders) throw new Error('Should return placeholders');
      
      const placeholders = response.data.data.placeholders;
      console.log(`   Found ${placeholders.length} placeholders: ${placeholders.map(p => p.name).join(', ')}`);
      
      // Verify expected placeholders
      const expectedPlaceholders = ['name', 'position', 'company', 'department', 'email'];
      const foundPlaceholders = placeholders.map(p => p.name);
      
      for (const expected of expectedPlaceholders) {
        if (!foundPlaceholders.includes(expected)) {
          throw new Error(`Missing expected placeholder: ${expected}`);
        }
      }
      
    } finally {
      TestData.cleanup();
    }
  });

  // Document generation tests
  await tester.runTest('Document Generation - Create Job', async () => {
    const templatePath = TestData.createSampleTemplate();
    const csvPath = TestData.createSampleCSV();
    
    try {
      const formData = new FormData();
      formData.append('template', fs.createReadStream(templatePath));
      formData.append('csv', fs.createReadStream(csvPath));
      formData.append('options[format]', 'pdf');
      formData.append('options[quality]', 'medium');
      formData.append('options[batchSize]', '5');
      formData.append('notification[email]', 'test@example.com');
      
      const response = await tester.axios.post('/api/documents/generate', formData, {
        headers: formData.getHeaders()
      });
      
      if (response.status !== 201) throw new Error(`Expected 201, got ${response.status}`);
      if (!response.data.success) throw new Error('Document generation should return success: true');
      if (!response.data.data.batchId) throw new Error('Should return batch ID');
      if (!response.data.data.statusUrl) throw new Error('Should return status URL');
      if (!response.data.data.downloadUrl) throw new Error('Should return download URL');
      
      console.log(`   Batch ID: ${response.data.data.batchId}`);
      console.log(`   Total Documents: ${response.data.data.totalDocuments}`);
      console.log(`   Estimated Time: ${response.data.data.estimatedTime}`);
      
      // Store batch ID for subsequent tests
      global.testBatchId = response.data.data.batchId;
      
    } finally {
      TestData.cleanup();
    }
  });

  // Wait a bit for job processing
  if (global.testBatchId) {
    await tester.runTest('Document Generation - Check Status', async () => {
      // Wait a moment for job to start processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const response = await tester.axios.get(`/api/documents/${global.testBatchId}/status`);
      
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
      if (!response.data.success) throw new Error('Status check should return success: true');
      if (!response.data.data.status) throw new Error('Should return job status');
      if (response.data.data.totalDocuments !== 5) throw new Error('Should return correct total documents');
      
      console.log(`   Job Status: ${response.data.data.status}`);
      console.log(`   Progress: ${response.data.data.progress}%`);
      console.log(`   Completed: ${response.data.data.completedDocuments}`);
      console.log(`   Failed: ${response.data.data.failedDocuments}`);
    });
  }

  // Template comparison test
  await tester.runTest('Template Comparison', async () => {
    const template1Path = TestData.createSampleTemplate();
    const template2Content = `Hello [name],

Welcome to [company] as a [position].

Your department will be [department].

Best regards,
[company] Team`;
    
    const template2Path = path.join(__dirname, 'temp', 'template2.txt');
    const tempDir = path.dirname(template2Path);
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    fs.writeFileSync(template2Path, template2Content);
    
    try {
      const formData = new FormData();
      formData.append('templates', fs.createReadStream(template1Path));
      formData.append('templates', fs.createReadStream(template2Path));
      
      const response = await tester.axios.post('/api/templates/compare', formData, {
        headers: formData.getHeaders()
      });
      
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
      if (!response.data.success) throw new Error('Template comparison should return success: true');
      if (!response.data.data.comparison) throw new Error('Should return comparison data');
      if (!response.data.data.comparison.similarity) throw new Error('Should return similarity score');
      
      console.log(`   Similarity: ${response.data.data.comparison.similarity}%`);
      console.log(`   Common Placeholders: ${response.data.data.comparison.commonPlaceholders.length}`);
      console.log(`   Unique to Template 1: ${response.data.data.comparison.uniqueToTemplate1.length}`);
      console.log(`   Unique to Template 2: ${response.data.data.comparison.uniqueToTemplate2.length}`);
      
    } finally {
      TestData.cleanup();
    }
  });

  // Batch listing test
  await tester.runTest('Batch Listing', async () => {
    const response = await tester.axios.get('/api/documents');
    
    if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
    if (!response.data.success) throw new Error('Batch listing should return success: true');
    if (!response.data.data.batches) throw new Error('Should return batches array');
    if (!response.data.data.pagination) throw new Error('Should return pagination info');
    
    console.log(`   Total Batches: ${response.data.data.pagination.totalBatches}`);
    console.log(`   Current Page: ${response.data.data.pagination.page}`);
    console.log(`   Batches per Page: ${response.data.data.pagination.limit}`);
    
    if (response.data.data.batches.length > 0) {
      const firstBatch = response.data.data.batches[0];
      console.log(`   First Batch ID: ${firstBatch.batchId}`);
      console.log(`   First Batch Status: ${firstBatch.status}`);
    }
  });

  // API documentation test
  await tester.runTest('API Documentation', async () => {
    const response = await tester.axios.get('/api/docs');
    
    if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
    if (!response.data.endpoints) throw new Error('Should return endpoints documentation');
    if (!response.data.version) throw new Error('Should return API version');
    
    console.log(`   API Version: ${response.data.version}`);
    console.log(`   Documented Endpoints: ${Object.keys(response.data.endpoints).length}`);
  });

  // Root endpoint test
  await tester.runTest('Root Endpoint', async () => {
    const response = await tester.axios.get('/');
    
    if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
    if (!response.data.message) throw new Error('Should return API message');
    if (!response.data.endpoints) throw new Error('Should return endpoints info');
    if (!response.data.status) throw new Error('Should return API status');
    
    console.log(`   API Status: ${response.data.status}`);
    console.log(`   Environment: ${response.data.environment}`);
    console.log(`   Available Endpoints: ${Object.keys(response.data.endpoints).length}`);
  });

  // Error handling tests
  await tester.runTest('Error Handling - Invalid Endpoint', async () => {
    try {
      await tester.axios.get('/api/nonexistent');
      throw new Error('Should have returned 404 error');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        // Expected error
        console.log('   Correctly returned 404 for invalid endpoint');
      } else {
        throw new Error(`Expected 404, got ${error.response?.status || 'unknown'}`);
      }
    }
  });

  await tester.runTest('Error Handling - Invalid Batch ID', async () => {
    try {
      await tester.axios.get('/api/documents/invalid-batch-id/status');
      throw new Error('Should have returned 404 error');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        // Expected error
        console.log('   Correctly returned 404 for invalid batch ID');
      } else {
        throw new Error(`Expected 404, got ${error.response?.status || 'unknown'}`);
      }
    }
  });

  // Cleanup test batch if it exists
  if (global.testBatchId) {
    await tester.runTest('Cleanup - Delete Test Batch', async () => {
      const response = await tester.axios.delete(`/api/documents/${global.testBatchId}`);
      
      if (response.status !== 200) throw new Error(`Expected 200, got ${response.status}`);
      if (!response.data.success) throw new Error('Batch deletion should return success: true');
      
      console.log(`   Successfully deleted test batch: ${global.testBatchId}`);
    });
  }

  // Print final summary
  tester.printSummary();
  
  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

/**
 * Handle errors and cleanup
 */
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  TestData.cleanup();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  TestData.cleanup();
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n🔄 Test interrupted by user');
  TestData.cleanup();
  process.exit(0);
});

// Run tests
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    TestData.cleanup();
    process.exit(1);
  });
}

module.exports = { APITester, TestData };
