const fs = require('fs').promises;
const path = require('path');
const Batch = require('../models/Batch');
const Document = require('../models/Document');
const Template = require('../models/Template');
const databaseManager = require('../database/connection');
const logger = require('../services/loggingService');

/**
 * Cleanup Jobs Manager
 * Handles automatic cleanup of old data, temporary files, and database maintenance
 */
class CleanupManager {
  constructor(config = {}) {
    this.config = {
      // Cleanup intervals (in milliseconds)
      batchCleanupInterval: config.batchCleanupInterval || 24 * 60 * 60 * 1000, // 24 hours
      fileCleanupInterval: config.fileCleanupInterval || 12 * 60 * 60 * 1000, // 12 hours
      databaseMaintenanceInterval: config.databaseMaintenanceInterval || 7 * 24 * 60 * 60 * 1000, // 7 days
      
      // Cleanup thresholds
      batchRetentionDays: config.batchRetentionDays || 7,
      tempFileRetentionHours: config.tempFileRetentionHours || 24,
      logRetentionDays: config.logRetentionDays || 30,
      
      // File paths
      tempDir: config.tempDir || path.join(process.cwd(), 'temp'),
      generatedDir: config.generatedDir || path.join(process.cwd(), 'generated'),
      uploadsDir: config.uploadsDir || path.join(process.cwd(), 'uploads'),
      
      // Performance settings
      batchSize: config.batchSize || 100,
      maxConcurrentOperations: config.maxConcurrentOperations || 5,
      
      ...config
    };

    this.isRunning = false;
    this.lastCleanup = {
      batches: null,
      files: null,
      database: null
    };
    this.cleanupStats = {
      totalBatchesCleaned: 0,
      totalFilesCleaned: 0,
      totalSpaceFreed: 0,
      lastRun: null
    };

    // Bind methods
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.runBatchCleanup = this.runBatchCleanup.bind(this);
    this.runFileCleanup = this.runFileCleanup.bind(this);
    this.runDatabaseMaintenance = this.runDatabaseMaintenance.bind(this);
    this.runFullCleanup = this.runFullCleanup.bind(this);
  }

  /**
   * Start the cleanup manager
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Cleanup manager is already running');
      return;
    }

    try {
      logger.info('Starting cleanup manager', {
        batchRetentionDays: this.config.batchRetentionDays,
        tempFileRetentionHours: this.config.tempFileRetentionHours,
        logRetentionDays: this.config.logRetentionDays
      });

      this.isRunning = true;

      // Schedule cleanup jobs
      this.scheduleCleanupJobs();

      // Run initial cleanup
      await this.runFullCleanup();

      logger.info('Cleanup manager started successfully');

    } catch (error) {
      logger.error('Failed to start cleanup manager', { error: error.message });
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the cleanup manager
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      logger.warn('Cleanup manager is not running');
      return;
    }

    try {
      logger.info('Stopping cleanup manager');
      this.isRunning = false;

      // Clear all intervals
      if (this.batchCleanupTimer) {
        clearInterval(this.batchCleanupTimer);
        this.batchCleanupTimer = null;
      }

      if (this.fileCleanupTimer) {
        clearInterval(this.fileCleanupTimer);
        this.fileCleanupTimer = null;
      }

      if (this.databaseMaintenanceTimer) {
        clearInterval(this.databaseMaintenanceTimer);
        this.databaseMaintenanceTimer = null;
      }

      logger.info('Cleanup manager stopped successfully');

    } catch (error) {
      logger.error('Failed to stop cleanup manager', { error: error.message });
      throw error;
    }
  }

  /**
   * Schedule cleanup jobs
   * @private
   */
  scheduleCleanupJobs() {
    // Schedule batch cleanup
    this.batchCleanupTimer = setInterval(async () => {
      if (this.isRunning) {
        try {
          await this.runBatchCleanup();
        } catch (error) {
          logger.error('Scheduled batch cleanup failed', { error: error.message });
        }
      }
    }, this.config.batchCleanupInterval);

    // Schedule file cleanup
    this.fileCleanupTimer = setInterval(async () => {
      if (this.isRunning) {
        try {
          await this.runFileCleanup();
        } catch (error) {
          logger.error('Scheduled file cleanup failed', { error: error.message });
        }
      }
    }, this.config.fileCleanupInterval);

    // Schedule database maintenance
    this.databaseMaintenanceTimer = setInterval(async () => {
      if (this.isRunning) {
        try {
          await this.runDatabaseMaintenance();
        } catch (error) {
          logger.error('Scheduled database maintenance failed', { error: error.message });
        }
      }
    }, this.config.databaseMaintenanceInterval);

    logger.info('Cleanup jobs scheduled', {
      batchCleanup: `${this.config.batchCleanupInterval / (60 * 60 * 1000)} hours`,
      fileCleanup: `${this.config.fileCleanupInterval / (60 * 60 * 1000)} hours`,
      databaseMaintenance: `${this.config.databaseMaintenanceInterval / (24 * 60 * 60 * 1000)} days`
    });
  }

  /**
   * Run full cleanup (all cleanup operations)
   * @returns {Promise<Object>} Cleanup results
   */
  async runFullCleanup() {
    try {
      logger.info('Starting full cleanup');

      const startTime = Date.now();
      const results = {};

      // Run batch cleanup
      try {
        results.batches = await this.runBatchCleanup();
      } catch (error) {
        results.batches = { error: error.message };
        logger.error('Batch cleanup failed during full cleanup', { error: error.message });
      }

      // Run file cleanup
      try {
        results.files = await this.runFileCleanup();
      } catch (error) {
        results.files = { error: error.message };
        logger.error('File cleanup failed during full cleanup', { error: error.message });
      }

      // Run database maintenance
      try {
        results.database = await this.runDatabaseMaintenance();
      } catch (error) {
        results.database = { error: error.message };
        logger.error('Database maintenance failed during full cleanup', { error: error.message });
      }

      const totalTime = Date.now() - startTime;
      this.cleanupStats.lastRun = new Date();

      logger.info('Full cleanup completed', {
        totalTime: `${totalTime}ms`,
        results
      });

      return {
        success: true,
        totalTime,
        results,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Full cleanup failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Clean up old batches
   * @param {Object} options - Cleanup options
   * @returns {Promise<Object>} Cleanup results
   */
  async runBatchCleanup(options = {}) {
    try {
      const { dryRun = false, daysOld = this.config.batchRetentionDays } = options;
      
      logger.info('Starting batch cleanup', { dryRun, daysOld });

      const startTime = Date.now();

      // Get old batches for cleanup
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const oldBatches = await Batch.findAll({
        startDate: new Date(0), // From beginning
        endDate: cutoffDate,
        status: ['completed', 'failed', 'cancelled'],
        limit: 1000 // Reasonable limit
      });

      if (oldBatches.batches.length === 0) {
        logger.info('No old batches found for cleanup');
        return {
          success: true,
          batchesProcessed: 0,
          batchesDeleted: 0,
          spaceFreed: 0,
          timeTaken: Date.now() - startTime
        };
      }

      logger.info(`Found ${oldBatches.batches.length} old batches for cleanup`);

      if (dryRun) {
        return {
          success: true,
          dryRun: true,
          batchesProcessed: oldBatches.batches.length,
          batchesToDelete: oldBatches.batches.length,
          estimatedSpaceFreed: this.estimateBatchSpace(oldBatches.batches),
          timeTaken: Date.now() - startTime
        };
      }

      // Perform actual cleanup
      let deletedCount = 0;
      let spaceFreed = 0;
      let errorCount = 0;

      for (const batch of oldBatches.batches) {
        try {
          // Delete associated documents first
          const documents = await Document.findByBatchId(batch.id);
          
          for (const doc of documents) {
            if (doc.filePath) {
              try {
                await this.deleteFile(doc.filePath);
                spaceFreed += doc.fileSize || 0;
              } catch (error) {
                logger.warn('Failed to delete document file', { 
                  filePath: doc.filePath, 
                  error: error.message 
                });
              }
            }
          }

          // Delete batch ZIP file if exists
          if (batch.zipPath) {
            try {
              await this.deleteFile(batch.zipPath);
              // Estimate ZIP file size (rough calculation)
              spaceFreed += (batch.totalDocuments || 0) * 50000; // 50KB per document estimate
            } catch (error) {
              logger.warn('Failed to delete batch ZIP file', { 
                zipPath: batch.zipPath, 
                error: error.message 
              });
            }
          }

          // Delete batch from database
          await Batch.delete(batch.id);
          deletedCount++;

          // Update cleanup stats
          this.cleanupStats.totalBatchesCleaned++;
          this.cleanupStats.totalSpaceFreed += spaceFreed;

        } catch (error) {
          errorCount++;
          logger.error('Failed to cleanup batch', { 
            batchId: batch.id, 
            error: error.message 
          });
        }
      }

      this.lastCleanup.batches = new Date();

      const results = {
        success: true,
        batchesProcessed: oldBatches.batches.length,
        batchesDeleted: deletedCount,
        spaceFreed,
        errorCount,
        timeTaken: Date.now() - startTime
      };

      logger.info('Batch cleanup completed', results);
      return results;

    } catch (error) {
      logger.error('Batch cleanup failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Clean up temporary and old files
   * @param {Object} options - Cleanup options
   * @returns {Promise<Object>} Cleanup results
   */
  async runFileCleanup(options = {}) {
    try {
      const { dryRun = false, hoursOld = this.config.tempFileRetentionHours } = options;
      
      logger.info('Starting file cleanup', { dryRun, hoursOld });

      const startTime = Date.now();
      const cutoffTime = Date.now() - (hoursOld * 60 * 60 * 1000);

      let totalFiles = 0;
      let deletedFiles = 0;
      let spaceFreed = 0;
      let errorCount = 0;

      // Clean up temp directory
      const tempResults = await this.cleanupDirectory(
        this.config.tempDir, 
        cutoffTime, 
        dryRun
      );
      totalFiles += tempResults.totalFiles;
      deletedFiles += tempResults.deletedFiles;
      spaceFreed += tempResults.spaceFreed;
      errorCount += tempResults.errorCount;

      // Clean up generated directory (older files)
      const generatedResults = await this.cleanupDirectory(
        this.config.generatedDir, 
        cutoffTime * 2, // Keep generated files longer
        dryRun
      );
      totalFiles += generatedResults.totalFiles;
      deletedFiles += generatedResults.deletedFiles;
      spaceFreed += generatedResults.spaceFreed;
      errorCount += generatedResults.errorCount;

      // Clean up uploads directory (older files)
      const uploadsResults = await this.cleanupDirectory(
        this.config.uploadsDir, 
        cutoffTime * 3, // Keep uploads even longer
        dryRun
      );
      totalFiles += uploadsResults.totalFiles;
      deletedFiles += uploadsResults.deletedFiles;
      spaceFreed += uploadsResults.spaceFreed;
      errorCount += uploadsResults.errorCount;

      this.lastCleanup.files = new Date();

      const results = {
        success: true,
        dryRun,
        totalFiles,
        deletedFiles,
        spaceFreed,
        errorCount,
        directories: {
          temp: tempResults,
          generated: generatedResults,
          uploads: uploadsResults
        },
        timeTaken: Date.now() - startTime
      };

      logger.info('File cleanup completed', results);
      return results;

    } catch (error) {
      logger.error('File cleanup failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Clean up a specific directory
   * @param {string} dirPath - Directory path
   * @param {number} cutoffTime - Cutoff time in milliseconds
   * @param {boolean} dryRun - Whether to perform actual deletion
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanupDirectory(dirPath, cutoffTime, dryRun = false) {
    try {
      if (!await this.directoryExists(dirPath)) {
        return {
          totalFiles: 0,
          deletedFiles: 0,
          spaceFreed: 0,
          errorCount: 0
        };
      }

      const files = await this.getDirectoryFiles(dirPath);
      const oldFiles = files.filter(file => file.mtime.getTime() < cutoffTime);

      if (oldFiles.length === 0) {
        return {
          totalFiles: files.length,
          deletedFiles: 0,
          spaceFreed: 0,
          errorCount: 0
        };
      }

      let deletedFiles = 0;
      let spaceFreed = 0;
      let errorCount = 0;

      for (const file of oldFiles) {
        try {
          if (!dryRun) {
            await this.deleteFile(file.path);
            deletedFiles++;
            spaceFreed += file.size || 0;
          } else {
            deletedFiles++;
            spaceFreed += file.size || 0;
          }
        } catch (error) {
          errorCount++;
          logger.warn('Failed to delete file during cleanup', { 
            filePath: file.path, 
            error: error.message 
          });
        }
      }

      return {
        totalFiles: files.length,
        deletedFiles,
        spaceFreed,
        errorCount
      };

    } catch (error) {
      logger.error('Directory cleanup failed', { dirPath, error: error.message });
      return {
        totalFiles: 0,
        deletedFiles: 0,
        spaceFreed: 0,
        errorCount: 1
      };
    }
  }

  /**
   * Run database maintenance
   * @param {Object} options - Maintenance options
   * @returns {Promise<Object>} Maintenance results
   */
  async runDatabaseMaintenance(options = {}) {
    try {
      const { dryRun = false } = options;
      
      logger.info('Starting database maintenance', { dryRun });

      const startTime = Date.now();

      if (dryRun) {
        return {
          success: true,
          dryRun: true,
          operations: ['VACUUM', 'ANALYZE', 'REINDEX'],
          estimatedTime: '5-10 minutes',
          timeTaken: Date.now() - startTime
        };
      }

      // Perform database maintenance
      const results = await databaseManager.performMaintenance();

      this.lastCleanup.database = new Date();

      const maintenanceResults = {
        success: true,
        operations: results,
        timeTaken: Date.now() - startTime
      };

      logger.info('Database maintenance completed', maintenanceResults);
      return maintenanceResults;

    } catch (error) {
      logger.error('Database maintenance failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get cleanup statistics
   * @returns {Object} Cleanup statistics
   */
  getCleanupStats() {
    return {
      ...this.cleanupStats,
      lastCleanup: this.lastCleanup,
      isRunning: this.isRunning,
      config: {
        batchRetentionDays: this.config.batchRetentionDays,
        tempFileRetentionHours: this.config.tempFileRetentionHours,
        logRetentionDays: this.config.logRetentionDays
      }
    };
  }

  /**
   * Estimate space that would be freed by batch cleanup
   * @param {Array} batches - Array of batches
   * @returns {number} Estimated space in bytes
   */
  estimateBatchSpace(batches) {
    let estimatedSpace = 0;

    for (const batch of batches) {
      // Estimate document file sizes
      estimatedSpace += (batch.totalDocuments || 0) * 100000; // 100KB per document
      
      // Estimate ZIP file size
      if (batch.zipPath) {
        estimatedSpace += (batch.totalDocuments || 0) * 50000; // 50KB per document in ZIP
      }
    }

    return estimatedSpace;
  }

  /**
   * Check if directory exists
   * @param {string} dirPath - Directory path
   * @returns {Promise<boolean>} Whether directory exists
   */
  async directoryExists(dirPath) {
    try {
      await fs.access(dirPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all files in a directory recursively
   * @param {string} dirPath - Directory path
   * @returns {Promise<Array>} Array of file objects
   */
  async getDirectoryFiles(dirPath) {
    try {
      const files = [];
      
      const readDir = async (currentPath) => {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);
          
          if (entry.isDirectory()) {
            await readDir(fullPath);
          } else if (entry.isFile()) {
            try {
              const stats = await fs.stat(fullPath);
              files.push({
                path: fullPath,
                name: entry.name,
                size: stats.size,
                mtime: stats.mtime
              });
            } catch (error) {
              logger.warn('Failed to get file stats', { filePath: fullPath, error: error.message });
            }
          }
        }
      };

      await readDir(dirPath);
      return files;

    } catch (error) {
      logger.error('Failed to get directory files', { dirPath, error: error.message });
      return [];
    }
  }

  /**
   * Delete a file safely
   * @param {string} filePath - File path to delete
   * @returns {Promise<void>}
   */
  async deleteFile(filePath) {
    try {
      await fs.unlink(filePath);
      logger.debug('File deleted successfully', { filePath });
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, which is fine
        logger.debug('File already deleted', { filePath });
      } else {
        throw error;
      }
    }
  }

  /**
   * Get cleanup status
   * @returns {Object} Cleanup status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastCleanup: this.lastCleanup,
      nextScheduled: {
        batchCleanup: this.lastCleanup.batches ? 
          new Date(this.lastCleanup.batches.getTime() + this.config.batchCleanupInterval) : null,
        fileCleanup: this.lastCleanup.files ? 
          new Date(this.lastCleanup.files.getTime() + this.config.fileCleanupInterval) : null,
        databaseMaintenance: this.lastCleanup.database ? 
          new Date(this.lastCleanup.database.getTime() + this.config.databaseMaintenanceInterval) : null
      },
      stats: this.cleanupStats
    };
  }
}

// Create singleton instance
const cleanupManager = new CleanupManager();

// Handle process termination
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, stopping cleanup manager');
  await cleanupManager.stop();
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, stopping cleanup manager');
  await cleanupManager.stop();
});

module.exports = cleanupManager;
