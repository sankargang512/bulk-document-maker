const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');
const upload = require('../middleware/upload');
const validation = require('../middleware/validation-simple');

// Template analysis (without ID - for new templates)
router.post('/analyze',
  upload.single('template'),
  templateController.analyzeNewTemplate
);

// Template comparison
router.post('/compare',
  upload.fields([
    { name: 'template1', maxCount: 1 },
    { name: 'template2', maxCount: 1 }
  ]),
  templateController.compareTemplates
);

// Batch template analysis
router.post('/batch-analyze',
  upload.array('templates', 10), // Allow up to 10 templates
  templateController.batchAnalyzeTemplates
);

// Template management routes
router.post('/upload',
  upload.single('template'),
  validation.validateTemplateUpload,
  templateController.uploadTemplate
);

router.get('/', templateController.getAllTemplates);
router.get('/:id', templateController.getTemplateById);
router.put('/:id', templateController.updateTemplate);
router.delete('/:id', templateController.deleteTemplate);

// Template analysis and preview
router.post('/:id/analyze', templateController.analyzeTemplate);
router.get('/:id/preview', templateController.previewTemplate);
router.get('/:id/fields', templateController.getTemplateFields);

// Template categories and search
router.get('/category/:category', templateController.getTemplatesByCategory);
router.get('/search/:query', templateController.searchTemplates);

// Template validation
router.post('/:id/validate', templateController.validateTemplate);
router.post('/:id/test', templateController.testTemplate);

// Cache management
router.get('/cache/stats', templateController.getCacheStats);
router.delete('/cache/clear', templateController.clearCache);

// Template insights and analytics
router.get('/insights/summary', templateController.getTemplatesInsights);
router.get('/insights/patterns', templateController.getTemplatePatterns);
router.get('/insights/recommendations', templateController.getTemplateRecommendations);

module.exports = router;
