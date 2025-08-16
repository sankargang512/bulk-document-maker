const fs = require('fs-extra');
const path = require('path');
const { format } = require('date-fns');

class LoggingService {
  constructor() {
    this.logsDir = path.join(__dirname, '../logs');
    this.maxLogSize = 10 * 1024 * 1024; // 10MB
    this.maxLogFiles = 5;
    this.logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    this.currentLogLevel = process.env.LOG_LEVEL || 'info';
    
    this.init();
  }

  async init() {
    try {
      await fs.ensureDir(this.logsDir);
      await this.rotateLogsIfNeeded();
      console.log('Logging service initialized');
    } catch (error) {
      console.error('Failed to initialize logging service:', error);
    }
  }

  // Check if we should log at the given level
  shouldLog(level) {
    return this.logLevels[level] <= this.logLevels[this.currentLogLevel];
  }

  // Format log message
  formatLogMessage(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      data,
      pid: process.pid,
      memory: process.memoryUsage()
    };

    return JSON.stringify(logEntry);
  }

  // Write log to file
  async writeLog(level, message, data = {}) {
    if (!this.shouldLog(level)) {
      return;
    }

    try {
      const logFile = path.join(this.logsDir, `${new Date().toISOString().split('T')[0]}.log`);
      const logEntry = this.formatLogMessage(level, message, data);
      
      await fs.appendFile(logFile, logEntry + '\n');
      
      // Check if we need to rotate logs
      await this.rotateLogsIfNeeded();
      
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }

  // Rotate logs if they exceed max size
  async rotateLogsIfNeeded() {
    try {
      const logFile = path.join(this.logsDir, `${new Date().toISOString().split('T')[0]}.log`);
      
      if (await fs.pathExists(logFile)) {
        const stats = await fs.stat(logFile);
        
        if (stats.size > this.maxLogSize) {
          await this.rotateLog(logFile);
        }
      }
    } catch (error) {
      console.error('Failed to rotate logs:', error);
    }
  }

  // Rotate a single log file
  async rotateLog(logFile) {
    try {
      const baseName = path.basename(logFile, '.log');
      const ext = path.extname(logFile);
      
      // Remove oldest log file if we have max files
      const existingFiles = await fs.readdir(this.logsDir);
      const logFiles = existingFiles
        .filter(file => file.startsWith(baseName) && file.endsWith(ext))
        .sort()
        .reverse();
      
      if (logFiles.length >= this.maxLogFiles) {
        const oldestFile = path.join(this.logsDir, logFiles[logFiles.length - 1]);
        await fs.remove(oldestFile);
      }
      
      // Rename current log file
      const timestamp = format(new Date(), 'yyyy-MM-dd-HH-mm-ss');
      const newName = `${baseName}-${timestamp}${ext}`;
      const newPath = path.join(this.logsDir, newName);
      
      await fs.rename(logFile, newPath);
      
      // Create new empty log file
      await fs.writeFile(logFile, '');
      
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  // Log error messages
  async error(message, data = {}) {
    await this.writeLog('error', message, data);
    
    // Also log to console for errors
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, data);
    }
  }

  // Log warning messages
  async warn(message, data = {}) {
    await this.writeLog('warn', message, data);
    
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, data);
    }
  }

  // Log info messages
  async info(message, data = {}) {
    await this.writeLog('info', message, data);
    
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${message}`, data);
    }
  }

  // Log debug messages
  async debug(message, data = {}) {
    await this.writeLog('debug', message, data);
    
    if (this.shouldLog('debug')) {
      console.log(`[DEBUG] ${message}`, data);
    }
  }

  // Log HTTP requests
  async logRequest(req, res, responseTime) {
    const logData = {
      method: req.method,
      url: req.url,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      responseTime,
      statusCode: res.statusCode,
      contentLength: res.get('Content-Length') || 0
    };

    if (res.statusCode >= 400) {
      await this.warn('HTTP Request', logData);
    } else {
      await this.info('HTTP Request', logData);
    }
  }

  // Log HTTP errors
  async logError(error, req = null) {
    const errorData = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      request: req ? {
        method: req.method,
        url: req.url,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
      } : null
    };

    await this.error('Application Error', errorData);
  }

  // Log database operations
  async logDatabase(operation, table, data = {}) {
    const logData = {
      operation,
      table,
      timestamp: new Date().toISOString(),
      ...data
    };

    await this.info('Database Operation', logData);
  }

  // Log job operations
  async logJob(jobId, action, data = {}) {
    const logData = {
      jobId,
      action,
      timestamp: new Date().toISOString(),
      ...data
    };

    await this.info('Job Operation', logData);
  }

  // Log file operations
  async logFile(operation, filePath, data = {}) {
    const logData = {
      operation,
      filePath,
      timestamp: new Date().toISOString(),
      ...data
    };

    await this.info('File Operation', logData);
  }

  // Log email operations
  async logEmail(operation, recipient, data = {}) {
    const logData = {
      operation,
      recipient: recipient.replace(/./g, '*'), // Mask email for privacy
      timestamp: new Date().toISOString(),
      ...data
    };

    await this.info('Email Operation', logData);
  }

  // Get log statistics
  async getLogStats() {
    try {
      const files = await fs.readdir(this.logsDir);
      const logFiles = files.filter(file => file.endsWith('.log'));
      
      let totalSize = 0;
      let totalLines = 0;
      
      for (const file of logFiles) {
        const filePath = path.join(this.logsDir, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
        
        const content = await fs.readFile(filePath, 'utf8');
        totalLines += content.split('\n').filter(line => line.trim()).length;
      }
      
      return {
        totalFiles: logFiles.length,
        totalSize: this.formatBytes(totalSize),
        totalLines,
        maxLogSize: this.formatBytes(this.maxLogSize),
        maxLogFiles: this.maxLogFiles,
        currentLogLevel: this.currentLogLevel
      };
    } catch (error) {
      throw new Error(`Failed to get log stats: ${error.message}`);
    }
  }

  // Format bytes to human readable format
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Search logs
  async searchLogs(query, options = {}) {
    try {
      const { level, startDate, endDate, limit = 100 } = options;
      const files = await fs.readdir(this.logsDir);
      const logFiles = files.filter(file => file.endsWith('.log'));
      
      let results = [];
      
      for (const file of logFiles) {
        const filePath = path.join(this.logsDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const logEntry = JSON.parse(line);
            
            // Apply filters
            if (level && logEntry.level !== level.toUpperCase()) continue;
            if (startDate && new Date(logEntry.timestamp) < new Date(startDate)) continue;
            if (endDate && new Date(logEntry.timestamp) > new Date(endDate)) continue;
            
            // Check if query matches
            const searchText = JSON.stringify(logEntry).toLowerCase();
            if (searchText.includes(query.toLowerCase())) {
              results.push(logEntry);
              
              if (results.length >= limit) {
                break;
              }
            }
          } catch (error) {
            // Skip invalid JSON lines
            continue;
          }
        }
        
        if (results.length >= limit) {
          break;
        }
      }
      
      // Sort by timestamp (newest first)
      results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      return {
        results: results.slice(0, limit),
        total: results.length,
        query,
        filters: { level, startDate, endDate }
      };
      
    } catch (error) {
      throw new Error(`Failed to search logs: ${error.message}`);
    }
  }

  // Clean up old log files
  async cleanupOldLogs(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days
    try {
      const files = await fs.readdir(this.logsDir);
      const logFiles = files.filter(file => file.endsWith('.log'));
      const cutoff = Date.now() - maxAge;
      
      let deletedCount = 0;
      
      for (const file of logFiles) {
        const filePath = path.join(this.logsDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoff) {
          await fs.remove(filePath);
          deletedCount++;
        }
      }
      
      await this.info('Log cleanup completed', { deletedCount, maxAge });
      return deletedCount;
      
    } catch (error) {
      await this.error('Failed to cleanup old logs', { error: error.message });
      throw error;
    }
  }

  // Set log level
  setLogLevel(level) {
    if (this.logLevels.hasOwnProperty(level)) {
      this.currentLogLevel = level;
      this.info('Log level changed', { newLevel: level });
    } else {
      throw new Error(`Invalid log level: ${level}`);
    }
  }

  // Get current log level
  getLogLevel() {
    return this.currentLogLevel;
  }

  // Export logs to file
  async exportLogs(outputPath, options = {}) {
    try {
      const { startDate, endDate, level, format: exportFormat = 'json' } = options;
      const files = await fs.readdir(this.logsDir);
      const logFiles = files.filter(file => file.endsWith('.log'));
      
      let allLogs = [];
      
      for (const file of logFiles) {
        const filePath = path.join(this.logsDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const logEntry = JSON.parse(line);
            
            // Apply filters
            if (level && logEntry.level !== level.toUpperCase()) continue;
            if (startDate && new Date(logEntry.timestamp) < new Date(startDate)) continue;
            if (endDate && new Date(logEntry.timestamp) > new Date(endDate)) continue;
            
            allLogs.push(logEntry);
          } catch (error) {
            continue;
          }
        }
      }
      
      // Sort by timestamp
      allLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      let output;
      if (exportFormat === 'csv') {
        output = this.convertToCSV(allLogs);
      } else {
        output = JSON.stringify(allLogs, null, 2);
      }
      
      await fs.writeFile(outputPath, output);
      
      await this.info('Logs exported', { 
        outputPath, 
        format: exportFormat, 
        count: allLogs.length 
      });
      
      return { success: true, count: allLogs.length, path: outputPath };
      
    } catch (error) {
      await this.error('Failed to export logs', { error: error.message });
      throw error;
    }
  }

  // Convert logs to CSV format
  convertToCSV(logs) {
    if (logs.length === 0) return '';
    
    const headers = Object.keys(logs[0]);
    const csvRows = [headers.join(',')];
    
    for (const log of logs) {
      const row = headers.map(header => {
        const value = log[header];
        if (typeof value === 'object') {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        }
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(row.join(','));
    }
    
    return csvRows.join('\n');
  }
}

module.exports = new LoggingService();
