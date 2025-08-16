const express = require('express');
const router = express.Router();

console.log('Setting up simple template routes...');

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'Simple templates route working!' });
});

// Simple template list route
router.get('/', (req, res) => {
  res.json({ 
    success: true, 
    templates: [
      { id: '1', name: 'Test Template' }
    ] 
  });
});

console.log('Simple template routes setup complete');

module.exports = router;
