const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController-minimal');
const upload = require('../middleware/upload-simple');

console.log('Setting up simplified document generation routes...');

// Main document generation workflow
router.post('/generate',
  upload.fields([
    { name: 'template', maxCount: 1 },
    { name: 'csv', maxCount: 1 }
  ]),
  documentController.generateDocuments
);

// Batch progress and status tracking
router.get('/batch/:batchId/progress', documentController.getBatchProgress);
router.get('/batch/:batchId/status', documentController.getBatchStatus);

// Document management
router.get('/', documentController.getAllDocuments);
router.get('/:id', documentController.getDocumentById);
router.delete('/:id', documentController.deleteDocument);

// Document status and retry
router.get('/:id/status', documentController.getDocumentStatus);
router.post('/:id/retry', documentController.retryDocumentGeneration);

// Batch operations
router.post('/batch-status', documentController.getBatchStatus);
router.delete('/batch-delete', documentController.deleteDocument);

// Make.com webhook integration
router.post('/webhook/make', documentController.handleMakeWebhook);

// Test route
router.get('/test', documentController.testRoute);

console.log('Simplified document generation routes setup complete');

module.exports = router;
