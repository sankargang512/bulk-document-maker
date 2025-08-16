// Global test teardown - runs once after all tests
const fs = require('fs-extra');

module.exports = async () => {
  console.log('🧹 Global test teardown starting...');
  
  try {
    // Clean up test directories
    const testDirs = [
      './tests/uploads',
      './tests/generated',
      './tests/temp',
      './tests/compressed',
      './tests/logs',
      './tests/fixtures'
    ];
    
    for (const dir of testDirs) {
      if (await fs.pathExists(dir)) {
        await fs.remove(dir);
      }
    }
    
    // Clean up coverage directory if it exists
    if (await fs.pathExists('./coverage')) {
      await fs.remove('./coverage');
    }
    
    console.log('✅ Global test teardown complete');
  } catch (error) {
    console.error('❌ Global test teardown failed:', error.message);
  }
};
