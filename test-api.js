#!/usr/bin/env node

const axios = require('axios');

const BASE_URL = 'http://localhost:3001/api';

async function testAPI() {
  console.log('🧪 Testing Bulk Document Maker Backend API...');
  console.log('==========================================');
  
  try {
    // Test health endpoint
    console.log('\n1. Testing health endpoint...');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Health check passed:', healthResponse.data.status);
    
    // Test detailed health endpoint
    console.log('\n2. Testing detailed health endpoint...');
    const detailedHealthResponse = await axios.get(`${BASE_URL}/health/detailed`);
    console.log('✅ Detailed health check passed:', detailedHealthResponse.data.status);
    
    // Test templates endpoint (should return empty array initially)
    console.log('\n3. Testing templates endpoint...');
    const templatesResponse = await axios.get(`${BASE_URL}/templates`);
    console.log('✅ Templates endpoint working:', templatesResponse.data.length, 'templates found');
    
    // Test documents endpoint (should return empty array initially)
    console.log('\n4. Testing documents endpoint...');
    const documentsResponse = await axios.get(`${BASE_URL}/documents`);
    console.log('✅ Documents endpoint working:', documentsResponse.data.length, 'documents found');
    
    // Test root endpoint
    console.log('\n5. Testing root endpoint...');
    const rootResponse = await axios.get('http://localhost:3001/');
    console.log('✅ Root endpoint working:', rootResponse.data.message);
    
    console.log('\n🎉 All API tests passed successfully!');
    console.log('==========================================');
    console.log('The backend is ready to accept requests.');
    console.log('\nNext steps:');
    console.log('1. Upload a template using POST /api/templates/upload');
    console.log('2. Generate documents using POST /api/documents/generate');
    console.log('3. Check the README.md for full API documentation');
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Connection refused. Make sure the server is running on port 3001.');
      console.log('\nTo start the server:');
      console.log('  npm run dev    # Development mode');
      console.log('  npm start      # Production mode');
    } else if (error.response) {
      console.error('❌ API test failed:', error.response.status, error.response.statusText);
      console.error('Response:', error.response.data);
    } else {
      console.error('❌ Test failed:', error.message);
    }
    process.exit(1);
  }
}

// Check if axios is available
try {
  require.resolve('axios');
} catch (e) {
  console.error('❌ Axios is not installed. Please install it first:');
  console.log('  npm install axios');
  process.exit(1);
}

// Run the test
testAPI();
