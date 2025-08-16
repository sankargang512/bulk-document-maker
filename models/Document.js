const { v4: uuidv4 } = require('uuid');
const databaseManager = require('../database/connection');
const logger = require('../services/loggingService');

/**
 * Document Model
 * Manages individual generated documents with batch relationships
 */
class Document {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.batchId = data.batchId || data.batch_id;
    this.rowId = data.rowId || data.row_id;
    this.filename = data.filename;
    this.status = data.status || 'pending';
    this.filePath = data.filePath || data.file_path;
    this.fileSize = data.fileSize || data.file_size;
    this.fileType = data.fileType || data.file_type;
    this.errorMessage = data.errorMessage || data.error_message;
    this.processingTimeMs = data.processingTimeMs || data.processing_time_ms;
    this.createdAt = data.createdAt || data.created_at || new Date();
    this.updatedAt = data.updatedAt || data.updated_at || new Date();
    this.completedAt = data.completedAt || data.completed_at;
  }

  /**
   * Create a new document
   * @param {Object} documentData - Document data
   * @returns {Promise<Document>} Created document
   */
  static async create(documentData) {
    try {
      const document = new Document(documentData);
      
      // Validate required fields
      document.validate();

      const sql = `
        INSERT INTO documents (
          id, batch_id, row_id, filename, status, file_path, file_size, 
          file_type, error_message, processing_time_ms, created_at, 
          updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        document.id,
        document.batchId,
        document.rowId,
        document.filename,
        document.status,
        document.filePath,
        document.fileSize,
        document.fileType,
        document.errorMessage,
        document.processingTimeMs,
        document.createdAt.toISOString(),
        document.updatedAt.toISOString(),
        document.completedAt ? document.completedAt.toISOString() : null
      ];

      await databaseManager.executeRun(sql, params);

      logger.info('Document created successfully', { 
        documentId: document.id, 
        batchId: document.batchId,
        filename: document.filename 
      });
      return document;

    } catch (error) {
      logger.error('Failed to create document', { error: error.message, documentData });
      throw new Error(`Failed to create document: ${error.message}`);
    }
  }

  /**
   * Create multiple documents in a batch
   * @param {Array} documentsData - Array of document data
   * @returns {Promise<Document[]>} Created documents
   */
  static async createBatch(documentsData) {
    try {
      if (!Array.isArray(documentsData) || documentsData.length === 0) {
        throw new Error('Documents data must be a non-empty array');
      }

      // Validate all documents first
      const documents = documentsData.map(data => new Document(data));
      documents.forEach(doc => doc.validate());

      // Use transaction for batch insert
      const result = await databaseManager.executeTransaction(async (connection) => {
        const createdDocuments = [];

        for (const document of documents) {
          const sql = `
            INSERT INTO documents (
              id, batch_id, row_id, filename, status, file_path, file_size, 
              file_type, error_message, processing_time_ms, created_at, 
              updated_at, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          const params = [
            document.id,
            document.batchId,
            document.rowId,
            document.filename,
            document.status,
            document.filePath,
            document.fileSize,
            document.fileType,
            document.errorMessage,
            document.processingTimeMs,
            document.createdAt.toISOString(),
            document.updatedAt.toISOString(),
            document.completedAt ? document.completedAt.toISOString() : null
          ];

          await new Promise((resolve, reject) => {
            connection.run(sql, params, function(err) {
              if (err) {
                reject(new Error(`Failed to insert document: ${err.message}`));
                return;
              }
              resolve();
            });
          });

          createdDocuments.push(document);
        }

        return createdDocuments;
      });

      logger.info('Batch documents created successfully', { 
        count: result.length, 
        batchId: documents[0].batchId 
      });
      return result;

    } catch (error) {
      logger.error('Failed to create batch documents', { error: error.message, count: documentsData.length });
      throw new Error(`Failed to create batch documents: ${error.message}`);
    }
  }

  /**
   * Find document by ID
   * @param {string} id - Document ID
   * @returns {Promise<Document|null>} Found document or null
   */
  static async findById(id) {
    try {
      const sql = 'SELECT * FROM documents WHERE id = ?';
      const row = await databaseManager.executeQuerySingle(sql, [id]);

      if (!row) {
        return null;
      }

      return new Document(row);

    } catch (error) {
      logger.error('Failed to find document by ID', { error: error.message, documentId: id });
      throw new Error(`Failed to find document: ${error.message}`);
    }
  }

  /**
   * Find documents by batch ID
   * @param {string} batchId - Batch ID
   * @param {Object} options - Query options
   * @returns {Promise<Document[]>} Array of documents
   */
  static async findByBatchId(batchId, options = {}) {
    try {
      const { status, limit, offset = 0, sortBy = 'created_at', sortOrder = 'ASC' } = options;

      let sql = 'SELECT * FROM documents WHERE batch_id = ?';
      const params = [batchId];

      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      sql += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;

      if (limit) {
        sql += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);
      }

      const rows = await databaseManager.executeQuery(sql, params);
      return rows.map(row => new Document(row));

    } catch (error) {
      logger.error('Failed to find documents by batch ID', { error: error.message, batchId });
      throw new Error(`Failed to find documents: ${error.message}`);
    }
  }

  /**
   * Find documents by status
   * @param {string} status - Document status
   * @param {Object} options - Query options
   * @returns {Promise<Document[]>} Array of documents
   */
  static async findByStatus(status, options = {}) {
    try {
      const { batchId, limit = 100, offset = 0 } = options;

      let sql = 'SELECT * FROM documents WHERE status = ?';
      const params = [status];

      if (batchId) {
        sql += ' AND batch_id = ?';
        params.push(batchId);
      }

      sql += ' ORDER BY created_at ASC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = await databaseManager.executeQuery(sql, params);
      return rows.map(row => new Document(row));

    } catch (error) {
      logger.error('Failed to find documents by status', { error: error.message, status });
      throw new Error(`Failed to find documents: ${error.message}`);
    }
  }

  /**
   * Find all documents with pagination and filtering
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Paginated results
   */
  static async findAll(options = {}) {
    try {
      const {
        page = 1,
        limit = 25,
        status,
        batchId,
        fileType,
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

      if (batchId) {
        whereClause += ' AND batch_id = ?';
        params.push(batchId);
      }

      if (fileType) {
        whereClause += ' AND file_type = ?';
        params.push(fileType);
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
      const countSql = `SELECT COUNT(*) as total FROM documents ${whereClause}`;
      const countResult = await databaseManager.executeQuerySingle(countSql, params);
      const total = countResult ? countResult.total : 0;

      // Get paginated results
      let sql = `SELECT * FROM documents ${whereClause}`;
      sql += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = await databaseManager.executeQuery(sql, params);
      const documents = rows.map(row => new Document(row));

      return {
        documents,
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
      logger.error('Failed to find all documents', { error: error.message, options });
      throw new Error(`Failed to find documents: ${error.message}`);
    }
  }

  /**
   * Update document
   * @param {string} id - Document ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Document>} Updated document
   */
  static async update(id, updateData) {
    try {
      // Check if document exists
      const existingDocument = await this.findById(id);
      if (!existingDocument) {
        throw new Error(`Document with ID '${id}' not found`);
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
        } else {
          params.push(value);
        }
      });

      if (updateFields.length === 0) {
        return existingDocument;
      }

      // Add updated_at timestamp
      updateFields.push('updated_at = ?');
      params.push(new Date().toISOString());

      const sql = `UPDATE documents SET ${updateFields.join(', ')} WHERE id = ?`;
      params.push(id);

      await databaseManager.executeRun(sql, params);

      // Return updated document
      return await this.findById(id);

    } catch (error) {
      logger.error('Failed to update document', { error: error.message, documentId: id, updateData });
      throw new Error(`Failed to update document: ${error.message}`);
    }
  }

  /**
   * Update document status
   * @param {string} id - Document ID
   * @param {string} status - New status
   * @param {Object} additionalData - Additional data to update
   * @returns {Promise<Document>} Updated document
   */
  static async updateStatus(id, status, additionalData = {}) {
    try {
      const updateData = { status, ...additionalData };

      // Set completed_at timestamp if status is completed
      if (status === 'completed') {
        updateData.completedAt = new Date();
      }

      return await this.update(id, updateData);

    } catch (error) {
      logger.error('Failed to update document status', { error: error.message, documentId: id, status });
      throw new Error(`Failed to update document status: ${error.message}`);
    }
  }

  /**
   * Delete document
   * @param {string} id - Document ID
   * @returns {Promise<boolean>} Whether deletion was successful
   */
  static async delete(id) {
    try {
      const sql = 'DELETE FROM documents WHERE id = ?';
      const result = await databaseManager.executeRun(sql, [id]);

      if (result.changes > 0) {
        logger.info('Document deleted successfully', { documentId: id });
        return true;
      }

      return false;

    } catch (error) {
      logger.error('Failed to delete document', { error: error.message, documentId: id });
      throw new Error(`Failed to delete document: ${error.message}`);
    }
  }

  /**
   * Delete documents by batch ID
   * @param {string} batchId - Batch ID
   * @returns {Promise<number>} Number of deleted documents
   */
  static async deleteByBatchId(batchId) {
    try {
      const sql = 'DELETE FROM documents WHERE batch_id = ?';
      const result = await databaseManager.executeRun(sql, [batchId]);

      logger.info('Documents deleted by batch ID', { 
        batchId, 
        deletedCount: result.changes 
      });

      return result.changes;

    } catch (error) {
      logger.error('Failed to delete documents by batch ID', { error: error.message, batchId });
      throw new Error(`Failed to delete documents: ${error.message}`);
    }
  }

  /**
   * Get document statistics
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Document statistics
   */
  static async getStatistics(options = {}) {
    try {
      const { batchId, userEmail, startDate, endDate } = options;

      let whereClause = 'WHERE 1=1';
      const params = [];

      if (batchId) {
        whereClause += ' AND batch_id = ?';
        params.push(batchId);
      }

      if (startDate) {
        whereClause += ' AND created_at >= ?';
        params.push(startDate.toISOString());
      }

      if (endDate) {
        whereClause += ' AND created_at <= ?';
        params.push(endDate.toISOString());
      }

      // If userEmail is provided, join with batches table
      let sql;
      if (userEmail) {
        sql = `
          SELECT 
            COUNT(*) as total_documents,
            COUNT(CASE WHEN d.status = 'completed' THEN 1 END) as completed_documents,
            COUNT(CASE WHEN d.status = 'failed' THEN 1 END) as failed_documents,
            COUNT(CASE WHEN d.status = 'processing' THEN 1 END) as processing_documents,
            COUNT(CASE WHEN d.status = 'pending' THEN 1 END) as pending_documents,
            SUM(d.file_size) as total_file_size,
            AVG(d.processing_time_ms) as average_processing_time,
            COUNT(DISTINCT d.batch_id) as total_batches
          FROM documents d
          JOIN batches b ON d.batch_id = b.id
          ${whereClause} AND b.user_email = ?
        `;
        params.push(userEmail);
      } else {
        sql = `
          SELECT 
            COUNT(*) as total_documents,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_documents,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_documents,
            COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_documents,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_documents,
            SUM(file_size) as total_file_size,
            AVG(processing_time_ms) as average_processing_time,
            COUNT(DISTINCT batch_id) as total_batches
          FROM documents 
          ${whereClause}
        `;
      }

      const result = await databaseManager.executeQuerySingle(sql, params);

      return {
        totalDocuments: result.total_documents || 0,
        completedDocuments: result.completed_documents || 0,
        failedDocuments: result.failed_documents || 0,
        processingDocuments: result.processing_documents || 0,
        pendingDocuments: result.pending_documents || 0,
        totalFileSize: result.total_file_size || 0,
        averageProcessingTime: Math.round(result.average_processing_time || 0),
        totalBatches: result.total_batches || 0,
        successRate: result.total_documents > 0 ? 
          Math.round((result.completed_documents / result.total_documents) * 100) : 0
      };

    } catch (error) {
      logger.error('Failed to get document statistics', { error: error.message, options });
      throw new Error(`Failed to get document statistics: ${error.message}`);
    }
  }

  /**
   * Get documents by file type
   * @param {string} fileType - File type to search for
   * @param {Object} options - Query options
   * @returns {Promise<Document[]>} Array of documents
   */
  static async findByFileType(fileType, options = {}) {
    try {
      const { batchId, status, limit = 100 } = options;

      let sql = 'SELECT * FROM documents WHERE file_type = ?';
      const params = [fileType];

      if (batchId) {
        sql += ' AND batch_id = ?';
        params.push(batchId);
      }

      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const rows = await databaseManager.executeQuery(sql, params);
      return rows.map(row => new Document(row));

    } catch (error) {
      logger.error('Failed to find documents by file type', { error: error.message, fileType });
      throw new Error(`Failed to find documents: ${error.message}`);
    }
  }

  /**
   * Get failed documents with error details
   * @param {Object} options - Query options
   * @returns {Promise<Document[]>} Array of failed documents
   */
  static async getFailedDocuments(options = {}) {
    try {
      const { batchId, limit = 50, includeErrorDetails = true } = options;

      let sql = 'SELECT * FROM documents WHERE status = ?';
      const params = ['failed'];

      if (batchId) {
        sql += ' AND batch_id = ?';
        params.push(batchId);
      }

      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const rows = await databaseManager.executeQuery(sql, params);
      const documents = rows.map(row => new Document(row));

      // Filter out documents without error details if requested
      if (includeErrorDetails) {
        return documents.filter(doc => doc.errorMessage);
      }

      return documents;

    } catch (error) {
      logger.error('Failed to get failed documents', { error: error.message, options });
      throw new Error(`Failed to get failed documents: ${error.message}`);
    }
  }

  /**
   * Validate document data
   * @throws {Error} If validation fails
   */
  validate() {
    if (!this.batchId) {
      throw new Error('Batch ID is required');
    }

    if (!this.rowId) {
      throw new Error('Row ID is required');
    }

    if (!this.filename) {
      throw new Error('Filename is required');
    }

    const validStatuses = ['pending', 'processing', 'completed', 'failed'];
    if (!validStatuses.includes(this.status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    if (this.fileSize !== undefined && this.fileSize < 0) {
      throw new Error('File size must be non-negative');
    }

    if (this.processingTimeMs !== undefined && this.processingTimeMs < 0) {
      throw new Error('Processing time must be non-negative');
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
      batchId: this.batchId,
      rowId: this.rowId,
      filename: this.filename,
      status: this.status,
      filePath: this.filePath,
      fileSize: this.fileSize,
      fileType: this.fileType,
      errorMessage: this.errorMessage,
      processingTimeMs: this.processingTimeMs,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt
    };
  }

  /**
   * Get document summary for API responses
   * @returns {Object} Document summary
   */
  toSummary() {
    return {
      id: this.id,
      batchId: this.batchId,
      rowId: this.rowId,
      filename: this.filename,
      status: this.status,
      fileSize: this.fileSize,
      fileType: this.fileType,
      errorMessage: this.errorMessage,
      processingTimeMs: this.processingTimeMs,
      createdAt: this.createdAt,
      completedAt: this.completedAt
    };
  }
}

module.exports = Document;
