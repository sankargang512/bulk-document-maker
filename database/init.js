const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');

class DatabaseManager {
  constructor() {
    this.dbPath = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
    this.db = null;
  }

  // Initialize database connection and tables
  async initializeDatabase() {
    try {
      // Ensure database directory exists
      const dbDir = path.dirname(this.dbPath);
      await fs.ensureDir(dbDir);

      // Create database connection
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          throw new Error(`Failed to connect to database: ${err.message}`);
        }
        console.log('📊 Connected to SQLite database');
      });

      // Enable foreign keys
      await this.runQuery('PRAGMA foreign_keys = ON');

      // Create tables
      await this.createTables();

      console.log('✅ Database tables created successfully');
      return true;

    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  // Create all required tables
  async createTables() {
    const tables = [
      this.createTemplatesTable(),
      this.createDocumentsTable(),
      this.createUsersTable(),
      this.createTemplateFieldsTable(),
      this.createGenerationHistoryTable(),
      this.createEmailLogsTable()
    ];

    await Promise.all(tables);
  }

  // Create templates table
  async createTemplatesTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        file_type TEXT NOT NULL,
        word_count INTEGER,
        paragraph_count INTEGER,
        complexity_score REAL,
        placeholders_count INTEGER,
        structure_data TEXT,
        validation_data TEXT,
        category TEXT,
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT,
        is_active BOOLEAN DEFAULT 1,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `;
    await this.runQuery(sql);
  }

  // Create documents table
  async createDocumentsTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        status TEXT DEFAULT 'generated',
        metadata TEXT,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT,
        batch_id TEXT,
        FOREIGN KEY (template_id) REFERENCES templates(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `;
    await this.runQuery(sql);
  }

  // Create users table
  async createUsersTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        api_key TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      )
    `;
    await this.runQuery(sql);
  }

  // Create template fields table
  async createTemplateFieldsTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS template_fields (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        field_name TEXT NOT NULL,
        field_type TEXT NOT NULL,
        is_required BOOLEAN DEFAULT 0,
        default_value TEXT,
        validation_rules TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (template_id) REFERENCES templates(id)
      )
    `;
    await this.runQuery(sql);
  }

  // Create generation history table
  async createGenerationHistoryTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS generation_history (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        total_documents INTEGER NOT NULL,
        successful_documents INTEGER DEFAULT 0,
        failed_documents INTEGER DEFAULT 0,
        processing_time INTEGER,
        status TEXT DEFAULT 'processing',
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        created_by TEXT,
        metadata TEXT,
        FOREIGN KEY (template_id) REFERENCES templates(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `;
    await this.runQuery(sql);
  }

  // Create email logs table
  async createEmailLogsTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS email_logs (
        id TEXT PRIMARY KEY,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        template_id TEXT,
        document_id TEXT,
        status TEXT NOT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        error_message TEXT,
        metadata TEXT,
        FOREIGN KEY (template_id) REFERENCES templates(id),
        FOREIGN KEY (document_id) REFERENCES documents(id)
      )
    `;
    await this.runQuery(sql);
  }

  // Create indexes for better performance
  async createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_templates_created_by ON templates(created_by)',
      'CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category)',
      'CREATE INDEX IF NOT EXISTS idx_templates_created_at ON templates(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_documents_template_id ON documents(template_id)',
      'CREATE INDEX IF NOT EXISTS idx_documents_batch_id ON documents(batch_id)',
      'CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)',
      'CREATE INDEX IF NOT EXISTS idx_template_fields_template_id ON template_fields(template_id)',
      'CREATE INDEX IF NOT EXISTS idx_generation_history_batch_id ON generation_history(batch_id)',
      'CREATE INDEX IF NOT EXISTS idx_generation_history_status ON generation_history(status)',
      'CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient)',
      'CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status)'
    ];

    for (const index of indexes) {
      await this.runQuery(index);
    }
  }

  // Run a SQL query
  runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  // Get a single row
  getRow(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Get multiple rows
  getAll(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        } else {
          console.log('📊 Database connection closed');
        }
      });
    }
  }
}

// Initialize database function
async function initializeDatabase() {
  const dbManager = new DatabaseManager();
  try {
    await dbManager.initializeDatabase();
    await dbManager.createIndexes();
    console.log('✅ Database initialization completed successfully');
    return dbManager;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

module.exports = {
  DatabaseManager,
  initializeDatabase
};
