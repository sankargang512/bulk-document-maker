const fs = require('fs').promises;
const path = require('path');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const csv = require('csv-parser');
const iconv = require('iconv-lite');
const { ValidationError } = require('../middleware/errorHandler');

/**
 * @typedef {Object} CSVParseResult
 * @property {string[]} headers - Array of column headers
 * @property {Object[]} rows - Array of data rows as objects
 * @property {number} totalRows - Total number of rows processed
 * @property {Object} metadata - File metadata and statistics
 * @property {string[]} warnings - Array of warning messages
 */

/**
 * @typedef {Object} CSVParseOptions
 * @property {string} encoding - File encoding (auto-detected if not specified)
 * @property {string} delimiter - CSV delimiter (auto-detected if not specified)
 * @property {boolean} hasHeader - Whether the CSV has headers (default: true)
 * @property {number} maxRows - Maximum number of rows to process
 * @property {boolean} skipEmptyRows - Whether to skip empty rows
 * @property {string[]} requiredColumns - Required column names
 * @property {Object} columnMapping - Custom column name mapping
 * @property {boolean} strictMode - Strict validation mode
 */

/**
 * @typedef {Object} CSVValidationResult
 * @property {boolean} isValid - Whether the CSV is valid
 * @property {string[]} errors - Array of validation errors
 * @property {string[]} warnings - Array of validation warnings
 * @property {Object} statistics - Data statistics
 */

/**
 * CSV Parser Service
 * Handles parsing and validation of CSV files with support for various formats and encodings
 */
class CSVParserService {
  constructor() {
    this.supportedEncodings = ['utf8', 'utf16le', 'latin1', 'cp1252', 'iso-8859-1'];
    this.commonDelimiters = [',', ';', '\t', '|'];
    this.maxFileSize = 100 * 1024 * 1024; // 100MB
    this.maxRows = 100000; // 100k rows max
  }

  /**
   * Parse CSV file with comprehensive error handling
   * @param {string} filePath - Path to the CSV file
   * @param {CSVParseOptions} options - Parsing options
   * @returns {Promise<CSVParseResult>} Parsed CSV data
   */
  async parseFile(filePath, options = {}) {
    try {
      // Validate file exists and is accessible
      await this.validateFile(filePath);
      
      // Detect file encoding and delimiter if not specified
      const detectedOptions = await this.detectFileProperties(filePath, options);
      const finalOptions = { ...this.getDefaultOptions(), ...options, ...detectedOptions };
      
      // Validate options
      this.validateOptions(finalOptions);
      
      // Parse the CSV file
      const result = await this.parseCSVContent(filePath, finalOptions);
      
      // Validate parsed data
      const validation = this.validateParsedData(result, finalOptions);
      if (!validation.isValid) {
        throw new ValidationError('CSV validation failed', validation.errors.map(error => ({
          field: 'csv',
          message: error,
          code: 'CSV_VALIDATION_ERROR'
        })));
      }
      
      // Add warnings to result
      result.warnings = [...(result.warnings || []), ...validation.warnings];
      
      return result;
      
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      
      throw new ValidationError(`CSV parsing failed: ${error.message}`, [{
        field: 'csv',
        message: error.message,
        code: 'CSV_PARSE_ERROR'
      }]);
    }
  }

  /**
   * Parse CSV content from file path
   * @param {string} filePath - Path to the CSV file
   * @param {CSVParseOptions} options - Parsing options
   * @returns {Promise<CSVParseResult>} Parsed CSV data
   */
  async parseCSVContent(filePath, options) {
    return new Promise((resolve, reject) => {
      const headers = [];
      const rows = [];
      let rowCount = 0;
      const warnings = [];
      
      // Create read stream with encoding detection
      const readStream = fs.createReadStream(filePath);
      
      // Create CSV parser with options
      const csvParser = csv({
        separator: options.delimiter,
        headers: options.hasHeader,
        skipEmptyLines: options.skipEmptyRows,
        strict: options.strictMode
      });
      
      // Create transform stream for row processing
      const rowProcessor = new Transform({
        objectMode: true,
        transform: (row, encoding, callback) => {
          try {
            // Check row limit
            if (options.maxRows && rowCount >= options.maxRows) {
              warnings.push(`Row limit reached (${options.maxRows}). Processing stopped.`);
              this.stopProcessing();
              return callback();
            }
            
            // Process row data
            const processedRow = this.processRow(row, options);
            
            if (processedRow) {
              rows.push(processedRow);
              rowCount++;
            }
            
            callback();
          } catch (error) {
            callback(error);
          }
        }
      });
      
      // Handle CSV parser events
      csvParser.on('headers', (detectedHeaders) => {
        if (options.hasHeader) {
          headers.push(...detectedHeaders);
        } else {
          // Generate default headers if none provided
          const maxColumns = Math.max(...rows.map(row => Object.keys(row).length));
          for (let i = 0; i < maxColumns; i++) {
            headers.push(`Column_${i + 1}`);
          }
        }
      });
      
      csvParser.on('error', (error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      });
      
      // Process the file
      pipeline(readStream, csvParser, rowProcessor)
        .then(() => {
          const result = {
            headers: headers.length > 0 ? headers : this.generateDefaultHeaders(rows),
            rows,
            totalRows: rowCount,
            metadata: this.generateMetadata(filePath, headers, rows, options),
            warnings
          };
          
          resolve(result);
        })
        .catch(reject);
    });
  }

  /**
   * Process individual CSV row
   * @param {Object} row - Raw row data
   * @param {CSVParseOptions} options - Parsing options
   * @returns {Object|null} Processed row or null if skipped
   */
  processRow(row, options) {
    // Skip empty rows if configured
    if (options.skipEmptyRows && this.isEmptyRow(row)) {
      return null;
    }
    
    // Apply column mapping if specified
    if (options.columnMapping) {
      row = this.applyColumnMapping(row, options.columnMapping);
    }
    
    // Clean and validate row data
    const cleanedRow = this.cleanRowData(row);
    
    // Validate required columns if specified
    if (options.requiredColumns && !this.validateRequiredColumns(cleanedRow, options.requiredColumns)) {
      return null; // Skip invalid rows
    }
    
    return cleanedRow;
  }

  /**
   * Clean and normalize row data
   * @param {Object} row - Raw row data
   * @returns {Object} Cleaned row data
   */
  cleanRowData(row) {
    const cleaned = {};
    
    for (const [key, value] of Object.entries(row)) {
      if (value !== null && value !== undefined) {
        // Trim whitespace
        let cleanedValue = typeof value === 'string' ? value.trim() : value;
        
        // Convert empty strings to null
        if (cleanedValue === '') {
          cleanedValue = null;
        }
        
        // Convert numeric strings to numbers
        if (typeof cleanedValue === 'string' && !isNaN(cleanedValue) && cleanedValue !== '') {
          const num = parseFloat(cleanedValue);
          if (!isNaN(num)) {
            cleanedValue = num;
          }
        }
        
        // Convert boolean strings
        if (typeof cleanedValue === 'string') {
          const lowerValue = cleanedValue.toLowerCase();
          if (lowerValue === 'true' || lowerValue === 'false') {
            cleanedValue = lowerValue === 'true';
          }
        }
        
        cleaned[key] = cleanedValue;
      }
    }
    
    return cleaned;
  }

  /**
   * Apply column mapping to row data
   * @param {Object} row - Raw row data
   * @param {Object} mapping - Column mapping configuration
   * @returns {Object} Mapped row data
   */
  applyColumnMapping(row, mapping) {
    const mapped = {};
    
    for (const [newKey, oldKey] of Object.entries(mapping)) {
      if (row.hasOwnProperty(oldKey)) {
        mapped[newKey] = row[oldKey];
      }
    }
    
    return mapped;
  }

  /**
   * Validate that row contains required columns
   * @param {Object} row - Row data
   * @param {string[]} requiredColumns - Required column names
   * @returns {boolean} Whether row is valid
   */
  validateRequiredColumns(row, requiredColumns) {
    return requiredColumns.every(col => 
      row.hasOwnProperty(col) && row[col] !== null && row[col] !== undefined
    );
  }

  /**
   * Check if row is empty
   * @param {Object} row - Row data
   * @returns {boolean} Whether row is empty
   */
  isEmptyRow(row) {
    return Object.values(row).every(value => 
      value === null || value === undefined || value === ''
    );
  }

  /**
   * Generate default headers for rows
   * @param {Object[]} rows - Array of row data
   * @returns {string[]} Generated headers
   */
  generateDefaultHeaders(rows) {
    if (rows.length === 0) return [];
    
    const maxColumns = Math.max(...rows.map(row => Object.keys(row).length));
    const headers = [];
    
    for (let i = 0; i < maxColumns; i++) {
      headers.push(`Column_${i + 1}`);
    }
    
    return headers;
  }

  /**
   * Detect file encoding and delimiter
   * @param {string} filePath - Path to the CSV file
   * @param {CSVParseOptions} options - Current options
   * @returns {Promise<Partial<CSVParseOptions>>} Detected options
   */
  async detectFileProperties(filePath, options) {
    const detected = {};
    
    // Detect encoding if not specified
    if (!options.encoding) {
      detected.encoding = await this.detectEncoding(filePath);
    }
    
    // Detect delimiter if not specified
    if (!options.delimiter) {
      detected.delimiter = await this.detectDelimiter(filePath);
    }
    
    return detected;
  }

  /**
   * Detect file encoding
   * @param {string} filePath - Path to the CSV file
   * @returns {Promise<string>} Detected encoding
   */
  async detectEncoding(filePath) {
    try {
      // Read first 8KB of file for encoding detection
      const buffer = await fs.readFile(filePath, { start: 0, end: 8192 });
      
      // Check for BOM (Byte Order Mark)
      if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        return 'utf8';
      }
      
      if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
        return 'utf16le';
      }
      
      // Try to decode with different encodings
      for (const encoding of this.supportedEncodings) {
        try {
          const decoded = iconv.decode(buffer, encoding);
          // Check if decoded text looks like valid CSV
          if (this.looksLikeCSV(decoded)) {
            return encoding;
          }
        } catch (error) {
          // Continue to next encoding
        }
      }
      
      // Default to UTF-8
      return 'utf8';
      
    } catch (error) {
      // Default to UTF-8 if detection fails
      return 'utf8';
    }
  }

  /**
   * Detect CSV delimiter
   * @param {string} filePath - Path to the CSV file
   * @returns {Promise<string>} Detected delimiter
   */
  async detectDelimiter(filePath) {
    try {
      // Read first few lines for delimiter detection
      const buffer = await fs.readFile(filePath, { start: 0, end: 4096 });
      const sample = buffer.toString('utf8');
      const lines = sample.split('\n').slice(0, 5); // First 5 lines
      
      const delimiterCounts = {};
      
      for (const delimiter of this.commonDelimiters) {
        delimiterCounts[delimiter] = 0;
        
        for (const line of lines) {
          if (line.trim()) {
            delimiterCounts[delimiter] += (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
          }
        }
      }
      
      // Return delimiter with highest count
      return Object.entries(delimiterCounts).reduce((a, b) => 
        delimiterCounts[a[0]] > delimiterCounts[b[0]] ? a : b
      )[0];
      
    } catch (error) {
      // Default to comma if detection fails
      return ',';
    }
  }

  /**
   * Check if text looks like valid CSV
   * @param {string} text - Text to check
   * @returns {boolean} Whether text looks like CSV
   */
  looksLikeCSV(text) {
    // Simple heuristic: check if text contains commas and newlines
    return text.includes(',') && text.includes('\n') && text.length > 10;
  }

  /**
   * Validate file before processing
   * @param {string} filePath - Path to the CSV file
   * @returns {Promise<void>}
   */
  async validateFile(filePath) {
    try {
      const stats = await fs.stat(filePath);
      
      // Check file size
      if (stats.size > this.maxFileSize) {
        throw new Error(`File size (${Math.round(stats.size / 1024 / 1024)}MB) exceeds maximum allowed size (${this.maxFileSize / 1024 / 1024}MB)`);
      }
      
      // Check file extension
      const ext = path.extname(filePath).toLowerCase();
      if (!['.csv', '.txt'].includes(ext)) {
        throw new Error(`Unsupported file type: ${ext}. Only CSV and TXT files are supported.`);
      }
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('File not found');
      }
      throw error;
    }
  }

  /**
   * Validate parsing options
   * @param {CSVParseOptions} options - Options to validate
   * @returns {void}
   */
  validateOptions(options) {
    if (options.maxRows && (options.maxRows < 1 || options.maxRows > this.maxRows)) {
      throw new Error(`maxRows must be between 1 and ${this.maxRows}`);
    }
    
    if (options.delimiter && !this.commonDelimiters.includes(options.delimiter)) {
      throw new Error(`Unsupported delimiter: ${options.delimiter}`);
    }
    
    if (options.encoding && !this.supportedEncodings.includes(options.encoding)) {
      throw new Error(`Unsupported encoding: ${options.encoding}`);
    }
  }

  /**
   * Validate parsed CSV data
   * @param {CSVParseResult} result - Parsed CSV data
   * @param {CSVParseOptions} options - Parsing options
   * @returns {CSVValidationResult} Validation result
   */
  validateParsedData(result, options) {
    const errors = [];
    const warnings = [];
    
    // Check if headers exist
    if (options.hasHeader && (!result.headers || result.headers.length === 0)) {
      errors.push('CSV file must contain headers');
    }
    
    // Check if data exists
    if (!result.rows || result.rows.length === 0) {
      errors.push('CSV file must contain data rows');
    }
    
    // Check required columns if specified
    if (options.requiredColumns) {
      for (const requiredCol of options.requiredColumns) {
        if (!result.headers.includes(requiredCol)) {
          errors.push(`Required column '${requiredCol}' not found in CSV`);
        }
      }
    }
    
    // Check for empty columns
    const emptyColumns = result.headers.filter(header => 
      result.rows.every(row => !row[header] || row[header] === '')
    );
    
    if (emptyColumns.length > 0) {
      warnings.push(`Empty columns detected: ${emptyColumns.join(', ')}`);
    }
    
    // Check for inconsistent row lengths
    const rowLengths = result.rows.map(row => Object.keys(row).length);
    const uniqueLengths = [...new Set(rowLengths)];
    
    if (uniqueLengths.length > 1) {
      warnings.push('Inconsistent number of columns across rows');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      statistics: this.generateStatistics(result)
    };
  }

  /**
   * Generate metadata for parsed CSV
   * @param {string} filePath - Path to the CSV file
   * @param {string[]} headers - Column headers
   * @param {Object[]} rows - Data rows
   * @param {CSVParseOptions} options - Parsing options
   * @returns {Object} Metadata object
   */
  generateMetadata(filePath, headers, rows, options) {
    const stats = this.generateStatistics({ headers, rows });
    
    return {
      fileName: path.basename(filePath),
      filePath,
      fileSize: fs.statSync(filePath).size,
      encoding: options.encoding || 'auto-detected',
      delimiter: options.delimiter || 'auto-detected',
      hasHeaders: options.hasHeader,
      totalColumns: headers.length,
      totalRows: rows.length,
      statistics: stats,
      parseOptions: options,
      parseTimestamp: new Date().toISOString()
    };
  }

  /**
   * Generate statistics for CSV data
   * @param {Object} data - CSV data object
   * @returns {Object} Statistics object
   */
  generateStatistics(data) {
    const { headers, rows } = data;
    const stats = {};
    
    for (const header of headers) {
      const values = rows.map(row => row[header]).filter(val => val !== null && val !== undefined);
      
      stats[header] = {
        totalValues: values.length,
        nullValues: rows.length - values.length,
        uniqueValues: new Set(values).size,
        dataTypes: this.analyzeDataTypes(values)
      };
      
      // Add numeric statistics if applicable
      const numericValues = values.filter(val => typeof val === 'number');
      if (numericValues.length > 0) {
        stats[header].numeric = {
          min: Math.min(...numericValues),
          max: Math.max(...numericValues),
          average: numericValues.reduce((a, b) => a + b, 0) / numericValues.length
        };
      }
    }
    
    return stats;
  }

  /**
   * Analyze data types in a column
   * @param {any[]} values - Column values
   * @returns {Object} Data type analysis
   */
  analyzeDataTypes(values) {
    const types = {};
    
    for (const value of values) {
      const type = typeof value;
      types[type] = (types[type] || 0) + 1;
    }
    
    return types;
  }

  /**
   * Get default parsing options
   * @returns {CSVParseOptions} Default options
   */
  getDefaultOptions() {
    return {
      encoding: 'utf8',
      delimiter: ',',
      hasHeader: true,
      maxRows: this.maxRows,
      skipEmptyRows: true,
      requiredColumns: [],
      columnMapping: {},
      strictMode: false
    };
  }

  /**
   * Parse CSV string content
   * @param {string} content - CSV string content
   * @param {CSVParseOptions} options - Parsing options
   * @returns {Promise<CSVParseResult>} Parsed CSV data
   */
  async parseString(content, options = {}) {
    // Create temporary file for parsing
    const tempFile = path.join(process.cwd(), 'temp', `csv_${Date.now()}.csv`);
    
    try {
      await fs.writeFile(tempFile, content, 'utf8');
      return await this.parseFile(tempFile, options);
    } finally {
      // Clean up temporary file
      try {
        await fs.unlink(tempFile);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Export parsed data to different formats
   * @param {CSVParseResult} data - Parsed CSV data
   * @param {string} format - Export format ('json', 'csv', 'xlsx')
   * @returns {Promise<Buffer|string>} Exported data
   */
  async exportData(data, format = 'json') {
    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(data, null, 2);
      
      case 'csv':
        return this.convertToCSV(data);
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Convert parsed data back to CSV format
   * @param {CSVParseResult} data - Parsed CSV data
   * @returns {string} CSV string
   */
  convertToCSV(data) {
    const { headers, rows } = data;
    
    // Create CSV header
    const csvLines = [headers.join(',')];
    
    // Add data rows
    for (const row of rows) {
      const csvRow = headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) {
          return '';
        }
        
        // Escape commas and quotes
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        
        return stringValue;
      });
      
      csvLines.push(csvRow.join(','));
    }
    
    return csvLines.join('\n');
  }
}

module.exports = CSVParserService;

