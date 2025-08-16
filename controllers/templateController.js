const TemplateAnalyzerService = require('../services/templateAnalyzer');
const templateAnalyzer = new TemplateAnalyzerService();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs-extra');
const responseUtils = require('../utils/responseUtils');

class TemplateController {
  // Analyze new template (without ID)
  async analyzeNewTemplate(req, res) {
    try {
      if (!req.file) {
        return responseUtils.error(res, 'Template file is required', 400);
      }

      const { customFields, outputFormat } = req.body;
      
      // Analyze template to extract fields
      const analysis = await templateAnalyzer.analyzeTemplate(
        req.file.path, 
        path.extname(req.file.originalname).substring(1)
      );

      // Generate sample data for testing
      const sampleData = templateAnalyzer.generateSampleData(analysis.placeholders, 3);
      
      // Estimate processing time for 100 documents
      const processingEstimate = templateAnalyzer.estimateProcessingTime(analysis, 100);

      // Generate field mapping suggestions
      const fieldMapping = this.generateFieldMappingSuggestions(analysis.placeholders);

      res.status(200).json({
        success: true,
        analysis: {
          filename: req.file.originalname,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          wordCount: analysis.wordCount,
          paragraphCount: analysis.paragraphCount,
          complexity: analysis.complexity,
          placeholders: analysis.placeholders,
          structure: analysis.structure,
          validation: analysis.validation
        },
        fields: analysis.placeholders.all.map(field => ({
          name: field,
          type: this.inferFieldType(field),
          required: true,
          description: this.generateFieldDescription(field),
          sample: sampleData[0][field],
          mapping: fieldMapping[field] || null
        })),
        sampleData,
        processingEstimate,
        fieldMapping,
        recommendations: this.generateRecommendations(analysis)
      });

    } catch (error) {
      console.error('Template analysis error:', error);
      responseUtils.error(res, 'Failed to analyze template', 500, error.message);
    }
  }

  // Generate field mapping suggestions
  generateFieldMappingSuggestions(placeholders) {
    const mapping = {};
    
    placeholders.all.forEach(placeholder => {
      const lowerPlaceholder = placeholder.toLowerCase();
      
      // Common field mappings
      if (lowerPlaceholder.includes('name') && lowerPlaceholder.includes('first')) {
        mapping[placeholder] = ['firstName', 'first_name', 'given_name'];
      } else if (lowerPlaceholder.includes('name') && lowerPlaceholder.includes('last')) {
        mapping[placeholder] = ['lastName', 'last_name', 'surname', 'family_name'];
      } else if (lowerPlaceholder.includes('name') && !lowerPlaceholder.includes('first') && !lowerPlaceholder.includes('last')) {
        mapping[placeholder] = ['fullName', 'name', 'complete_name'];
      } else if (lowerPlaceholder.includes('email')) {
        mapping[placeholder] = ['email', 'emailAddress', 'e_mail'];
      } else if (lowerPlaceholder.includes('phone')) {
        mapping[placeholder] = ['phone', 'phoneNumber', 'telephone', 'mobile'];
      } else if (lowerPlaceholder.includes('address')) {
        mapping[placeholder] = ['address', 'streetAddress', 'mailing_address'];
      } else if (lowerPlaceholder.includes('city')) {
        mapping[placeholder] = ['city', 'town', 'municipality'];
      } else if (lowerPlaceholder.includes('state')) {
        mapping[placeholder] = ['state', 'province', 'region'];
      } else if (lowerPlaceholder.includes('zip')) {
        mapping[placeholder] = ['zipCode', 'postalCode', 'zip', 'postcode'];
      } else if (lowerPlaceholder.includes('date')) {
        mapping[placeholder] = ['date', 'startDate', 'effectiveDate', 'createdDate'];
      } else if (lowerPlaceholder.includes('salary') || lowerPlaceholder.includes('amount')) {
        mapping[placeholder] = ['salary', 'amount', 'price', 'cost', 'rate'];
      } else if (lowerPlaceholder.includes('company')) {
        mapping[placeholder] = ['company', 'organization', 'business', 'employer'];
      }
    });

    return mapping;
  }

  // Generate recommendations based on analysis
  generateRecommendations(analysis) {
    const recommendations = [];

    if (analysis.placeholders.count > 30) {
      recommendations.push({
        type: 'warning',
        message: 'Template has many placeholders. Consider breaking it into smaller templates for better performance.',
        action: 'split_template'
      });
    }

    if (analysis.wordCount > 5000) {
      recommendations.push({
        type: 'info',
        message: 'Large template detected. Generation may take longer for bulk operations.',
        action: 'optimize_content'
      });
    }

    if (analysis.complexity === 'Complex') {
      recommendations.push({
        type: 'info',
        message: 'Complex template detected. Consider using the batch processing endpoint for large datasets.',
        action: 'use_batch_processing'
      });
    }

    if (analysis.placeholders.types.includes('conditional') || analysis.placeholders.types.includes('loop')) {
      recommendations.push({
        type: 'success',
        message: 'Advanced template features detected (conditionals/loops). Template supports dynamic content generation.',
        action: 'none'
      });
    }

    return recommendations;
  }

  // Upload template
  async uploadTemplate(req, res) {
    try {
      if (!req.file) {
        return responseUtils.error(res, 'Template file is required', 400);
      }

      const { name, category, description } = req.body;
      const templateId = uuidv4();
      
      // Move file to templates directory
      const templateDir = path.join(__dirname, '../uploads/templates');
      await fs.ensureDir(templateDir);
      
      const newPath = path.join(templateDir, `${templateId}_${req.file.originalname}`);
      await fs.move(req.file.path, newPath);

      // Analyze template to extract fields
      const analysis = await templateAnalyzer.analyzeTemplate(newPath, path.extname(req.file.originalname).substring(1));

      // Store template metadata (this would typically go to database)
      const template = {
        id: templateId,
        name: name || req.file.originalname,
        filename: req.file.originalname,
        path: newPath,
        category: category || 'general',
        description: description || '',
        fields: analysis.placeholders,
        fieldCount: analysis.placeholders.length,
        size: req.file.size,
        mimeType: req.file.mimetype,
        uploadedAt: new Date().toISOString(),
        status: 'active'
      };

      res.status(201).json({
        success: true,
        message: 'Template uploaded successfully',
        template
      });

    } catch (error) {
      console.error('Template upload error:', error);
      responseUtils.error(res, 'Failed to upload template', 500, error.message);
    }
  }

  // Get all templates
  async getAllTemplates(req, res) {
    try {
      const { page = 1, limit = 20, category, search } = req.query;
      
      // This would typically query a database
      // For now, return mock data
      const templates = [
        {
          id: '1',
          name: 'Employment Contract',
          category: 'legal',
          description: 'Standard employment contract template',
          fieldCount: 15,
          uploadedAt: new Date().toISOString(),
          status: 'active'
        }
      ];

      res.status(200).json({
        success: true,
        templates,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: templates.length
        }
      });

    } catch (error) {
      responseUtils.error(res, 'Failed to fetch templates', 500, error.message);
    }
  }

  // Get template by ID
  async getTemplateById(req, res) {
    try {
      const { id } = req.params;
      
      // This would typically query a database
      const template = {
        id,
        name: 'Employment Contract',
        category: 'legal',
        description: 'Standard employment contract template',
        fields: ['employeeName', 'startDate', 'salary', 'position'],
        fieldCount: 4,
        uploadedAt: new Date().toISOString(),
        status: 'active'
      };

      if (!template) {
        return responseUtils.error(res, 'Template not found', 404);
      }

      res.status(200).json({
        success: true,
        template
      });

    } catch (error) {
      responseUtils.error(res, 'Failed to fetch template', 500, error.message);
    }
  }

  // Update template
  async updateTemplate(req, res) {
    try {
      const { id } = req.params;
      const { name, category, description, status } = req.body;
      
      // This would typically update the database
      
      res.status(200).json({
        success: true,
        message: 'Template updated successfully'
      });

    } catch (error) {
      responseUtils.error(res, 'Failed to update template', 500, error.message);
    }
  }

  // Delete template
  async deleteTemplate(req, res) {
    try {
      const { id } = req.params;
      
      // This would typically delete from database and file system
      
      res.status(200).json({
        success: true,
        message: 'Template deleted successfully'
      });

    } catch (error) {
      responseUtils.error(res, 'Failed to delete template', 500, error.message);
    }
  }

  // Analyze template
  async analyzeTemplate(req, res) {
    try {
      const { id } = req.params;
      
      // This would typically get template path from database
      // For now, we'll need to determine the actual file extension
      // In a real implementation, this would come from the database
      const templatePath = path.join(__dirname, '../uploads/templates', `${id}.docx`);
      
      if (!await fs.pathExists(templatePath)) {
        return responseUtils.error(res, 'Template not found', 404);
      }

      // Determine file type from extension
      const fileType = path.extname(templatePath).substring(1);
      const analysis = await templateAnalyzer.analyzeTemplate(templatePath, fileType);

      res.status(200).json({
        success: true,
        analysis
      });

    } catch (error) {
      responseUtils.error(res, 'Failed to analyze template', 500, error.message);
    }
  }

  // Preview template
  async previewTemplate(req, res) {
    try {
      const { id } = req.params;
      const { sampleData } = req.body;
      
      // This would typically generate a preview with sample data
      
      res.status(200).json({
        success: true,
        preview: 'Template preview generated successfully'
      });

    } catch (error) {
      responseUtils.error(res, 'Failed to generate preview', 500, error.message);
    }
  }

  // Get template fields
  async getTemplateFields(req, res) {
    try {
      const { id } = req.params;
      
      // This would typically query the database for template fields
      // For now, we'll analyze the template to get the actual fields
      const templatePath = path.join(__dirname, '../uploads/templates', `${id}.docx`);
      
      if (!await fs.pathExists(templatePath)) {
        return responseUtils.error(res, 'Template not found', 404);
      }

      const fileType = path.extname(templatePath).substring(1);
      const analysis = await templateAnalyzer.analyzeTemplate(templatePath, fileType);
      
      // Generate sample data for testing
      const sampleData = templateAnalyzer.generateSampleData(analysis.placeholders, 3);
      
      // Estimate processing time for 100 documents
      const processingEstimate = templateAnalyzer.estimateProcessingTime(analysis, 100);

      res.status(200).json({
        success: true,
        fields: analysis.placeholders.all.map(field => ({
          name: field,
          type: this.inferFieldType(field),
          required: true,
          description: this.generateFieldDescription(field),
          sample: sampleData[0][field]
        })),
        analysis: {
          totalFields: analysis.placeholders.count,
          categorizedFields: analysis.placeholders.categorized,
          complexity: analysis.complexity,
          structure: analysis.structure,
          processingEstimate
        },
        sampleData
      });

    } catch (error) {
      responseUtils.error(res, 'Failed to fetch template fields', 500, error.message);
    }
  }

  // Helper method to infer field type
  inferFieldType(fieldName) {
    const lowerField = fieldName.toLowerCase();
    
    if (lowerField.includes('date') || lowerField.includes('time') || 
        lowerField.includes('day') || lowerField.includes('month') || 
        lowerField.includes('year')) {
      return 'date';
    }
    
    if (lowerField.includes('amount') || lowerField.includes('price') || 
        lowerField.includes('salary') || lowerField.includes('number') || 
        lowerField.includes('count') || lowerField.includes('quantity')) {
      return 'number';
    }
    
    if (lowerField.includes('email') || lowerField.includes('mail')) {
      return 'email';
    }
    
    if (lowerField.includes('phone') || lowerField.includes('tel') || 
        lowerField.includes('mobile')) {
      return 'phone';
    }
    
    if (lowerField.includes('address') || lowerField.includes('street') || 
        lowerField.includes('city') || lowerField.includes('state') || 
        lowerField.includes('zip') || lowerField.includes('country')) {
      return 'address';
    }
    
    return 'text';
  }

  // Helper method to generate field description
  generateFieldDescription(fieldName) {
    const lowerField = fieldName.toLowerCase();
    
    if (lowerField.includes('name')) {
      return `Full name of the person`;
    }
    
    if (lowerField.includes('date')) {
      return `Date value for ${fieldName}`;
    }
    
    if (lowerField.includes('email')) {
      return `Email address for ${fieldName}`;
    }
    
    if (lowerField.includes('phone')) {
      return `Phone number for ${fieldName}`;
    }
    
    if (lowerField.includes('address')) {
      return `Address information for ${fieldName}`;
    }
    
    if (lowerField.includes('company')) {
      return `Company or organization name`;
    }
    
    return `Value for ${fieldName}`;
  }

  // Get templates by category
  async getTemplatesByCategory(req, res) {
    try {
      const { category } = req.params;
      const { page = 1, limit = 20 } = req.query;
      
      // This would typically query database by category
      const templates = [
        {
          id: '1',
          name: 'Employment Contract',
          category: 'legal',
          description: 'Standard employment contract template',
          fieldCount: 15,
          uploadedAt: new Date().toISOString()
        }
      ];

      res.status(200).json({
        success: true,
        templates,
        category,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: templates.length
        }
      });

    } catch (error) {
      responseUtils.error(res, 'Failed to fetch templates by category', 500, error.message);
    }
  }

  // Search templates
  async searchTemplates(req, res) {
    try {
      const { query } = req.params;
      const { page = 1, limit = 20 } = req.query;
      
      // This would typically search database
      const templates = [
        {
          id: '1',
          name: 'Employment Contract',
          category: 'legal',
          description: 'Standard employment contract template',
          fieldCount: 15,
          uploadedAt: new Date().toISOString()
        }
      ];

      res.status(200).json({
        success: true,
        templates,
        searchQuery: query,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: templates.length
        }
      });

    } catch (error) {
      responseUtils.error(res, 'Failed to search templates', 500, error.message);
    }
  }

  // Validate template
  async validateTemplate(req, res) {
    try {
      const { id } = req.params;
      
      // This would typically validate template structure and fields
      const validation = {
        isValid: true,
        errors: [],
        warnings: [],
        fieldCount: 15,
        estimatedProcessingTime: '2-5 minutes'
      };

      res.status(200).json({
        success: true,
        validation
      });

    } catch (error) {
      responseUtils.error(res, 'Failed to validate template', 500, error.message);
    }
  }

  // Test template with sample data
  async testTemplate(req, res) {
    try {
      const { id } = req.params;
      const { testData, outputFormat } = req.body;
      
      // Get template
      const template = await this.getTemplateFromDatabase(id);
      if (!template) {
        return responseUtils.error(res, 'Template not found', 404);
      }
      
      // Analyze template
      const analysis = await templateAnalyzer.analyzeTemplate(template.filePath, template.fileType);
      
      // Generate test documents
      const testResults = await this.generateTestDocuments(analysis, testData, outputFormat);
      
      res.status(200).json({
        success: true,
        template: {
          id: template.id,
          name: template.name,
          analysis: analysis
        },
        testResults
      });
      
    } catch (error) {
      console.error('Template testing error:', error);
      responseUtils.error(res, 'Failed to test template', 500, error.message);
    }
  }

  // Compare two templates
  async compareTemplates(req, res) {
    try {
      if (!req.files || !req.files.template1 || !req.files.template2) {
        return responseUtils.error(res, 'Two template files are required for comparison', 400);
      }

      const template1 = req.files.template1[0];
      const template2 = req.files.template2[0];
      
      // Compare templates
      const comparison = await templateAnalyzer.compareTemplates(
        template1.path,
        template2.path
      );

      res.status(200).json({
        success: true,
        comparison: {
          template1: {
            filename: template1.originalname,
            fileSize: template1.size,
            mimeType: template1.mimetype
          },
          template2: {
            filename: template2.originalname,
            fileSize: template2.size,
            mimeType: template2.mimetype
          },
          ...comparison
        }
      });

    } catch (error) {
      console.error('Template comparison error:', error);
      responseUtils.error(res, 'Failed to compare templates', 500, error.message);
    }
  }

  // Batch analyze multiple templates
  async batchAnalyzeTemplates(req, res) {
    try {
      if (!req.files || req.files.length === 0) {
        return responseUtils.error(res, 'At least one template file is required', 400);
      }

      const { parallel = true, maxConcurrent = 5, includeComparison = false } = req.body;
      
      const templatePaths = req.files.map(file => file.path);
      
      // Batch analyze templates
      const results = await templateAnalyzer.batchAnalyzeTemplates(templatePaths, {
        parallel: parallel === 'true',
        maxConcurrent: parseInt(maxConcurrent),
        includeComparison: includeComparison === 'true'
      });

      // Clean up file paths from results
      const cleanedResults = results.map(result => {
        if (result.path) {
          const file = req.files.find(f => f.path === result.path);
          if (file) {
            result.filename = file.originalname;
            result.fileSize = file.size;
            result.mimeType = file.mimetype;
            delete result.path;
          }
        }
        return result;
      });

      res.status(200).json({
        success: true,
        totalTemplates: req.files.length,
        options: { parallel, maxConcurrent, includeComparison },
        results: cleanedResults
      });

    } catch (error) {
      console.error('Batch template analysis error:', error);
      responseUtils.error(res, 'Failed to batch analyze templates', 500, error.message);
    }
  }

  // Get cache statistics
  async getCacheStats(req, res) {
    try {
      const stats = templateAnalyzer.getCacheStats();
      
      res.status(200).json({
        success: true,
        cache: stats
      });
      
    } catch (error) {
      console.error('Cache stats error:', error);
      responseUtils.error(res, 'Failed to get cache statistics', 500, error.message);
    }
  }

  // Clear cache
  async clearCache(req, res) {
    try {
      templateAnalyzer.clearCache();
      
      res.status(200).json({
        success: true,
        message: 'Cache cleared successfully'
      });
      
    } catch (error) {
      console.error('Cache clear error:', error);
      responseUtils.error(res, 'Failed to clear cache', 500, error.message);
    }
  }

  // Get templates insights summary
  async getTemplatesInsights(req, res) {
    try {
      // This would typically query the database for stored templates
      // For now, we'll return a placeholder response
      const insights = templateAnalyzer.getTemplatesInsights();
      
      res.status(200).json({
        success: true,
        insights
      });
      
    } catch (error) {
      console.error('Templates insights error:', error);
      responseUtils.error(res, 'Failed to get templates insights', 500, error.message);
    }
  }

  // Get template patterns
  async getTemplatePatterns(req, res) {
    try {
      const patterns = templateAnalyzer.getTemplatePatterns();
      
      res.status(200).json({
        success: true,
        patterns
      });
      
    } catch (error) {
      console.error('Template patterns error:', error);
      responseUtils.error(res, 'Failed to get template patterns', 500, error.message);
    }
  }

  // Get template recommendations
  async getTemplateRecommendations(req, res) {
    try {
      const { priority, focus } = req.query;
      const userPreferences = { priority, focus };
      
      const recommendations = templateAnalyzer.getTemplateRecommendations([], userPreferences);
      
      res.status(200).json({
        success: true,
        recommendations
      });
      
    } catch (error) {
      console.error('Template recommendations error:', error);
      responseUtils.error(res, 'Failed to get template recommendations', 500, error.message);
    }
  }
}

// Export the class for testing, and an instance for use
module.exports = TemplateController;
module.exports.default = new TemplateController();
