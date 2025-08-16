const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../services/loggingService');

/**
 * Database Connection Manager
 * Handles SQLite connections with pooling, error handling, and migration support
 */
class DatabaseManager {
  constructor(config = {}) {
    this.config = {
      databasePath: config.databasePath || path.join(__dirname, 'database.sqlite'),
      maxConnections: config.maxConnections || 10,
      timeout: config.timeout || 30000,
      verbose: config.verbose || process.env.NODE_ENV === 'development',
      ...config
    };

    this.connections = [];
    this.activeConnections = 0;
    this.maxConnections = this.config.maxConnections;
    this.isInitialized = false;
    this.migrationLock = false;

    // Bind methods
    this.getConnection = this.getConnection.bind(this);
    this.releaseConnection = this.releaseConnection.bind(this);
    this.executeQuery = this.executeQuery.bind(this);
    this.executeTransaction = this.executeTransaction.bind(this);
    this.runMigration = this.runMigration.run.bind(this);
  }

  /**
   * Initialize the database manager
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      logger.info('Initializing database manager', {
        databasePath: this.config.databasePath,
        maxConnections: this.maxConnections
      });

      // Ensure database directory exists
      const dbDir = path.dirname(this.config.databasePath);
      await fs.mkdir(dbDir, { recursive: true });

      // Test initial connection
      const testConnection = await this.createConnection();
      await this.testConnection(testConnection);
      this.releaseConnection(testConnection);

      // Run migrations
      await this.runMigrations();

      this.isInitialized = true;
      logger.info('Database manager initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize database manager', { error: error.message });
      throw new Error(`Database initialization failed: ${error.message}`);
    }
  }

  /**
   * Create a new database connection
   * @returns {Promise<sqlite3.Database>} Database connection
   */
  async createConnection() {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.config.databasePath, (err) => {
        if (err) {
          reject(new Error(`Failed to create database connection: ${err.message}`));
          return;
        }

        // Configure connection
        db.configure('busyTimeout', this.config.timeout);
        
        // Enable foreign keys
        db.run('PRAGMA foreign_keys = ON');
        
        // Enable WAL mode for better concurrency
        db.run('PRAGMA journal_mode = WAL');
        
        // Set synchronous mode
        db.run('PRAGMA synchronous = NORMAL');
        
        // Set cache size
        db.run('PRAGMA cache_size = 10000');
        
        // Set temp store
        db.run('PRAGMA temp_store = MEMORY');

        resolve(db);
      });
    });
  }

  /**
   * Test a database connection
   * @param {sqlite3.Database} connection - Database connection to test
   * @returns {Promise<boolean>} Whether connection is valid
   */
  async testConnection(connection) {
    return new Promise((resolve, reject) => {
      connection.get('SELECT 1 as test', (err, row) => {
        if (err) {
          reject(new Error(`Connection test failed: ${err.message}`));
          return;
        }
        resolve(row && row.test === 1);
      });
    });
  }

  /**
   * Get a database connection from pool
   * @returns {Promise<sqlite3.Database>} Database connection
   */
  async getConnection() {
    if (!this.isInitialized) {
      throw new Error('Database manager not initialized');
    }

    // Check if we have available connections
    if (this.connections.length > 0) {
      const connection = this.connections.pop();
      this.activeConnections++;
      
      // Test connection before returning
      try {
        await this.testConnection(connection);
        return connection;
      } catch (error) {
        // Connection is stale, create a new one
        this.activeConnections--;
        return await this.createConnection();
      }
    }

    // Create new connection if under limit
    if (this.activeConnections < this.maxConnections) {
      this.activeConnections++;
      return await this.createConnection();
    }

    // Wait for a connection to become available
    return new Promise((resolve) => {
      const checkConnection = () => {
        if (this.connections.length > 0) {
          const connection = this.connections.pop();
          this.activeConnections++;
          resolve(connection);
        } else {
          setTimeout(checkConnection, 100);
        }
      };
      checkConnection();
    });
  }

  /**
   * Release a database connection back to pool
   * @param {sqlite3.Database} connection - Database connection to release
   * @returns {void}
   */
  releaseConnection(connection) {
    if (!connection) return;

    this.activeConnections--;

    // Test connection before adding back to pool
    this.testConnection(connection).then(() => {
      if (this.connections.length < this.maxConnections) {
        this.connections.push(connection);
      } else {
        // Close connection if pool is full
        connection.close();
      }
    }).catch(() => {
      // Connection is stale, close it
      connection.close();
    });
  }

  /**
   * Execute a single query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Query results
   */
  async executeQuery(sql, params = []) {
    const connection = await this.getConnection();
    
    try {
      return await new Promise((resolve, reject) => {
        connection.all(sql, params, (err, rows) => {
          if (err) {
            reject(new Error(`Query execution failed: ${err.message}`));
            return;
          }
          resolve(rows || []);
        });
      });
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Execute a single row query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object|null>} Single row result
   */
  async executeQuerySingle(sql, params = []) {
    const connection = await this.getConnection();
    
    try {
      return await new Promise((resolve, reject) => {
        connection.get(sql, params, (err, row) => {
          if (err) {
            reject(new Error(`Query execution failed: ${err.message}`));
            return;
          }
          resolve(row || null);
        });
      });
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Execute a query that doesn't return results (INSERT, UPDATE, DELETE)
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Execution result with lastID and changes
   */
  async executeRun(sql, params = []) {
    const connection = await this.getConnection();
    
    try {
      return await new Promise((resolve, reject) => {
        connection.run(sql, params, function(err) {
          if (err) {
            reject(new Error(`Query execution failed: ${err.message}`));
            return;
          }
          resolve({
            lastID: this.lastID,
            changes: this.changes
          });
        });
      });
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Execute multiple queries in a transaction
   * @param {Function} callback - Function containing transaction logic
   * @returns {Promise<any>} Transaction result
   */
  async executeTransaction(callback) {
    const connection = await this.getConnection();
    
    try {
      return await new Promise((resolve, reject) => {
        connection.serialize(() => {
          // Begin transaction
          connection.run('BEGIN TRANSACTION', (err) => {
            if (err) {
              reject(new Error(`Failed to begin transaction: ${err.message}`));
              return;
            }

            // Execute transaction logic
            Promise.resolve(callback(connection))
              .then((result) => {
                // Commit transaction
                connection.run('COMMIT', (err) => {
                  if (err) {
                    reject(new Error(`Failed to commit transaction: ${err.message}`));
                    return;
                  }
                  resolve(result);
                });
              })
              .catch((error) => {
                // Rollback transaction
                connection.run('ROLLBACK', (err) => {
                  if (err) {
                    logger.error('Failed to rollback transaction', { error: err.message });
                  }
                  reject(error);
                });
              });
          });
        });
      });
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Run database migrations
   * @returns {Promise<void>}
   */
  async runMigrations() {
    if (this.migrationLock) {
      logger.info('Migrations already running, skipping');
      return;
    }

    this.migrationLock = true;

    try {
      logger.info('Starting database migrations');

      // Check if migrations table exists
      const migrationsExist = await this.executeQuerySingle(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
      );

      if (!migrationsExist) {
        // Create migrations table and run initial schema
        logger.info('Creating initial database schema');
        await this.createInitialSchema();
      } else {
        // Check for new migrations
        await this.checkForNewMigrations();
      }

      logger.info('Database migrations completed successfully');

    } catch (error) {
      logger.error('Migration failed', { error: error.message });
      throw new Error(`Migration failed: ${error.message}`);
    } finally {
      this.migrationLock = false;
    }
  }

  /**
   * Create initial database schema
   * @returns {Promise<void>}
   */
  async createInitialSchema() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');

    // Split schema into individual statements
    const statements = schema
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    await this.executeTransaction(async (connection) => {
      for (const statement of statements) {
        await new Promise((resolve, reject) => {
          connection.run(statement, (err) => {
            if (err) {
              reject(new Error(`Schema creation failed: ${err.message}`));
              return;
            }
            resolve();
          });
        });
      }
    });
  }

  /**
   * Check for new migrations
   * @returns {Promise<void>}
   */
  async checkForNewMigrations() {
    // Get current schema version
    const currentVersion = await this.executeQuerySingle(
      'SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1'
    );

    if (!currentVersion) {
      logger.warn('No migration history found, recreating schema');
      await this.createInitialSchema();
      return;
    }

    logger.info(`Current schema version: ${currentVersion.version}`);

    // TODO: Implement migration system for future schema updates
    // This would involve checking for new migration files and applying them
  }

  /**
   * Get database statistics
   * @returns {Promise<Object>} Database statistics
   */
  async getDatabaseStats() {
    try {
      const stats = {};

      // Get table row counts
      const tables = ['batches', 'documents', 'templates', 'users', 'api_logs'];
      for (const table of tables) {
        const result = await this.executeQuerySingle(`SELECT COUNT(*) as count FROM ${table}`);
        stats[table] = result ? result.count : 0;
      }

      // Get database file size
      try {
        const fileStats = await fs.stat(this.config.databasePath);
        stats.fileSize = fileStats.size;
        stats.lastModified = fileStats.mtime;
      } catch (error) {
        stats.fileSize = 'unknown';
        stats.lastModified = 'unknown';
      }

      // Get connection pool stats
      stats.connectionPool = {
        maxConnections: this.maxConnections,
        activeConnections: this.activeConnections,
        availableConnections: this.connections.length,
        totalConnections: this.activeConnections + this.connections.length
      };

      return stats;

    } catch (error) {
      logger.error('Failed to get database stats', { error: error.message });
      throw error;
    }
  }

  /**
   * Perform database maintenance
   * @returns {Promise<Object>} Maintenance results
   */
  async performMaintenance() {
    try {
      logger.info('Starting database maintenance');

      const results = {};

      // VACUUM database
      try {
        await this.executeRun('VACUUM');
        results.vacuum = 'completed';
      } catch (error) {
        results.vacuum = `failed: ${error.message}`;
      }

      // Analyze tables
      try {
        await this.executeRun('ANALYZE');
        results.analyze = 'completed';
      } catch (error) {
        results.analyze = `failed: ${error.message}`;
      }

      // Reindex
      try {
        await this.executeRun('REINDEX');
        results.reindex = 'completed';
      } catch (error) {
        results.reindex = `failed: ${error.message}`;
      }

      // Update statistics
      try {
        await this.executeRun('ANALYZE sqlite_master');
        results.statistics = 'updated';
      } catch (error) {
        results.statistics = `failed: ${error.message}`;
      }

      logger.info('Database maintenance completed', { results });
      return results;

    } catch (error) {
      logger.error('Database maintenance failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Backup database
   * @param {string} backupPath - Path for backup file
   * @returns {Promise<string>} Backup file path
   */
  async backupDatabase(backupPath) {
    try {
      logger.info('Starting database backup', { backupPath });

      const connection = await this.getConnection();
      
      try {
        await new Promise((resolve, reject) => {
          connection.backup(backupPath, (err) => {
            if (err) {
              reject(new Error(`Backup failed: ${err.message}`));
              return;
            }
            resolve();
          });
        });

        logger.info('Database backup completed successfully', { backupPath });
        return backupPath;

      } finally {
        this.releaseConnection(connection);
      }

    } catch (error) {
      logger.error('Database backup failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Close all database connections
   * @returns {Promise<void>}
   */
  async close() {
    try {
      logger.info('Closing database connections');

      // Close all connections in pool
      for (const connection of this.connections) {
        connection.close();
      }
      this.connections = [];

      // Wait for active connections to finish
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds timeout

      while (this.activeConnections > 0 && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      if (this.activeConnections > 0) {
        logger.warn(`Force closing ${this.activeConnections} active connections`);
      }

      this.isInitialized = false;
      logger.info('Database connections closed');

    } catch (error) {
      logger.error('Error closing database connections', { error: error.message });
      throw error;
    }
  }

  /**
   * Health check for database
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      const startTime = Date.now();
      
      // Test basic connectivity
      const testResult = await this.executeQuerySingle('SELECT 1 as test');
      const responseTime = Date.now() - startTime;

      if (!testResult || testResult.test !== 1) {
        return {
          status: 'unhealthy',
          error: 'Database connectivity test failed',
          responseTime
        };
      }

      // Get basic stats
      const stats = await this.getDatabaseStats();

      return {
        status: 'healthy',
        responseTime,
        stats: {
          connectionPool: stats.connectionPool,
          tableCounts: {
            batches: stats.batches,
            documents: stats.documents,
            templates: stats.templates,
            users: stats.users,
            apiLogs: stats.api_logs
          },
          fileSize: stats.fileSize,
          lastModified: stats.lastModified
        }
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        responseTime: 0
      };
    }
  }
}

// Create singleton instance
const databaseManager = new DatabaseManager();

// Handle process termination
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, closing database connections');
  await databaseManager.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, closing database connections');
  await databaseManager.close();
  process.exit(0);
});

module.exports = databaseManager;
