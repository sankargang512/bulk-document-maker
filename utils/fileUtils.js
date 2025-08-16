const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const mime = require('mime-types');
const archiver = require('archiver');
const { createReadStream, createWriteStream } = require('fs');
const loggingService = require('../services/loggingService');

class FileUtils {
  constructor() {
    this.uploadDir = path.join(__dirname, '../uploads');
    this.tempDir = path.join(__dirname, '../temp');
    this.generatedDir = path.join(__dirname, '../generated');
    this.maxFileSize = 100 * 1024 * 1024; // 100MB
    this.allowedFileTypes = {
      templates: ['.docx', '.doc', '.pdf', '.html', '.txt'],
      csv: ['.csv'],
      images: ['.jpg', '.jpeg', '.png', '.gif', '.svg'],
      documents: ['.pdf', '.docx', '.doc', '.txt']
    };
    
    this.init();
  }

  async init() {
    try {
      await fs.ensureDir(this.uploadDir);
      await fs.ensureDir(this.tempDir);
      await fs.ensureDir(this.generatedDir);
      
      // Create subdirectories
      await fs.ensureDir(path.join(this.uploadDir, 'templates'));
      await fs.ensureDir(path.join(this.uploadDir, 'csv'));
      await fs.ensureDir(path.join(this.generatedDir, 'documents'));
      await fs.ensureDir(path.join(this.generatedDir, 'archives'));
      
      loggingService.info('File utilities service initialized');
    } catch (error) {
      loggingService.error('Failed to initialize file utilities service', { error: error.message });
      throw error;
    }
  }

  // Generate unique filename
  generateUniqueFilename(originalName, prefix = '') {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(originalName);
    const name = path.basename(originalName, ext);
    
    return `${prefix}${name}_${timestamp}_${random}${ext}`;
  }

  // Validate file type
  validateFileType(filePath, allowedTypes) {
    const ext = path.extname(filePath).toLowerCase();
    return allowedTypes.includes(ext);
  }

  // Validate file size
  validateFileSize(filePath, maxSize = this.maxFileSize) {
    try {
      const stats = fs.statSync(filePath);
      return stats.size <= maxSize;
    } catch (error) {
      return false;
    }
  }

  // Get file information
  async getFileInfo(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      
      return {
        name: path.basename(filePath),
        path: filePath,
        size: stats.size,
        sizeFormatted: this.formatBytes(stats.size),
        type: mime.lookup(ext) || 'application/octet-stream',
        extension: ext,
        created: stats.birthtime,
        modified: stats.mtime,
        isDirectory: stats.isDirectory(),
        permissions: stats.mode.toString(8)
      };
    } catch (error) {
      loggingService.error('Failed to get file info', { filePath, error: error.message });
      throw error;
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

  // Copy file with validation
  async copyFile(sourcePath, destPath, options = {}) {
    try {
      const { overwrite = false, validate = true } = options;
      
      // Validate source file
      if (validate) {
        if (!(await fs.pathExists(sourcePath))) {
          throw new Error(`Source file does not exist: ${sourcePath}`);
        }
        
        if (!(await fs.stat(sourcePath)).isFile()) {
          throw new Error(`Source path is not a file: ${sourcePath}`);
        }
      }
      
      // Ensure destination directory exists
      await fs.ensureDir(path.dirname(destPath));
      
      // Check if destination exists
      if (await fs.pathExists(destPath) && !overwrite) {
        throw new Error(`Destination file already exists: ${destPath}`);
      }
      
      await fs.copy(sourcePath, destPath);
      
      loggingService.logFile('COPY', sourcePath, { destPath, overwrite });
      
      return destPath;
    } catch (error) {
      loggingService.error('Failed to copy file', { sourcePath, destPath, error: error.message });
      throw error;
    }
  }

  // Move file with validation
  async moveFile(sourcePath, destPath, options = {}) {
    try {
      const { overwrite = false, validate = true } = options;
      
      // Validate source file
      if (validate) {
        if (!(await fs.pathExists(sourcePath))) {
          throw new Error(`Source file does not exist: ${sourcePath}`);
        }
        
        if (!(await fs.stat(sourcePath)).isFile()) {
          throw new Error(`Source path is not a file: ${sourcePath}`);
        }
      }
      
      // Ensure destination directory exists
      await fs.ensureDir(path.dirname(destPath));
      
      // Check if destination exists
      if (await fs.pathExists(destPath) && !overwrite) {
        throw new Error(`Destination file already exists: ${destPath}`);
      }
      
      await fs.move(sourcePath, destPath);
      
      loggingService.logFile('MOVE', sourcePath, { destPath, overwrite });
      
      return destPath;
    } catch (error) {
      loggingService.error('Failed to move file', { sourcePath, destPath, error: error.message });
      throw error;
    }
  }

  // Delete file with validation
  async deleteFile(filePath, options = {}) {
    try {
      const { validate = true, softDelete = false } = options;
      
      if (validate && !(await fs.pathExists(filePath))) {
        return false; // File doesn't exist, consider it already deleted
      }
      
      if (softDelete) {
        // Move to trash directory instead of deleting
        const trashDir = path.join(this.tempDir, 'trash');
        await fs.ensureDir(trashDir);
        
        const trashPath = path.join(trashDir, this.generateUniqueFilename(path.basename(filePath), 'deleted_'));
        await fs.move(filePath, trashPath);
        
        loggingService.logFile('SOFT_DELETE', filePath, { trashPath });
        return true;
      } else {
        await fs.remove(filePath);
        loggingService.logFile('DELETE', filePath);
        return true;
      }
    } catch (error) {
      loggingService.error('Failed to delete file', { filePath, error: error.message });
      throw error;
    }
  }

  // Create directory structure
  async createDirectory(dirPath, options = {}) {
    try {
      const { recursive = true, mode = 0o755 } = options;
      
      await fs.ensureDir(dirPath, mode);
      
      loggingService.logFile('CREATE_DIR', dirPath, { recursive, mode });
      
      return dirPath;
    } catch (error) {
      loggingService.error('Failed to create directory', { dirPath, error: error.message });
      throw error;
    }
  }

  // List directory contents
  async listDirectory(dirPath, options = {}) {
    try {
      const { recursive = false, includeHidden = false, filter = null } = options;
      
      if (!(await fs.pathExists(dirPath))) {
        throw new Error(`Directory does not exist: ${dirPath}`);
      }
      
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${dirPath}`);
      }
      
      let files = [];
      
      if (recursive) {
        files = await this.walkDirectory(dirPath, { includeHidden, filter });
      } else {
        const items = await fs.readdir(dirPath);
        
        for (const item of items) {
          if (!includeHidden && item.startsWith('.')) continue;
          
          const itemPath = path.join(dirPath, item);
          const itemStats = await fs.stat(itemPath);
          
          if (filter && !filter(itemPath, itemStats)) continue;
          
          files.push({
            name: item,
            path: itemPath,
            isDirectory: itemStats.isDirectory(),
            size: itemStats.size,
            sizeFormatted: this.formatBytes(itemStats.size),
            created: itemStats.birthtime,
            modified: itemStats.mtime
          });
        }
      }
      
      return files;
    } catch (error) {
      loggingService.error('Failed to list directory', { dirPath, error: error.message });
      throw error;
    }
  }

  // Recursively walk directory
  async walkDirectory(dirPath, options = {}) {
    const { includeHidden = false, filter = null, maxDepth = 10 } = options;
    const files = [];
    
    const walk = async (currentPath, depth = 0) => {
      if (depth > maxDepth) return;
      
      try {
        const items = await fs.readdir(currentPath);
        
        for (const item of items) {
          if (!includeHidden && item.startsWith('.')) continue;
          
          const itemPath = path.join(currentPath, item);
          const itemStats = await fs.stat(itemPath);
          
          if (filter && !filter(itemPath, itemStats)) continue;
          
          files.push({
            name: item,
            path: itemPath,
            isDirectory: itemStats.isDirectory(),
            size: itemStats.size,
            sizeFormatted: this.formatBytes(itemStats.size),
            created: itemStats.birthtime,
            modified: itemStats.mtime,
            depth
          });
          
          if (itemStats.isDirectory()) {
            await walk(itemPath, depth + 1);
          }
        }
      } catch (error) {
        // Skip directories we can't access
        loggingService.warn('Cannot access directory during walk', { dirPath: currentPath, error: error.message });
      }
    };
    
    await walk(dirPath);
    return files;
  }

  // Create archive (ZIP) from multiple files
  async createArchive(files, outputPath, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const { format = 'zip', level = 6, comment = '' } = options;
        
        // Ensure output directory exists
        await fs.ensureDir(path.dirname(outputPath));
        
        const output = createWriteStream(outputPath);
        const archive = archiver(format, {
          zlib: { level }
        });
        
        output.on('close', () => {
          loggingService.logFile('CREATE_ARCHIVE', outputPath, { 
            format, 
            totalSize: archive.pointer(),
            totalSizeFormatted: this.formatBytes(archive.pointer())
          });
          resolve(outputPath);
        });
        
        archive.on('error', (err) => {
          reject(err);
        });
        
        archive.pipe(output);
        
        // Add files to archive
        for (const file of files) {
          if (await fs.pathExists(file.path)) {
            const stats = await fs.stat(file.path);
            if (stats.isFile()) {
              archive.file(file.path, { name: file.name || path.basename(file.path) });
            } else if (stats.isDirectory()) {
              archive.directory(file.path, file.name || path.basename(file.path));
            }
          }
        }
        
        if (comment) {
          archive.comment(comment);
        }
        
        archive.finalize();
        
      } catch (error) {
        loggingService.error('Failed to create archive', { files, outputPath, error: error.message });
        reject(error);
      }
    });
  }

  // Extract archive
  async extractArchive(archivePath, extractPath, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const { overwrite = false, strip = 0 } = options;
        
        if (!(await fs.pathExists(archivePath))) {
          throw new Error(`Archive file does not exist: ${archivePath}`);
        }
        
        // Ensure extract directory exists
        await fs.ensureDir(extractPath);
        
        const extract = require('extract-zip');
        
        await extract(archivePath, { 
          dir: extractPath,
          onEntry: (entry) => {
            // Handle strip option
            if (strip > 0) {
              const parts = entry.fileName.split('/');
              if (parts.length > strip) {
                entry.fileName = parts.slice(strip).join('/');
              }
            }
          }
        });
        
        loggingService.logFile('EXTRACT_ARCHIVE', archivePath, { extractPath, overwrite, strip });
        
        resolve(extractPath);
        
      } catch (error) {
        loggingService.error('Failed to extract archive', { archivePath, extractPath, error: error.message });
        reject(error);
      }
    });
  }

  // Calculate directory size
  async calculateDirectorySize(dirPath) {
    try {
      let totalSize = 0;
      let fileCount = 0;
      let dirCount = 0;
      
      const walk = async (currentPath) => {
        try {
          const items = await fs.readdir(currentPath);
          
          for (const item of items) {
            const itemPath = path.join(currentPath, item);
            const itemStats = await fs.stat(itemPath);
            
            if (itemStats.isDirectory()) {
              dirCount++;
              await walk(itemPath);
            } else {
              fileCount++;
              totalSize += itemStats.size;
            }
          }
        } catch (error) {
          // Skip directories we can't access
          loggingService.warn('Cannot access directory during size calculation', { 
            dirPath: currentPath, 
            error: error.message 
          });
        }
      };
      
      await walk(dirPath);
      
      return {
        size: totalSize,
        sizeFormatted: this.formatBytes(totalSize),
        fileCount,
        dirCount
      };
      
    } catch (error) {
      loggingService.error('Failed to calculate directory size', { dirPath, error: error.message });
      throw error;
    }
  }

  // Clean up temporary files
  async cleanupTempFiles(options = {}) {
    try {
      const { maxAge = 24 * 60 * 60 * 1000, dryRun = false } = options; // Default: 24 hours
      const cutoff = Date.now() - maxAge;
      
      const tempFiles = await this.listDirectory(this.tempDir, { recursive: true });
      let deletedCount = 0;
      let deletedSize = 0;
      
      for (const file of tempFiles) {
        if (file.modified.getTime() < cutoff) {
          if (!dryRun) {
            await this.deleteFile(file.path);
            deletedCount++;
            deletedSize += file.size;
          } else {
            deletedCount++;
            deletedSize += file.size;
          }
        }
      }
      
      loggingService.info('Temp files cleanup completed', { 
        deletedCount, 
        deletedSize: this.formatBytes(deletedSize),
        dryRun 
      });
      
      return { deletedCount, deletedSize, deletedSizeFormatted: this.formatBytes(deletedSize) };
      
    } catch (error) {
      loggingService.error('Failed to cleanup temp files', { error: error.message });
      throw error;
    }
  }

  // Validate upload file
  async validateUploadFile(filePath, fileType, options = {}) {
    try {
      const { maxSize = this.maxFileSize, allowedTypes = null } = options;
      
      // Check if file exists
      if (!(await fs.pathExists(filePath))) {
        throw new Error('File does not exist');
      }
      
      // Check file size
      if (!this.validateFileSize(filePath, maxSize)) {
        throw new Error(`File size exceeds maximum allowed size of ${this.formatBytes(maxSize)}`);
      }
      
      // Check file type
      const types = allowedTypes || this.allowedFileTypes[fileType] || [];
      if (types.length > 0 && !this.validateFileType(filePath, types)) {
        throw new Error(`File type not allowed. Allowed types: ${types.join(', ')}`);
      }
      
      // Get file info
      const fileInfo = await this.getFileInfo(filePath);
      
      return {
        valid: true,
        fileInfo
      };
      
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  // Generate file hash
  async generateFileHash(filePath, algorithm = 'sha256') {
    return new Promise((resolve, reject) => {
      try {
        const hash = crypto.createHash(algorithm);
        const stream = createReadStream(filePath);
        
        stream.on('data', (data) => {
          hash.update(data);
        });
        
        stream.on('end', () => {
          resolve(hash.digest('hex'));
        });
        
        stream.on('error', (error) => {
          reject(error);
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }

  // Check if file is corrupted
  async isFileCorrupted(filePath, expectedHash = null) {
    try {
      if (!(await fs.pathExists(filePath))) {
        return true; // File doesn't exist, consider it corrupted
      }
      
      const actualHash = await this.generateFileHash(filePath);
      
      if (expectedHash) {
        return actualHash !== expectedHash;
      }
      
      // If no expected hash, check if file is readable
      try {
        await fs.access(filePath, fs.constants.R_OK);
        return false;
      } catch {
        return true;
      }
      
    } catch (error) {
      return true; // Error reading file, consider it corrupted
    }
  }

  // Get file statistics
  async getFileStats(directory, options = {}) {
    try {
      const { recursive = true, includeHidden = false } = options;
      
      const files = await this.listDirectory(directory, { recursive, includeHidden });
      
      const stats = {
        totalFiles: 0,
        totalDirectories: 0,
        totalSize: 0,
        totalSizeFormatted: '0 Bytes',
        fileTypes: {},
        largestFile: null,
        oldestFile: null,
        newestFile: null
      };
      
      for (const file of files) {
        if (file.isDirectory) {
          stats.totalDirectories++;
        } else {
          stats.totalFiles++;
          stats.totalSize += file.size;
          
          // Track file types
          const ext = path.extname(file.name).toLowerCase();
          stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;
          
          // Track largest file
          if (!stats.largestFile || file.size > stats.largestFile.size) {
            stats.largestFile = file;
          }
          
          // Track oldest file
          if (!stats.oldestFile || file.created < stats.oldestFile.created) {
            stats.oldestFile = file;
          }
          
          // Track newest file
          if (!stats.newestFile || file.modified > stats.newestFile.modified) {
            stats.newestFile = file;
          }
        }
      }
      
      stats.totalSizeFormatted = this.formatBytes(stats.totalSize);
      
      return stats;
      
    } catch (error) {
      loggingService.error('Failed to get file stats', { directory, error: error.message });
      throw error;
    }
  }
}

module.exports = new FileUtils();
