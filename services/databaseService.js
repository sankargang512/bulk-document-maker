const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');
const loggingService = require('./loggingService');

class DatabaseService {
  constructor() {
    this.dbPath = path.join(__dirname, '../database/bulk_docs.db');
    this.db = null;
    this.isConnected = false;
    this.migrations = [];
    
    this.init();
  }

  async init() {
    try {
      await this.ensureDatabaseDirectory();
      await this.connect();
      await this.createTables();
      await this.runMigrations();
      
      loggingService.info('Database service initialized successfully');
    } catch (error) {
      loggingService.error('Failed to initialize database service', { error: error.message });
      throw error;
    }
  }

  // Ensure database directory exists
  async ensureDatabaseDirectory() {
    const dbDir = path.dirname(this.dbPath);
    await fs.ensureDir(dbDir);
  }

  // Connect to database
  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          loggingService.error('Failed to connect to database', { error: err.message });
          reject(err);
        } else {
          this.isConnected = true;
          this.db.run('PRAGMA foreign_keys = ON');
          this.db.run('PRAGMA journal_mode = WAL');
          this.db.run('PRAGMA synchronous = NORMAL');
          this.db.run('PRAGMA cache_size = 10000');
          this.db.run('PRAGMA temp_store = MEMORY');
          
          loggingService.info('Connected to database', { path: this.dbPath });
          resolve();
        }
      });
    });
  }

  // Disconnect from database
  async disconnect() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            loggingService.error('Failed to disconnect from database', { error: err.message });
            reject(err);
          } else {
            this.isConnected = false;
            this.db = null;
            loggingService.info('Disconnected from database');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  // Create database tables
  async createTables() {
    const tables = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        company TEXT,
        role TEXT DEFAULT 'user',
        api_key TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Templates table
      `CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        file_path TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        fields TEXT, -- JSON array of field names
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )`,

      // Jobs table
      `CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        template_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        progress REAL DEFAULT 0,
        total_documents INTEGER NOT NULL,
        completed_documents INTEGER DEFAULT 0,
        failed_documents INTEGER DEFAULT 0,
        csv_data_path TEXT,
        output_dir TEXT,
        priority TEXT DEFAULT 'normal',
        started_at DATETIME,
        completed_at DATETIME,
        error_message TEXT,
        metadata TEXT, -- JSON object
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (template_id) REFERENCES templates (id) ON DELETE CASCADE
      )`,

      // Documents table
      `CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        template_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        input_data TEXT, -- JSON object
        output_path TEXT,
        error_message TEXT,
        processing_time REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE,
        FOREIGN KEY (template_id) REFERENCES templates (id) ON DELETE CASCADE
      )`,

      // Email notifications table
      `CREATE TABLE IF NOT EXISTS email_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        job_id INTEGER,
        type TEXT NOT NULL,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        sent_at DATETIME,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE SET NULL
      )`,

      // API keys table
      `CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        key_hash TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        permissions TEXT, -- JSON array
        last_used DATETIME,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )`,

      // Audit log table
      `CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id INTEGER,
        details TEXT, -- JSON object
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      )`
    ];

    for (const table of tables) {
      await this.run(table);
    }

    // Create indexes for better performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_documents_job_id ON documents(job_id)',
      'CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)',
      'CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_email_notifications_user_id ON email_notifications(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)'
    ];

    for (const index of indexes) {
      await this.run(index);
    }
  }

  // Run migrations
  async runMigrations() {
    const migrations = [
      // Add any future schema changes here
    ];

    for (const migration of migrations) {
      try {
        await this.run(migration);
        loggingService.info('Migration applied', { migration });
      } catch (error) {
        loggingService.error('Migration failed', { migration, error: error.message });
      }
    }
  }

  // Run a single SQL statement
  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.run(sql, params, function(err) {
        if (err) {
          loggingService.error('Database run error', { sql, params, error: err.message });
          reject(err);
        } else {
          resolve({
            lastID: this.lastID,
            changes: this.changes
          });
        }
      });
    });
  }

  // Get a single row
  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.get(sql, params, (err, row) => {
        if (err) {
          loggingService.error('Database get error', { sql, params, error: err.message });
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Get multiple rows
  async all(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          loggingService.error('Database all error', { sql, params, error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Execute a transaction
  async transaction(callback) {
    return new Promise(async (resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Database not connected'));
        return;
      }

      try {
        await this.run('BEGIN TRANSACTION');
        
        const result = await callback(this);
        
        await this.run('COMMIT');
        resolve(result);
        
      } catch (error) {
        await this.run('ROLLBACK');
        reject(error);
      }
    });
  }

  // User management methods
  async createUser(userData) {
    const { email, name, company, role = 'user' } = userData;
    
    const sql = `
      INSERT INTO users (email, name, company, role)
      VALUES (?, ?, ?, ?)
    `;
    
    const result = await this.run(sql, [email, name, company, role]);
    
    loggingService.logDatabase('INSERT', 'users', { 
      userId: result.lastID, 
      email, 
      name 
    });
    
    return result.lastID;
  }

  async getUserById(userId) {
    return await this.get('SELECT * FROM users WHERE id = ?', [userId]);
  }

  async getUserByEmail(email) {
    return await this.get('SELECT * FROM users WHERE email = ?', [email]);
  }

  async updateUser(userId, updates) {
    const fields = Object.keys(updates).filter(key => key !== 'id');
    const values = fields.map(field => updates[field]);
    
    const sql = `
      UPDATE users 
      SET ${fields.map(field => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    const result = await this.run(sql, [...values, userId]);
    
    loggingService.logDatabase('UPDATE', 'users', { userId, updates });
    
    return result.changes > 0;
  }

  // Template management methods
  async createTemplate(templateData) {
    const { userId, name, description, filePath, fileType, fileSize, fields } = templateData;
    
    const sql = `
      INSERT INTO templates (user_id, name, description, file_path, file_type, file_size, fields)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    const fieldsJson = JSON.stringify(fields);
    const result = await this.run(sql, [userId, name, description, filePath, fileType, fileSize, fieldsJson]);
    
    loggingService.logDatabase('INSERT', 'templates', { 
      templateId: result.lastID, 
      userId, 
      name 
    });
    
    return result.lastID;
  }

  async getTemplateById(templateId) {
    return await this.get('SELECT * FROM templates WHERE id = ?', [templateId]);
  }

  async getTemplatesByUserId(userId, options = {}) {
    const { status, limit = 50, offset = 0 } = options;
    
    let sql = 'SELECT * FROM templates WHERE user_id = ?';
    const params = [userId];
    
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return await this.all(sql, params);
  }

  async updateTemplate(templateId, updates) {
    const fields = Object.keys(updates).filter(key => key !== 'id');
    const values = fields.map(field => updates[field]);
    
    const sql = `
      UPDATE templates 
      SET ${fields.map(field => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    const result = await this.run(sql, [...values, templateId]);
    
    loggingService.logDatabase('UPDATE', 'templates', { templateId, updates });
    
    return result.changes > 0;
  }

  async deleteTemplate(templateId) {
    const result = await this.run('DELETE FROM templates WHERE id = ?', [templateId]);
    
    loggingService.logDatabase('DELETE', 'templates', { templateId });
    
    return result.changes > 0;
  }

  // Job management methods
  async createJob(jobData) {
    const { userId, templateId, name, totalDocuments, csvDataPath, outputDir, priority, metadata } = jobData;
    
    const sql = `
      INSERT INTO jobs (user_id, template_id, name, total_documents, csv_data_path, output_dir, priority, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    const result = await this.run(sql, [userId, templateId, name, totalDocuments, csvDataPath, outputDir, priority, metadataJson]);
    
    loggingService.logDatabase('INSERT', 'jobs', { 
      jobId: result.lastID, 
      userId, 
      templateId, 
      name 
    });
    
    return result.lastID;
  }

  async getJobById(jobId) {
    return await this.get('SELECT * FROM jobs WHERE id = ?', [jobId]);
  }

  async getJobsByUserId(userId, options = {}) {
    const { status, limit = 50, offset = 0 } = options;
    
    let sql = 'SELECT * FROM jobs WHERE user_id = ?';
    const params = [userId];
    
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return await this.all(sql, params);
  }

  async updateJobStatus(jobId, status, progress = null, errorMessage = null) {
    let sql = 'UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP';
    const params = [status];
    
    if (progress !== null) {
      sql += ', progress = ?';
      params.push(progress);
    }
    
    if (errorMessage !== null) {
      sql += ', error_message = ?';
      params.push(errorMessage);
    }
    
    if (status === 'completed') {
      sql += ', completed_at = CURRENT_TIMESTAMP';
    } else if (status === 'processing') {
      sql += ', started_at = CURRENT_TIMESTAMP';
    }
    
    sql += ' WHERE id = ?';
    params.push(jobId);
    
    const result = await this.run(sql, params);
    
    loggingService.logDatabase('UPDATE', 'jobs', { jobId, status, progress, errorMessage });
    
    return result.changes > 0;
  }

  async updateJobProgress(jobId, progress, completedDocuments, failedDocuments) {
    const sql = `
      UPDATE jobs 
      SET progress = ?, completed_documents = ?, failed_documents = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    const result = await this.run(sql, [progress, completedDocuments, failedDocuments, jobId]);
    
    loggingService.logDatabase('UPDATE', 'jobs', { 
      jobId, 
      progress, 
      completedDocuments, 
      failedDocuments 
    });
    
    return result.changes > 0;
  }

  // Document management methods
  async createDocument(documentData) {
    const { jobId, templateId, inputData, status = 'pending' } = documentData;
    
    const sql = `
      INSERT INTO documents (job_id, template_id, input_data, status)
      VALUES (?, ?, ?, ?)
    `;
    
    const inputDataJson = JSON.stringify(inputData);
    const result = await this.run(sql, [jobId, templateId, inputDataJson, status]);
    
    loggingService.logDatabase('INSERT', 'documents', { 
      documentId: result.lastID, 
      jobId, 
      templateId 
    });
    
    return result.lastID;
  }

  async updateDocument(documentId, updates) {
    const fields = Object.keys(updates).filter(key => key !== 'id');
    const values = fields.map(field => updates[field]);
    
    const sql = `
      UPDATE documents 
      SET ${fields.map(field => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    const result = await this.run(sql, [...values, documentId]);
    
    loggingService.logDatabase('UPDATE', 'documents', { documentId, updates });
    
    return result.changes > 0;
  }

  async getDocumentsByJobId(jobId, options = {}) {
    const { status, limit = 100, offset = 0 } = options;
    
    let sql = 'SELECT * FROM documents WHERE job_id = ?';
    const params = [jobId];
    
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    
    sql += ' ORDER BY created_at ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return await this.all(sql, params);
  }

  // Email notification methods
  async createEmailNotification(notificationData) {
    const { userId, jobId, type, recipient, subject, body } = notificationData;
    
    const sql = `
      INSERT INTO email_notifications (user_id, job_id, type, recipient, subject, body)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const result = await this.run(sql, [userId, jobId, type, recipient, subject, body]);
    
    loggingService.logDatabase('INSERT', 'email_notifications', { 
      notificationId: result.lastID, 
      userId, 
      jobId, 
      type 
    });
    
    return result.lastID;
  }

  async updateEmailNotificationStatus(notificationId, status, errorMessage = null) {
    let sql = 'UPDATE email_notifications SET status = ?, updated_at = CURRENT_TIMESTAMP';
    const params = [status];
    
    if (status === 'sent') {
      sql += ', sent_at = CURRENT_TIMESTAMP';
    }
    
    if (errorMessage !== null) {
      sql += ', error_message = ?';
      params.push(errorMessage);
    }
    
    sql += ' WHERE id = ?';
    params.push(notificationId);
    
    const result = await this.run(sql, params);
    
    loggingService.logDatabase('UPDATE', 'email_notifications', { 
      notificationId, 
      status, 
      errorMessage 
    });
    
    return result.changes > 0;
  }

  // Audit logging methods
  async logAuditEvent(auditData) {
    const { userId, action, resourceType, resourceId, details, ipAddress, userAgent } = auditData;
    
    const sql = `
      INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    const detailsJson = details ? JSON.stringify(details) : null;
    const result = await this.run(sql, [userId, action, resourceType, resourceId, detailsJson, ipAddress, userAgent]);
    
    return result.lastID;
  }

  // Statistics and reporting methods
  async getJobStatistics(userId, timeRange = '30d') {
    const timeRanges = {
      '7d': 'datetime("now", "-7 days")',
      '30d': 'datetime("now", "-30 days")',
      '90d': 'datetime("now", "-90 days")',
      '1y': 'datetime("now", "-1 year")'
    };
    
    const since = timeRanges[timeRange] || timeRanges['30d'];
    
    const sql = `
      SELECT 
        COUNT(*) as total_jobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_jobs,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_jobs,
        AVG(CASE WHEN status = 'completed' THEN progress ELSE NULL END) as avg_progress,
        SUM(total_documents) as total_documents,
        SUM(completed_documents) as total_completed_documents
      FROM jobs 
      WHERE user_id = ? AND created_at >= ${since}
    `;
    
    return await this.get(sql, [userId]);
  }

  async getTemplateUsage(userId, timeRange = '30d') {
    const timeRanges = {
      '7d': 'datetime("now", "-7 days")',
      '30d': 'datetime("now", "-30 days")',
      '90d': 'datetime("now", "-90 days")',
      '1y': 'datetime("now", "-1 year")'
    };
    
    const since = timeRanges[timeRange] || timeRanges['30d'];
    
    const sql = `
      SELECT 
        t.id,
        t.name,
        COUNT(j.id) as usage_count,
        SUM(j.total_documents) as total_documents_generated
      FROM templates t
      LEFT JOIN jobs j ON t.id = j.template_id AND j.created_at >= ${since}
      WHERE t.user_id = ?
      GROUP BY t.id, t.name
      ORDER BY usage_count DESC
    `;
    
    return await this.all(sql, [userId]);
  }

  // Database maintenance methods
  async vacuum() {
    await this.run('VACUUM');
    loggingService.info('Database vacuum completed');
  }

  async analyze() {
    await this.run('ANALYZE');
    loggingService.info('Database analysis completed');
  }

  async getDatabaseStats() {
    const stats = await this.all(`
      SELECT 
        name,
        sql
      FROM sqlite_master 
      WHERE type = 'table'
    `);
    
    const tableStats = {};
    
    for (const table of stats) {
      const countResult = await this.get(`SELECT COUNT(*) as count FROM ${table.name}`);
      tableStats[table.name] = countResult.count;
    }
    
    return {
      tables: stats.length,
      tableStats,
      databasePath: this.dbPath,
      isConnected: this.isConnected
    };
  }

  // Backup database
  async backup(backupPath) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Database not connected'));
        return;
      }

      const backupDb = new sqlite3.Database(backupPath);
      
      this.db.backup(backupDb, (err) => {
        backupDb.close();
        
        if (err) {
          loggingService.error('Database backup failed', { error: err.message, backupPath });
          reject(err);
        } else {
          loggingService.info('Database backup completed', { backupPath });
          resolve();
        }
      });
    });
  }
}

module.exports = new DatabaseService();
