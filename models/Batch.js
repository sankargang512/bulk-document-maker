const { v4: uuidv4 } = require('uuid');
const databaseManager = require('../database/connection');
const logger = require('../services/loggingService');

/**
 * Batch Model
 * Manages document generation batches with full CRUD operations
 */
class Batch {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.userEmail = data.userEmail || data.user_email;
    this.status = data.status || 'pending';
    this.progress = data.progress || 0;
    this.totalDocuments = data.totalDocuments || data.total_documents || 0;
    this.completedDocuments = data.completedDocuments || data.completed_documents || 0;
    this.failedDocuments = data.failedDocuments || data.failed_documents || 0;
    this.templatePath = data.templatePath || data.template_path;
    this.csvPath = data.csvPath || data.csv_path;
    this.zipPath = data.zipPath || data.zip_path;
    this.options = data.options || {};
    this.notificationEmail = data.notificationEmail || data.notification_email;
    this.errorMessage = data.errorMessage || data.error_message;
    this.estimatedTime = data.estimatedTime || data.estimated_time;
    this.createdAt = data.createdAt || data.created_at || new Date();
    this.updatedAt = data.updatedAt || data.updated_at || new Date();
    this.startedAt = data.startedAt || data.started_at;
    this.completedAt = data.completedAt || data.completed_at;
    this.cancelledAt = data.cancelledAt || data.cancelled_at;
  }

  /**
   * Create a new batch
   * @param {Object} batchData - Batch data
   * @returns {Promise<Batch>} Created batch
   */
  static async create(batchData) {
    try {
      const batch = new Batch(batchData);
      
      // Validate required fields
      batch.validate();

      const sql = `
        INSERT INTO batches (
          id, user_email, status, progress, total_documents, completed_documents, 
          failed_documents, template_path, csv_path, zip_path, options, 
          notification_email, error_message, estimated_time, created_at, 
          updated_at, started_at, completed_at, cancelled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        batch.id,
        batch.userEmail,
        batch.status,
        batch.progress,
        batch.totalDocuments,
        batch.completedDocuments,
        batch.failedDocuments,
        batch.templatePath,
        batch.csvPath,
        batch.zipPath,
        JSON.stringify(batch.options),
        batch.notificationEmail,
        batch.errorMessage,
        batch.estimatedTime,
        batch.createdAt.toISOString(),
        batch.updatedAt.toISOString(),
        batch.startedAt ? batch.startedAt.toISOString() : null,
        batch.completedAt ? batch.completedAt.toISOString() : null,
        batch.cancelledAt ? batch.cancelledAt.toISOString() : null
      ];

      await databaseManager.executeRun(sql, params);

      logger.info('Batch created successfully', { batchId: batch.id, userEmail: batch.userEmail });
      return batch;

    } catch (error) {
      logger.error('Failed to create batch', { error: error.message, batchData });
      throw new Error(`Failed to create batch: ${error.message}`);
    }
  }

  /**
   * Find batch by ID
   * @param {string} id - Batch ID
   * @returns {Promise<Batch|null>} Found batch or null
   */
  static async findById(id) {
    try {
      const sql = 'SELECT * FROM batches WHERE id = ?';
      const row = await databaseManager.executeQuerySingle(sql, [id]);

      if (!row) {
        return null;
      }

      return new Batch(row);

    } catch (error) {
      logger.error('Failed to find batch by ID', { error: error.message, batchId: id });
      throw new Error(`Failed to find batch: ${error.message}`);
    }
  }

  /**
   * Find batches by user email
   * @param {string} userEmail - User email
   * @param {Object} options - Query options
   * @returns {Promise<Batch[]>} Array of batches
   */
  static async findByUserEmail(userEmail, options = {}) {
    try {
      const { limit = 50, offset = 0, status, sortBy = 'created_at', sortOrder = 'DESC' } = options;

      let sql = 'SELECT * FROM batches WHERE user_email = ?';
      const params = [userEmail];

      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      sql += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = await databaseManager.executeQuery(sql, params);
      return rows.map(row => new Batch(row));

    } catch (error) {
      logger.error('Failed to find batches by user email', { error: error.message, userEmail });
      throw new Error(`Failed to find batches: ${error.message}`);
    }
  }

  /**
   * Find all batches with pagination and filtering
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Paginated results
   */
  static async findAll(options = {}) {
    try {
      const {
        page = 1,
        limit = 25,
        status,
        userEmail,
        sortBy = 'created_at',
        sortOrder = 'DESC',
        startDate,
        endDate
      } = options;

      const offset = (page - 1) * limit;

      // Build WHERE clause
      let whereClause = 'WHERE 1=1';
      const params = [];

      if (status) {
        whereClause += ' AND status = ?';
        params.push(status);
      }

      if (userEmail) {
        whereClause += ' AND user_email = ?';
        params.push(userEmail);
      }

      if (startDate) {
        whereClause += ' AND created_at >= ?';
        params.push(startDate.toISOString());
      }

      if (endDate) {
        whereClause += ' AND created_at <= ?';
        params.push(endDate.toISOString());
      }

      // Count total records
      const countSql = `SELECT COUNT(*) as total FROM batches ${whereClause}`;
      const countResult = await databaseManager.executeQuerySingle(countSql, params);
      const total = countResult ? countResult.total : 0;

      // Get paginated results
      let sql = `SELECT * FROM batches ${whereClause}`;
      sql += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = await databaseManager.executeQuery(sql, params);
      const batches = rows.map(row => new Batch(row));

      return {
        batches,
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
      logger.error('Failed to find all batches', { error: error.message, options });
      throw new Error(`Failed to find batches: ${error.message}`);
    }
  }

  /**
   * Update batch
   * @param {string} id - Batch ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Batch>} Updated batch
   */
  static async update(id, updateData) {
    try {
      // Check if batch exists
      const existingBatch = await this.findById(id);
      if (!existingBatch) {
        throw new Error(`Batch with ID '${id}' not found`);
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
        } else {
          params.push(value);
        }
      });

      if (updateFields.length === 0) {
        return existingBatch;
      }

      // Add updated_at timestamp
      updateFields.push('updated_at = ?');
      params.push(new Date().toISOString());

      const sql = `UPDATE batches SET ${updateFields.join(', ')} WHERE id = ?`;
      params.push(id);

      await databaseManager.executeRun(sql, params);

      // Return updated batch
      return await this.findById(id);

    } catch (error) {
      logger.error('Failed to update batch', { error: error.message, batchId: id, updateData });
      throw new Error(`Failed to update batch: ${error.message}`);
    }
  }

  /**
   * Delete batch
   * @param {string} id - Batch ID
   * @returns {Promise<boolean>} Whether deletion was successful
   */
  static async delete(id) {
    try {
      const sql = 'DELETE FROM batches WHERE id = ?';
      const result = await databaseManager.executeRun(sql, [id]);

      if (result.changes > 0) {
        logger.info('Batch deleted successfully', { batchId: id });
        return true;
      }

      return false;

    } catch (error) {
      logger.error('Failed to delete batch', { error: error.message, batchId: id });
      throw new Error(`Failed to delete batch: ${error.message}`);
    }
  }

  /**
   * Update batch status
   * @param {string} id - Batch ID
   * @param {string} status - New status
   * @param {Object} additionalData - Additional data to update
   * @returns {Promise<Batch>} Updated batch
   */
  static async updateStatus(id, status, additionalData = {}) {
    try {
      const updateData = { status, ...additionalData };

      // Set appropriate timestamps based on status
      switch (status) {
        case 'processing':
          updateData.startedAt = new Date();
          break;
        case 'completed':
          updateData.completedAt = new Date();
          break;
        case 'cancelled':
          updateData.cancelledAt = new Date();
          break;
      }

      return await this.update(id, updateData);

    } catch (error) {
      logger.error('Failed to update batch status', { error: error.message, batchId: id, status });
      throw new Error(`Failed to update batch status: ${error.message}`);
    }
  }

  /**
   * Update batch progress
   * @param {string} id - Batch ID
   * @param {number} progress - Progress percentage (0-100)
   * @param {Object} documentCounts - Document count updates
   * @returns {Promise<Batch>} Updated batch
   */
  static async updateProgress(id, progress, documentCounts = {}) {
    try {
      const updateData = { progress };

      if (documentCounts.completedDocuments !== undefined) {
        updateData.completedDocuments = documentCounts.completedDocuments;
      }

      if (documentCounts.failedDocuments !== undefined) {
        updateData.failedDocuments = documentCounts.failedDocuments;
      }

      return await this.update(id, updateData);

    } catch (error) {
      logger.error('Failed to update batch progress', { error: error.message, batchId: id, progress });
      throw new Error(`Failed to update batch progress: ${error.message}`);
    }
  }

  /**
   * Get batch statistics
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Batch statistics
   */
  static async getStatistics(options = {}) {
    try {
      const { userEmail, startDate, endDate } = options;

      let whereClause = 'WHERE 1=1';
      const params = [];

      if (userEmail) {
        whereClause += ' AND user_email = ?';
        params.push(userEmail);
      }

      if (startDate) {
        whereClause += ' AND created_at >= ?';
        params.push(startDate.toISOString());
      }

      if (endDate) {
        whereClause += ' AND created_at <= ?';
        params.push(endDate.toISOString());
      }

      const sql = `
        SELECT 
          COUNT(*) as total_batches,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_batches,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_batches,
          COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_batches,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_batches,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_batches,
          SUM(total_documents) as total_documents,
          SUM(completed_documents) as total_completed_documents,
          SUM(failed_documents) as total_failed_documents,
          AVG(progress) as average_progress,
          AVG(CASE WHEN status = 'completed' THEN 
            (julianday(completed_at) - julianday(created_at)) * 24 * 60 
          END) as average_completion_time_minutes
        FROM batches 
        ${whereClause}
      `;

      const result = await databaseManager.executeQuerySingle(sql, params);

      return {
        totalBatches: result.total_batches || 0,
        completedBatches: result.completed_batches || 0,
        failedBatches: result.failed_batches || 0,
        processingBatches: result.processing_batches || 0,
        pendingBatches: result.pending_batches || 0,
        cancelledBatches: result.cancelled_batches || 0,
        totalDocuments: result.total_documents || 0,
        totalCompletedDocuments: result.total_completed_documents || 0,
        totalFailedDocuments: result.total_failed_documents || 0,
        averageProgress: Math.round(result.average_progress || 0),
        averageCompletionTimeMinutes: Math.round(result.average_completion_time_minutes || 0),
        successRate: result.total_batches > 0 ? 
          Math.round((result.completed_batches / result.total_batches) * 100) : 0
      };

    } catch (error) {
      logger.error('Failed to get batch statistics', { error: error.message, options });
      throw new Error(`Failed to get batch statistics: ${error.message}`);
    }
  }

  /**
   * Clean up old batches
   * @param {number} daysOld - Minimum age in days for cleanup
   * @param {boolean} dryRun - Whether to perform actual deletion
   * @returns {Promise<Object>} Cleanup results
   */
  static async cleanupOldBatches(daysOld = 7, dryRun = true) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const sql = `
        SELECT id, user_email, status, created_at, total_documents 
        FROM batches 
        WHERE created_at < ? AND status IN ('completed', 'failed', 'cancelled')
      `;

      const oldBatches = await databaseManager.executeQuery(sql, [cutoffDate.toISOString()]);

      if (dryRun) {
        return {
          dryRun: true,
          batchesToDelete: oldBatches.length,
          cutoffDate: cutoffDate.toISOString(),
          batches: oldBatches
        };
      }

      // Perform actual deletion
      let deletedCount = 0;
      let errorCount = 0;

      for (const batch of oldBatches) {
        try {
          await this.delete(batch.id);
          deletedCount++;
        } catch (error) {
          errorCount++;
          logger.error('Failed to delete old batch', { 
            error: error.message, 
            batchId: batch.id 
          });
        }
      }

      logger.info('Old batches cleanup completed', { 
        total: oldBatches.length, 
        deleted: deletedCount, 
        errors: errorCount 
      });

      return {
        dryRun: false,
        totalBatches: oldBatches.length,
        deletedBatches: deletedCount,
        errorCount,
        cutoffDate: cutoffDate.toISOString()
      };

    } catch (error) {
      logger.error('Failed to cleanup old batches', { error: error.message, daysOld, dryRun });
      throw new Error(`Failed to cleanup old batches: ${error.message}`);
    }
  }

  /**
   * Validate batch data
   * @throws {Error} If validation fails
   */
  validate() {
    if (!this.userEmail) {
      throw new Error('User email is required');
    }

    if (!this.templatePath) {
      throw new Error('Template path is required');
    }

    if (!this.csvPath) {
      throw new Error('CSV path is required');
    }

    if (this.totalDocuments < 0) {
      throw new Error('Total documents must be non-negative');
    }

    if (this.progress < 0 || this.progress > 100) {
      throw new Error('Progress must be between 0 and 100');
    }

    const validStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
    if (!validStatuses.includes(this.status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
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
      userEmail: this.userEmail,
      status: this.status,
      progress: this.progress,
      totalDocuments: this.totalDocuments,
      completedDocuments: this.completedDocuments,
      failedDocuments: this.failedDocuments,
      templatePath: this.templatePath,
      csvPath: this.csvPath,
      zipPath: this.zipPath,
      options: this.options,
      notificationEmail: this.notificationEmail,
      errorMessage: this.errorMessage,
      estimatedTime: this.estimatedTime,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      cancelledAt: this.cancelledAt
    };
  }

  /**
   * Get batch summary for API responses
   * @returns {Object} Batch summary
   */
  toSummary() {
    return {
      id: this.id,
      status: this.status,
      progress: this.progress,
      totalDocuments: this.totalDocuments,
      completedDocuments: this.completedDocuments,
      failedDocuments: this.failedDocuments,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
      estimatedTime: this.estimatedTime
    };
  }
}

module.exports = Batch;
