// Global test setup - runs once before all tests
const fs = require('fs-extra');
const path = require('path');

module.exports = async () => {
  console.log('🌍 Global test setup starting...');
  
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.PORT = 0;
  process.env.DB_PATH = ':memory:';
  
  // Create test directories
  const testDirs = [
    './tests',
    './tests/uploads',
    './tests/generated',
    './tests/temp',
    './tests/compressed',
    './tests/logs',
    './tests/fixtures'
  ];
  
  for (const dir of testDirs) {
    await fs.ensureDir(dir);
  }
  
  // Create test fixtures
  await createTestFixtures();
  
  console.log('✅ Global test setup complete');
};

async function createTestFixtures() {
  const fixturesDir = './tests/fixtures';
  
  // Create sample CSV data
  const sampleCSV = [
    ['name', 'email', 'company', 'role'],
    ['John Doe', 'john@example.com', 'Tech Corp', 'Developer'],
    ['Jane Smith', 'jane@example.com', 'Tech Corp', 'Manager'],
    ['Bob Johnson', 'bob@example.com', 'Startup Inc', 'Designer']
  ];
  
  const csvContent = sampleCSV.map(row => row.join(',')).join('\n');
  await fs.writeFile(path.join(fixturesDir, 'sample.csv'), csvContent);
  
  // Create sample template content
  const sampleTemplate = `
    Dear {{name}},
    
    Thank you for your interest in the {{role}} position at {{company}}.
    
    We will contact you at {{email}} to schedule an interview.
    
    Best regards,
    HR Team
  `;
  
  await fs.writeFile(path.join(fixturesDir, 'sample-template.txt'), sampleTemplate);
  
  // Create large CSV for performance testing
  const largeCSV = [['id', 'name', 'email', 'company', 'role', 'department', 'salary', 'startDate']];
  for (let i = 1; i <= 1000; i++) {
    largeCSV.push([
      i.toString(),
      `User ${i}`,
      `user${i}@example.com`,
      `Company ${i % 10}`,
      `Role ${i % 5}`,
      `Dept ${i % 3}`,
      (50000 + (i * 100)).toString(),
      new Date(2023, 0, 1 + (i % 365)).toISOString().split('T')[0]
    ]);
  }
  
  const largeCSVContent = largeCSV.map(row => row.join(',')).join('\n');
  await fs.writeFile(path.join(fixturesDir, 'large-sample.csv'), largeCSVContent);
  
  console.log('📁 Test fixtures created');
}
