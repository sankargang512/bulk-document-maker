const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController-minimal');
const upload = require('../middleware/upload-simple');
const validation = require('../middleware/validation-simple');

console.log('Setting up document generation routes...');

// Main document generation workflow
router.post('/generate',
  upload.fields([
    { name: 'template', maxCount: 1 },
    { name: 'csv', maxCount: 1 }
  ]),
  validation.validateDocumentGenerate,
  documentController.generateDocuments
);

// Batch document generation (multiple templates)
router.post('/batch-generate',
  upload.fields([
    { name: 'templates', maxCount: 10 },
    { name: 'csv', maxCount: 1 }
  ]),
  validation.validateBatchGenerate,
  documentController.generateBatchDocuments
);

// Batch progress and status tracking
router.get('/batch/:batchId/progress', documentController.getBatchProgress);
router.get('/batch/:batchId/status', documentController.getBatchStatus);
router.get('/batch/:batchId/download', documentController.downloadBatchArchive);

// Batch management
router.delete('/batch/:batchId/cancel', documentController.cancelBatch);
router.post('/batch/:batchId/retry', documentController.retryFailedDocuments);

// Document management
router.get('/', documentController.getAllDocuments);
router.get('/:id', documentController.getDocumentById);
router.delete('/:id', documentController.deleteDocument);

// Document status and retry
router.get('/:id/status', documentController.getDocumentStatus);
router.post('/:id/retry', documentController.retryDocumentGeneration);

// Batch operations
router.post('/batch-status', documentController.getBatchStatus);
router.delete('/batch-delete', documentController.deleteBatchDocuments);

// Make.com webhook integration
router.post('/webhook/make', documentController.handleMakeWebhook);

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'Document generation routes working!' });
});

console.log('Document generation routes setup complete');

module.exports = router;
