const { v4: uuidv4 } = require('uuid');
const databaseManager = require('../database/connection');
const logger = require('../services/loggingService');

/**
 * Template Model
 * Manages reusable templates with variable extraction and usage tracking
 */
class Template {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.name = data.name;
    this.description = data.description;
    this.category = data.category;
    this.filePath = data.filePath || data.file_path;
    this.fileSize = data.fileSize || data.file_size;
    this.fileType = data.fileType || data.file_type;
    this.variables = data.variables || [];
    this.structure = data.structure || {};
    this.complexity = data.complexity || 'simple';
    this.usageCount = data.usageCount || data.usage_count || 0;
    this.isActive = data.isActive !== undefined ? data.isActive : (data.is_active !== undefined ? data.is_active : true);
    this.createdAt = data.createdAt || data.created_at || new Date();
    this.updatedAt = data.updatedAt || data.updated_at || new Date();
    this.createdBy = data.createdBy || data.created_by;
    this.tags = data.tags || [];
  }

  /**
   * Create a new template
   * @param {Object} templateData - Template data
   * @returns {Promise<Template>} Created template
   */
  static async create(templateData) {
    try {
      const template = new Template(templateData);
      
      // Validate required fields
      template.validate();

      const sql = `
        INSERT INTO templates (
          id, name, description, category, file_path, file_size, file_type,
          variables, structure, complexity, usage_count, is_active, created_at,
          updated_at, created_by, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        template.id,
        template.name,
        template.description,
        template.category,
        template.filePath,
        template.fileSize,
        template.fileType,
        JSON.stringify(template.variables),
        JSON.stringify(template.structure),
        template.complexity,
        template.usageCount,
        template.isActive ? 1 : 0,
        template.createdAt.toISOString(),
        template.updatedAt.toISOString(),
        template.createdBy,
        JSON.stringify(template.tags)
      ];

      await databaseManager.executeRun(sql, params);

      logger.info('Template created successfully', { 
        templateId: template.id, 
        name: template.name,
        category: template.category 
      });
      return template;

    } catch (error) {
      logger.error('Failed to create template', { error: error.message, templateData });
      throw new Error(`Failed to create template: ${error.message}`);
    }
  }

  /**
   * Find template by ID
   * @param {string} id - Template ID
   * @returns {Promise<Template|null>} Found template or null
   */
  static async findById(id) {
    try {
      const sql = 'SELECT * FROM templates WHERE id = ?';
      const row = await databaseManager.executeQuerySingle(sql, [id]);

      if (!row) {
        return null;
      }

      return new Template(row);

    } catch (error) {
      logger.error('Failed to find template by ID', { error: error.message, templateId: id });
      throw new Error(`Failed to find template: ${error.message}`);
    }
  }

  /**
   * Find template by file path
   * @param {string} filePath - File path
   * @returns {Promise<Template|null>} Found template or null
   */
  static async findByFilePath(filePath) {
    try {
      const sql = 'SELECT * FROM templates WHERE file_path = ?';
      const row = await databaseManager.executeQuerySingle(sql, [filePath]);

      if (!row) {
        return null;
      }

      return new Template(row);

    } catch (error) {
      logger.error('Failed to find template by file path', { error: error.message, filePath });
      throw new Error(`Failed to find template: ${error.message}`);
    }
  }

  /**
   * Find templates by category
   * @param {string} category - Template category
   * @param {Object} options - Query options
   * @returns {Promise<Template[]>} Array of templates
   */
  static async findByCategory(category, options = {}) {
    try {
      const { isActive = true, limit = 50, offset = 0, sortBy = 'name', sortOrder = 'ASC' } = options;

      let sql = 'SELECT * FROM templates WHERE category = ?';
      const params = [category];

      if (isActive !== undefined) {
        sql += ' AND is_active = ?';
        params.push(isActive ? 1 : 0);
      }

      sql += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = await databaseManager.executeQuery(sql, params);
      return rows.map(row => new Template(row));

    } catch (error) {
      logger.error('Failed to find templates by category', { error: error.message, category });
      throw new Error(`Failed to find templates: ${error.message}`);
    }
  }

  /**
   * Find templates by complexity
   * @param {string} complexity - Template complexity
   * @param {Object} options - Query options
   * @returns {Promise<Template[]>} Array of templates
   */
  static async findByComplexity(complexity, options = {}) {
    try {
      const { isActive = true, limit = 50, offset = 0 } = options;

      let sql = 'SELECT * FROM templates WHERE complexity = ?';
      const params = [complexity];

      if (isActive !== undefined) {
        sql += ' AND is_active = ?';
        params.push(isActive ? 1 : 0);
      }

      sql += ' ORDER BY usage_count DESC, name ASC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = await databaseManager.executeQuery(sql, params);
      return rows.map(row => new Template(row));

    } catch (error) {
      logger.error('Failed to find templates by complexity', { error: error.message, complexity });
      throw new Error(`Failed to find templates: ${error.message}`);
    }
  }

  /**
   * Find templates by tags
   * @param {Array} tags - Array of tags to search for
   * @param {Object} options - Query options
   * @returns {Promise<Template[]>} Array of templates
   */
  static async findByTags(tags, options = {}) {
    try {
      if (!Array.isArray(tags) || tags.length === 0) {
        throw new Error('Tags must be a non-empty array');
      }

      const { isActive = true, limit = 50, offset = 0, matchAll = false } = options;

      // Build tag search condition
      let tagCondition;
      if (matchAll) {
        // Must contain all tags
        const tagPlaceholders = tags.map(() => 'tags LIKE ?').join(' AND ');
        tagCondition = `(${tagPlaceholders})`;
      } else {
        // Must contain at least one tag
        const tagPlaceholders = tags.map(() => 'tags LIKE ?').join(' OR ');
        tagCondition = `(${tagPlaceholders})`;
      }

      let sql = `SELECT * FROM templates WHERE ${tagCondition}`;
      const params = tags.map(tag => `%${tag}%`);

      if (isActive !== undefined) {
        sql += ' AND is_active = ?';
        params.push(isActive ? 1 : 0);
      }

      sql += ' ORDER BY usage_count DESC, name ASC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = await databaseManager.executeQuery(sql, params);
      return rows.map(row => new Template(row));

    } catch (error) {
      logger.error('Failed to find templates by tags', { error: error.message, tags });
      throw new Error(`Failed to find templates: ${error.message}`);
    }
  }

  /**
   * Find all templates with pagination and filtering
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Paginated results
   */
  static async findAll(options = {}) {
    try {
      const {
        page = 1,
        limit = 25,
        category,
        complexity,
        isActive,
        tags,
        search,
        sortBy = 'created_at',
        sortOrder = 'DESC'
      } = options;

      const offset = (page - 1) * limit;

      // Build WHERE clause
      let whereClause = 'WHERE 1=1';
      const params = [];

      if (category) {
        whereClause += ' AND category = ?';
        params.push(category);
      }

      if (complexity) {
        whereClause += ' AND complexity = ?';
        params.push(complexity);
      }

      if (isActive !== undefined) {
        whereClause += ' AND is_active = ?';
        params.push(isActive ? 1 : 0);
      }

      if (search) {
        whereClause += ' AND (name LIKE ? OR description LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm);
      }

      if (tags && Array.isArray(tags) && tags.length > 0) {
        const tagPlaceholders = tags.map(() => 'tags LIKE ?').join(' OR ');
        whereClause += ` AND (${tagPlaceholders})`;
        tags.forEach(tag => params.push(`%${tag}%`));
      }

      // Count total records
      const countSql = `SELECT COUNT(*) as total FROM templates ${whereClause}`;
      const countResult = await databaseManager.executeQuerySingle(countSql, params);
      const total = countResult ? countResult.total : 0;

      // Get paginated results
      let sql = `SELECT * FROM templates ${whereClause}`;
      sql += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = await databaseManager.executeQuery(sql, params);
      const templates = rows.map(row => new Template(row));

      return {
        templates,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      };

    } catch (error) {
      logger.error('Failed to find all templates', { error: error.message, options });
      throw new Error(`Failed to find templates: ${error.message}`);
    }
  }

  /**
   * Update template
   * @param {string} id - Template ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Template>} Updated template
   */
  static async update(id, updateData) {
    try {
      // Check if template exists
      const existingTemplate = await this.findById(id);
      if (!existingTemplate) {
        throw new Error(`Template with ID '${id}' not found`);
      }

      // Prepare update fields
      const updateFields = [];
      const params = [];

      Object.entries(updateData).forEach(([key, value]) => {
        if (key === 'id') return; // Don't allow ID updates

        const dbKey = this.camelToSnakeCase(key);
        updateFields.push(`${dbKey} = ?`);
        
        if (value instanceof Date) {
          params.push(value.toISOString());
        } else if (typeof value === 'object') {
          params.push(JSON.stringify(value));
        } else if (typeof value === 'boolean') {
          params.push(value ? 1 : 0);
        } else {
          params.push(value);
        }
      });

      if (updateFields.length === 0) {
        return existingTemplate;
      }

      // Add updated_at timestamp
      updateFields.push('updated_at = ?');
      params.push(new Date().toISOString());

      const sql = `UPDATE templates SET ${updateFields.join(', ')} WHERE id = ?`;
      params.push(id);

      await databaseManager.executeRun(sql, params);

      // Return updated template
      return await this.findById(id);

    } catch (error) {
      logger.error('Failed to update template', { error: error.message, templateId: id, updateData });
      throw new Error(`Failed to update template: ${error.message}`);
    }
  }

  /**
   * Delete template
   * @param {string} id - Template ID
   * @returns {Promise<boolean>} Whether deletion was successful
   */
  static async delete(id) {
    try {
      const sql = 'DELETE FROM templates WHERE id = ?';
      const result = await databaseManager.executeRun(sql, [id]);

      if (result.changes > 0) {
        logger.info('Template deleted successfully', { templateId: id });
        return true;
      }

      return false;

    } catch (error) {
      logger.error('Failed to delete template', { error: error.message, templateId: id });
      throw new Error(`Failed to delete template: ${error.message}`);
    }
  }

  /**
   * Increment usage count
   * @param {string} id - Template ID
   * @returns {Promise<Template>} Updated template
   */
  static async incrementUsage(id) {
    try {
      const sql = 'UPDATE templates SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?';
      await databaseManager.executeRun(sql, [new Date().toISOString(), id]);

      return await this.findById(id);

    } catch (error) {
      logger.error('Failed to increment template usage', { error: error.message, templateId: id });
      throw new Error(`Failed to increment template usage: ${error.message}`);
    }
  }

  /**
   * Update template variables and structure
   * @param {string} id - Template ID
   * @param {Object} analysis - Template analysis data
   * @returns {Promise<Template>} Updated template
   */
  static async updateAnalysis(id, analysis) {
    try {
      const updateData = {};

      if (analysis.variables) {
        updateData.variables = analysis.variables;
      }

      if (analysis.structure) {
        updateData.structure = analysis.structure;
      }

      if (analysis.complexity) {
        updateData.complexity = analysis.complexity;
      }

      if (Object.keys(updateData).length === 0) {
        return await this.findById(id);
      }

      return await this.update(id, updateData);

    } catch (error) {
      logger.error('Failed to update template analysis', { error: error.message, templateId: id });
      throw new Error(`Failed to update template analysis: ${error.message}`);
    }
  }

  /**
   * Get template statistics
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Template statistics
   */
  static async getStatistics(options = {}) {
    try {
      const { category, complexity, isActive } = options;

      let whereClause = 'WHERE 1=1';
      const params = [];

      if (category) {
        whereClause += ' AND category = ?';
        params.push(category);
      }

      if (complexity) {
        whereClause += ' AND complexity = ?';
        params.push(complexity);
      }

      if (isActive !== undefined) {
        whereClause += ' AND is_active = ?';
        params.push(isActive ? 1 : 0);
      }

      const sql = `
        SELECT 
          COUNT(*) as total_templates,
          COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_templates,
          COUNT(CASE WHEN is_active = 0 THEN 1 END) as inactive_templates,
          COUNT(CASE WHEN complexity = 'simple' THEN 1 END) as simple_templates,
          COUNT(CASE WHEN complexity = 'moderate' THEN 1 END) as moderate_templates,
          COUNT(CASE WHEN complexity = 'complex' THEN 1 END) as complex_templates,
          COUNT(CASE WHEN complexity = 'very_complex' THEN 1 END) as very_complex_templates,
          SUM(usage_count) as total_usage,
          AVG(usage_count) as average_usage,
          COUNT(DISTINCT category) as total_categories,
          SUM(file_size) as total_file_size
        FROM templates 
        ${whereClause}
      `;

      const result = await databaseManager.executeQuerySingle(sql, params);

      return {
        totalTemplates: result.total_templates || 0,
        activeTemplates: result.active_templates || 0,
        inactiveTemplates: result.inactive_templates || 0,
        complexityBreakdown: {
          simple: result.simple_templates || 0,
          moderate: result.moderate_templates || 0,
          complex: result.complex_templates || 0,
          veryComplex: result.very_complex_templates || 0
        },
        totalUsage: result.total_usage || 0,
        averageUsage: Math.round(result.average_usage || 0),
        totalCategories: result.total_categories || 0,
        totalFileSize: result.total_file_size || 0
      };

    } catch (error) {
      logger.error('Failed to get template statistics', { error: error.message, options });
      throw new Error(`Failed to get template statistics: ${error.message}`);
    }
  }

  /**
   * Get popular templates
   * @param {Object} options - Query options
   * @returns {Promise<Template[]>} Array of popular templates
   */
  static async getPopularTemplates(options = {}) {
    try {
      const { limit = 10, category, isActive = true } = options;

      let sql = 'SELECT * FROM templates WHERE usage_count > 0';
      const params = [];

      if (category) {
        sql += ' AND category = ?';
        params.push(category);
      }

      if (isActive !== undefined) {
        sql += ' AND is_active = ?';
        params.push(isActive ? 1 : 0);
      }

      sql += ' ORDER BY usage_count DESC, name ASC LIMIT ?';
      params.push(limit);

      const rows = await databaseManager.executeQuery(sql, params);
      return rows.map(row => new Template(row));

    } catch (error) {
      logger.error('Failed to get popular templates', { error: error.message, options });
      throw new Error(`Failed to get popular templates: ${error.message}`);
    }
  }

  /**
   * Search templates
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Template[]>} Array of matching templates
   */
  static async search(query, options = {}) {
    try {
      if (!query || query.trim().length === 0) {
        throw new Error('Search query is required');
      }

      const { 
        limit = 50, 
        category, 
        complexity, 
        isActive = true,
        searchIn = ['name', 'description', 'tags'] 
      } = options;

      // Build search conditions
      const searchConditions = [];
      const params = [];

      if (searchIn.includes('name')) {
        searchConditions.push('name LIKE ?');
        params.push(`%${query}%`);
      }

      if (searchIn.includes('description')) {
        searchConditions.push('description LIKE ?');
        params.push(`%${query}%`);
      }

      if (searchIn.includes('tags')) {
        searchConditions.push('tags LIKE ?');
        params.push(`%${query}%`);
      }

      if (searchConditions.length === 0) {
        throw new Error('No valid search fields specified');
      }

      let sql = `SELECT * FROM templates WHERE (${searchConditions.join(' OR ')})`;
      
      if (category) {
        sql += ' AND category = ?';
        params.push(category);
      }

      if (complexity) {
        sql += ' AND complexity = ?';
        params.push(complexity);
      }

      if (isActive !== undefined) {
        sql += ' AND is_active = ?';
        params.push(isActive ? 1 : 0);
      }

      sql += ' ORDER BY usage_count DESC, name ASC LIMIT ?';
      params.push(limit);

      const rows = await databaseManager.executeQuery(sql, params);
      return rows.map(row => new Template(row));

    } catch (error) {
      logger.error('Failed to search templates', { error: error.message, query, options });
      throw new Error(`Failed to search templates: ${error.message}`);
    }
  }

  /**
   * Validate template data
   * @throws {Error} If validation fails
   */
  validate() {
    if (!this.name) {
      throw new Error('Template name is required');
    }

    if (!this.filePath) {
      throw new Error('File path is required');
    }

    if (!this.fileType) {
      throw new Error('File type is required');
    }

    const validComplexities = ['simple', 'moderate', 'complex', 'very_complex'];
    if (!validComplexities.includes(this.complexity)) {
      throw new Error(`Invalid complexity. Must be one of: ${validComplexities.join(', ')}`);
    }

    if (this.fileSize !== undefined && this.fileSize < 0) {
      throw new Error('File size must be non-negative');
    }

    if (this.usageCount !== undefined && this.usageCount < 0) {
      throw new Error('Usage count must be non-negative');
    }
  }

  /**
   * Convert camelCase to snake_case
   * @param {string} str - CamelCase string
   * @returns {string} Snake_case string
   */
  static camelToSnakeCase(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * Convert to plain object
   * @returns {Object} Plain object representation
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      filePath: this.filePath,
      fileSize: this.fileSize,
      fileType: this.fileType,
      variables: this.variables,
      structure: this.structure,
      complexity: this.complexity,
      usageCount: this.usageCount,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      createdBy: this.createdBy,
      tags: this.tags
    };
  }

  /**
   * Get template summary for API responses
   * @returns {Object} Template summary
   */
  toSummary() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      fileType: this.fileType,
      complexity: this.complexity,
      usageCount: this.usageCount,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      tags: this.tags
    };
  }

  /**
   * Get template details for analysis
   * @returns {Object} Template analysis details
   */
  toAnalysisDetails() {
    return {
      id: this.id,
      name: this.name,
      filePath: this.filePath,
      fileType: this.fileType,
      variables: this.variables,
      structure: this.structure,
      complexity: this.complexity,
      usageCount: this.usageCount
    };
  }
}

module.exports = Template;
