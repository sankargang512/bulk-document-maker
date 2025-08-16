const fs = require('fs').promises;
const path = require('path');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');
const NodeCache = require('node-cache');
const { ValidationError, FileProcessingError } = require('../middleware/errorHandler');

/**
 * @typedef {Object} PlaceholderVariable
 * @property {string} name - Variable name
 * @property {string} syntax - Original syntax used ([variable] or {{variable}})
 * @property {string} type - Variable type (string, number, date, boolean, custom)
 * @property {string} description - AI-generated description of the variable
 * @property {string[]} suggestions - Suggested values or examples
 * @property {boolean} required - Whether the variable is required
 * @property {Object} metadata - Additional metadata about the variable
 */

/**
 * @typedef {Object} TemplateAnalysis
 * @property {string} templateId - Unique template identifier
 * @property {string} fileName - Original file name
 * @property {string} fileType - File type (docx, pdf, txt)
 * @property {number} fileSize - File size in bytes
 * @property {PlaceholderVariable[]} placeholders - Extracted placeholder variables
 * @property {Object} structure - Document structure analysis
 * @property {Object} metadata - Template metadata
 * @property {Object} statistics - Analysis statistics
 * @property {string[]} warnings - Analysis warnings
 * @property {Date} analyzedAt - When analysis was performed
 * @property {string} analysisVersion - Version of analysis algorithm
 */

/**
 * @typedef {Object} AnalysisOptions
 * @property {boolean} useAI - Whether to use OpenAI for enhanced analysis
 * @property {boolean} extractStructure - Whether to analyze document structure
 * @property {boolean} generateDescriptions - Whether to generate variable descriptions
 * @property {string[]} customPlaceholderPatterns - Custom regex patterns for placeholders
 * @property {Object} openAIConfig - OpenAI API configuration
 * @property {boolean} cacheResults - Whether to cache analysis results
 * @property {number} cacheTTL - Cache time-to-live in seconds
 */

/**
 * @typedef {Object} DocumentStructure
 * @property {Object[]} sections - Document sections
 * @property {Object[]} headings - Document headings
 * @property {Object[]} tables - Document tables
 * @property {Object[]} images - Document images
 * @property {Object[]} lists - Document lists
 * @property {number} totalPages - Total number of pages
 * @property {number} wordCount - Total word count
 * @property {Object} formatting - Document formatting information
 */

/**
 * Template Analyzer Service
 * Analyzes document templates to extract placeholder variables and structure
 */
class TemplateAnalyzerService {
  constructor(options = {}) {
    this.options = {
      useAI: options.useAI !== false,
      extractStructure: options.extractStructure !== false,
      generateDescriptions: options.generateDescriptions !== false,
      customPlaceholderPatterns: options.customPlaceholderPatterns || [],
      cacheResults: options.cacheResults !== false,
      cacheTTL: options.cacheTTL || 3600, // 1 hour default
      ...options
    };

    // Initialize OpenAI client if configured
    if (this.options.useAI && this.options.openAIConfig) {
      this.openai = new OpenAI(this.options.openAIConfig);
    }

    // Initialize cache if enabled
    if (this.options.cacheResults) {
      this.cache = new NodeCache({ 
        stdTTL: this.options.cacheTTL,
        checkperiod: 600 // Check for expired keys every 10 minutes
      });
    }

    // Default placeholder patterns
    this.placeholderPatterns = [
      /\[([a-zA-Z0-9_\s]+)\]/g,           // [variable]
      /\{\{([a-zA-Z0-9_\s]+)\}\}/g,       // {{variable}}
      /\$([a-zA-Z0-9_\s]+)\$/g,           // $variable$
      /%([a-zA-Z0-9_\s]+)%/g,             // %variable%
      ...this.options.customPlaceholderPatterns
    ];

    // Supported file types
    this.supportedTypes = {
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'pdf': 'application/pdf',
      'txt': 'text/plain'
    };

    // Variable type patterns
    this.typePatterns = {
      date: /(date|time|created|updated|birth|hire|start|end)/i,
      number: /(count|amount|quantity|price|cost|rate|percentage|age|year|month|day)/i,
      boolean: /(is|has|can|should|will|active|enabled|visible|required)/i,
      email: /(email|mail|e-mail)/i,
      phone: /(phone|telephone|mobile|cell)/i,
      url: /(url|website|link|href)/i
    };
  }

  /**
   * Analyze a document template
   * @param {string} filePath - Path to the template file
   * @param {AnalysisOptions} options - Analysis options
   * @returns {Promise<TemplateAnalysis>} Template analysis result
   */
  async analyzeTemplate(filePath, options = {}) {
    try {
      // Merge options
      const finalOptions = { ...this.options, ...options };
      
      // Check cache first
      if (this.options.cacheResults) {
        const cacheKey = this.generateCacheKey(filePath, finalOptions);
        const cached = this.cache.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      // Validate file
      await this.validateTemplateFile(filePath);
      
      // Get file information
      const fileInfo = await this.getFileInfo(filePath);
      
      // Extract text content based on file type
      const textContent = await this.extractTextContent(filePath, fileInfo.fileType);
      
      // Extract placeholder variables
      const placeholders = await this.extractPlaceholders(textContent, finalOptions);
      
      // Analyze document structure
      const structure = finalOptions.extractStructure ? 
        await this.analyzeDocumentStructure(filePath, fileInfo.fileType, textContent) : 
        null;
      
      // Generate metadata and statistics
      const metadata = await this.generateMetadata(fileInfo, placeholders, structure);
      const statistics = this.generateStatistics(placeholders, structure, textContent);
      
      // Create analysis result
      const analysis = {
        templateId: this.generateTemplateId(filePath),
        fileName: fileInfo.fileName,
        fileType: fileInfo.fileType,
        fileSize: fileInfo.fileSize,
        placeholders,
        structure,
        metadata,
        statistics,
        warnings: [],
        analyzedAt: new Date(),
        analysisVersion: '1.0.0'
      };

      // Enhance with AI if enabled
      if (finalOptions.useAI && this.openai) {
        await this.enhanceWithAI(analysis, finalOptions);
      }

      // Cache result if enabled
      if (this.options.cacheResults) {
        const cacheKey = this.generateCacheKey(filePath, finalOptions);
        this.cache.set(cacheKey, analysis);
      }

      return analysis;

    } catch (error) {
      throw new FileProcessingError(`Template analysis failed: ${error.message}`, [{
        field: 'template',
        message: error.message,
        code: 'TEMPLATE_ANALYSIS_ERROR'
      }]);
    }
  }

  /**
   * Extract text content from different file types
   * @param {string} filePath - Path to the file
   * @param {string} fileType - Type of the file
   * @returns {Promise<string>} Extracted text content
   */
  async extractTextContent(filePath, fileType) {
    try {
      switch (fileType) {
        case 'docx':
          return await this.extractFromDOCX(filePath);
        
        case 'pdf':
          return await this.extractFromPDF(filePath);
        
        case 'txt':
          return await this.extractFromTXT(filePath);
        
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }
    } catch (error) {
      throw new Error(`Failed to extract text from ${fileType} file: ${error.message}`);
    }
  }

  /**
   * Extract text from DOCX file
   * @param {string} filePath - Path to the DOCX file
   * @returns {Promise<string>} Extracted text
   */
  async extractFromDOCX(filePath) {
    try {
      const buffer = await fs.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      throw new Error(`DOCX extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from PDF file
   * @param {string} filePath - Path to the PDF file
   * @returns {Promise<string>} Extracted text
   */
  async extractFromPDF(filePath) {
    try {
      const buffer = await fs.readFile(filePath);
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from TXT file
   * @param {string} filePath - Path to the TXT file
   * @returns {Promise<string>} Extracted text
   */
  async extractFromTXT(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content;
    } catch (error) {
      throw new Error(`TXT extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract placeholder variables from text content
   * @param {string} textContent - Text content to analyze
   * @param {AnalysisOptions} options - Analysis options
   * @returns {Promise<PlaceholderVariable[]>} Extracted placeholders
   */
  async extractPlaceholders(textContent, options) {
    const placeholders = new Map();
    
    // Extract placeholders using all patterns
    for (const pattern of this.placeholderPatterns) {
      const matches = textContent.matchAll(pattern);
      
      for (const match of matches) {
        const fullMatch = match[0];
        const variableName = match[1].trim();
        
        if (variableName && !placeholders.has(variableName)) {
          const placeholder = await this.createPlaceholderVariable(
            variableName, 
            fullMatch, 
            textContent,
            options
          );
          
          placeholders.set(variableName, placeholder);
        }
      }
    }

    return Array.from(placeholders.values());
  }

  /**
   * Create a placeholder variable object
   * @param {string} name - Variable name
   * @param {string} syntax - Original syntax
   * @param {string} context - Text context around the variable
   * @param {AnalysisOptions} options - Analysis options
   * @returns {Promise<PlaceholderVariable>} Placeholder variable object
   */
  async createPlaceholderVariable(name, syntax, context, options) {
    // Determine variable type
    const type = this.determineVariableType(name, context);
    
    // Check if variable is required
    const required = this.isVariableRequired(name, context);
    
    // Generate suggestions
    const suggestions = this.generateSuggestions(name, type);
    
    const placeholder = {
      name,
      syntax,
      type,
      description: '',
      suggestions,
      required,
      metadata: {
        context: this.extractContext(context, name),
        frequency: this.countVariableFrequency(context, name),
        position: this.findVariablePosition(context, name)
      }
    };

    // Generate AI description if enabled
    if (options.generateDescriptions && this.openai) {
      try {
        placeholder.description = await this.generateVariableDescription(name, type, context);
      } catch (error) {
        // Fallback to basic description if AI fails
        placeholder.description = this.generateBasicDescription(name, type);
      }
    } else {
      placeholder.description = this.generateBasicDescription(name, type);
    }

    return placeholder;
  }

  /**
   * Determine variable type based on name and context
   * @param {string} name - Variable name
   * @param {string} context - Text context
   * @returns {string} Variable type
   */
  determineVariableType(name, context) {
    const lowerName = name.toLowerCase();
    
    // Check type patterns
    for (const [type, pattern] of Object.entries(this.typePatterns)) {
      if (pattern.test(lowerName)) {
        return type;
      }
    }
    
    // Check context for additional clues
    if (context.toLowerCase().includes('date') || context.toLowerCase().includes('time')) {
      return 'date';
    }
    
    if (context.toLowerCase().includes('amount') || context.toLowerCase().includes('price')) {
      return 'number';
    }
    
    // Default to string
    return 'string';
  }

  /**
   * Check if variable is required based on context
   * @param {string} name - Variable name
   * @param {string} context - Text context
   * @returns {boolean} Whether variable is required
   */
  isVariableRequired(name, context) {
    const lowerContext = context.toLowerCase();
    const requiredKeywords = ['required', 'mandatory', 'must', 'essential', 'necessary'];
    
    return requiredKeywords.some(keyword => lowerContext.includes(keyword));
  }

  /**
   * Generate suggestions for variable values
   * @param {string} name - Variable name
   * @param {string} type - Variable type
   * @returns {string[]} Array of suggestions
   */
  generateSuggestions(name, type) {
    const suggestions = [];
    
    switch (type) {
      case 'date':
        suggestions.push('Current date', 'Specific date', 'Date range');
        break;
      
      case 'number':
        suggestions.push('0', '1', '100', 'Custom value');
        break;
      
      case 'boolean':
        suggestions.push('Yes', 'No', 'True', 'False');
        break;
      
      case 'email':
        suggestions.push('user@example.com', 'admin@company.com');
        break;
      
      case 'phone':
        suggestions.push('+1-555-123-4567', '(555) 123-4567');
        break;
      
      case 'url':
        suggestions.push('https://example.com', 'www.company.com');
        break;
      
      default:
        suggestions.push('Custom text', 'Sample value');
    }
    
    return suggestions;
  }

  /**
   * Generate basic description for variable
   * @param {string} name - Variable name
   * @param {string} type - Variable type
   * @returns {string} Basic description
   */
  generateBasicDescription(name, type) {
    const typeDescription = {
      date: 'Date or time value',
      number: 'Numeric value',
      boolean: 'True/false value',
      email: 'Email address',
      phone: 'Phone number',
      url: 'Website URL',
      string: 'Text value'
    };
    
    return `${name} - ${typeDescription[type] || 'Text value'}`;
  }

  /**
   * Generate AI-powered variable description
   * @param {string} name - Variable name
   * @param {string} type - Variable type
   * @param {string} context - Text context
   * @returns {Promise<string>} AI-generated description
   */
  async generateVariableDescription(name, type, context) {
    try {
      const prompt = `Analyze this document variable and provide a clear, professional description:

Variable Name: ${name}
Variable Type: ${type}
Context: ${context.substring(0, 500)}...

Please provide a concise description (1-2 sentences) explaining what this variable represents and how it should be used.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a document template analyst. Provide clear, professional descriptions of template variables.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 100,
        temperature: 0.3
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      // Fallback to basic description
      return this.generateBasicDescription(name, type);
    }
  }

  /**
   * Analyze document structure
   * @param {string} filePath - Path to the file
   * @param {string} fileType - File type
   * @param {string} textContent - Text content
   * @returns {Promise<DocumentStructure>} Document structure
   */
  async analyzeDocumentStructure(filePath, fileType, textContent) {
    const structure = {
      sections: [],
      headings: [],
      tables: [],
      images: [],
      lists: [],
      totalPages: 1,
      wordCount: this.countWords(textContent),
      formatting: {}
    };

    // Extract headings
    structure.headings = this.extractHeadings(textContent);
    
    // Extract lists
    structure.lists = this.extractLists(textContent);
    
    // Extract tables (basic detection)
    structure.tables = this.extractTables(textContent);
    
    // Extract sections based on headings
    structure.sections = this.extractSections(textContent, structure.headings);
    
    // Add formatting information
    structure.formatting = this.analyzeFormatting(textContent);

    return structure;
  }

  /**
   * Extract headings from text content
   * @param {string} textContent - Text content
   * @returns {Object[]} Array of headings
   */
  extractHeadings(textContent) {
    const headings = [];
    const lines = textContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Simple heading detection (can be enhanced)
      if (line.length > 0 && line.length < 100 && 
          (line === line.toUpperCase() || 
           line.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/))) {
        
        headings.push({
          text: line,
          level: this.determineHeadingLevel(line),
          lineNumber: i + 1,
          position: i / lines.length
        });
      }
    }
    
    return headings;
  }

  /**
   * Determine heading level
   * @param {string} heading - Heading text
   * @returns {number} Heading level (1-6)
   */
  determineHeadingLevel(heading) {
    if (heading.length < 20) return 1;
    if (heading.length < 40) return 2;
    if (heading.length < 60) return 3;
    return 4;
  }

  /**
   * Extract lists from text content
   * @param {string} textContent - Text content
   * @returns {Object[]} Array of lists
   */
  extractLists(textContent) {
    const lists = [];
    const lines = textContent.split('\n');
    
    let currentList = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.match(/^[\-\*•]\s/) || line.match(/^\d+\.\s/)) {
        if (!currentList) {
          currentList = {
            type: line.match(/^\d+\.\s/) ? 'ordered' : 'unordered',
            items: [],
            startLine: i + 1
          };
        }
        
        currentList.items.push({
          text: line.replace(/^[\-\*•]\s|^\d+\.\s/, ''),
          lineNumber: i + 1
        });
      } else if (currentList && line.length > 0) {
        // End of list
        currentList.endLine = i;
        lists.push(currentList);
        currentList = null;
      }
    }
    
    // Add final list if exists
    if (currentList) {
      currentList.endLine = lines.length;
      lists.push(currentList);
    }
    
    return lists;
  }

  /**
   * Extract tables from text content
   * @param {string} textContent - Text content
   * @returns {Object[]} Array of tables
   */
  extractTables(textContent) {
    const tables = [];
    const lines = textContent.split('\n');
    
    let currentTable = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Simple table detection (looks for lines with multiple tabs or consistent spacing)
      if (line.includes('\t') || line.match(/\s{3,}/)) {
        if (!currentTable) {
          currentTable = {
            rows: [],
            startLine: i + 1
          };
        }
        
        const cells = line.split(/\t|\s{3,}/).filter(cell => cell.trim().length > 0);
        currentTable.rows.push({
          cells,
          lineNumber: i + 1
        });
      } else if (currentTable && line.length > 0) {
        // End of table
        currentTable.endLine = i;
        currentTable.columns = currentTable.rows[0]?.cells?.length || 0;
        tables.push(currentTable);
        currentTable = null;
      }
    }
    
    // Add final table if exists
    if (currentTable) {
      currentTable.endLine = lines.length;
      currentTable.columns = currentTable.rows[0]?.cells?.length || 0;
      tables.push(currentTable);
    }
    
    return tables;
  }

  /**
   * Extract sections based on headings
   * @param {string} textContent - Text content
   * @param {Object[]} headings - Array of headings
   * @returns {Object[]} Array of sections
   */
  extractSections(textContent, headings) {
    const sections = [];
    const lines = textContent.split('\n');
    
    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i];
      const nextHeading = headings[i + 1];
      
      const section = {
        title: heading.text,
        level: heading.level,
        startLine: heading.lineNumber,
        endLine: nextHeading ? nextHeading.lineNumber - 1 : lines.length,
        content: lines.slice(heading.lineNumber - 1, nextHeading ? nextHeading.lineNumber - 1 : lines.length).join('\n')
      };
      
      sections.push(section);
    }
    
    return sections;
  }

  /**
   * Analyze text formatting
   * @param {string} textContent - Text content
   * @returns {Object} Formatting information
   */
  analyzeFormatting(textContent) {
    const lines = textContent.split('\n');
    
    return {
      totalLines: lines.length,
      averageLineLength: lines.reduce((sum, line) => sum + line.length, 0) / lines.length,
      maxLineLength: Math.max(...lines.map(line => line.length)),
      emptyLines: lines.filter(line => line.trim().length === 0).length,
      hasBulletPoints: textContent.includes('•') || textContent.includes('-') || textContent.includes('*'),
      hasNumberedLists: /\d+\.\s/.test(textContent)
    };
  }

  /**
   * Count words in text
   * @param {string} text - Text content
   * @returns {number} Word count
   */
  countWords(text) {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Extract context around variable
   * @param {string} context - Full context
   * @param {string} variableName - Variable name
   * @returns {string} Context around variable
   */
  extractContext(context, variableName) {
    const index = context.indexOf(variableName);
    if (index === -1) return '';
    
    const start = Math.max(0, index - 100);
    const end = Math.min(context.length, index + variableName.length + 100);
    
    return context.substring(start, end);
  }

  /**
   * Count variable frequency in context
   * @param {string} context - Text context
   * @param {string} variableName - Variable name
   * @returns {number} Frequency count
   */
  countVariableFrequency(context, variableName) {
    const regex = new RegExp(variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = context.match(regex);
    return matches ? matches.length : 0;
  }

  /**
   * Find variable position in context
   * @param {string} context - Text context
   * @param {string} variableName - Variable name
   * @returns {number} Position (0-1)
   */
  findVariablePosition(context, variableName) {
    const index = context.indexOf(variableName);
    return index === -1 ? 0 : index / context.length;
  }

  /**
   * Generate template ID
   * @param {string} filePath - File path
   * @returns {string} Template ID
   */
  generateTemplateId(filePath) {
    const fileName = path.basename(filePath, path.extname(filePath));
    const timestamp = Date.now();
    return `${fileName}_${timestamp}`;
  }

  /**
   * Generate cache key
   * @param {string} filePath - File path
   * @param {AnalysisOptions} options - Analysis options
   * @returns {string} Cache key
   */
  generateCacheKey(filePath, options) {
    const fileHash = require('crypto').createHash('md5').update(filePath).digest('hex');
    const optionsHash = require('crypto').createHash('md5').update(JSON.stringify(options)).digest('hex');
    return `template_analysis_${fileHash}_${optionsHash}`;
  }

  /**
   * Get file information
   * @param {string} filePath - File path
   * @returns {Promise<Object>} File information
   */
  async getFileInfo(filePath) {
    const stats = await fs.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    return {
      fileName: path.basename(filePath),
      filePath,
      fileSize: stats.size,
      fileType: this.getFileTypeFromExtension(ext),
      modifiedAt: stats.mtime
    };
  }

  /**
   * Get file type from extension
   * @param {string} extension - File extension
   * @returns {string} File type
   */
  getFileTypeFromExtension(extension) {
    const typeMap = {
      '.docx': 'docx',
      '.pdf': 'pdf',
      '.txt': 'txt'
    };
    
    return typeMap[extension] || 'unknown';
  }

  /**
   * Validate template file
   * @param {string} filePath - File path
   * @returns {Promise<void>}
   */
  async validateTemplateFile(filePath) {
    try {
      const stats = await fs.stat(filePath);
      
      if (!stats.isFile()) {
        throw new Error('Path does not point to a file');
      }
      
      if (stats.size === 0) {
        throw new Error('File is empty');
      }
      
      const ext = path.extname(filePath).toLowerCase();
      if (!['.docx', '.pdf', '.txt'].includes(ext)) {
        throw new Error(`Unsupported file type: ${ext}`);
      }
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('File not found');
      }
      throw error;
    }
  }

  /**
   * Generate metadata
   * @param {Object} fileInfo - File information
   * @param {PlaceholderVariable[]} placeholders - Placeholder variables
   * @param {DocumentStructure} structure - Document structure
   * @returns {Promise<Object>} Metadata object
   */
  async generateMetadata(fileInfo, placeholders, structure) {
    return {
      fileInfo,
      analysis: {
        totalPlaceholders: placeholders.length,
        requiredPlaceholders: placeholders.filter(p => p.required).length,
        placeholderTypes: this.countPlaceholderTypes(placeholders),
        hasStructure: !!structure,
        complexity: this.calculateComplexity(placeholders, structure)
      },
      processing: {
        analyzedAt: new Date().toISOString(),
        analysisVersion: '1.0.0',
        options: this.options
      }
    };
  }

  /**
   * Generate statistics
   * @param {PlaceholderVariable[]} placeholders - Placeholder variables
   * @param {DocumentStructure} structure - Document structure
   * @param {string} textContent - Text content
   * @returns {Object} Statistics object
   */
  generateStatistics(placeholders, structure, textContent) {
    return {
      placeholders: {
        total: placeholders.length,
        byType: this.countPlaceholderTypes(placeholders),
        bySyntax: this.countPlaceholderSyntax(placeholders),
        required: placeholders.filter(p => p.required).length,
        optional: placeholders.filter(p => !p.required).length
      },
      structure: structure ? {
        sections: structure.sections.length,
        headings: structure.headings.length,
        tables: structure.tables.length,
        lists: structure.lists.length,
        totalPages: structure.totalPages,
        wordCount: structure.wordCount
      } : null,
      content: {
        totalCharacters: textContent.length,
        totalWords: this.countWords(textContent),
        totalLines: textContent.split('\n').length,
        averageWordsPerLine: this.countWords(textContent) / textContent.split('\n').length
      }
    };
  }

  /**
   * Count placeholder types
   * @param {PlaceholderVariable[]} placeholders - Placeholder variables
   * @returns {Object} Type counts
   */
  countPlaceholderTypes(placeholders) {
    const counts = {};
    
    for (const placeholder of placeholders) {
      counts[placeholder.type] = (counts[placeholder.type] || 0) + 1;
    }
    
    return counts;
  }

  /**
   * Count placeholder syntax
   * @param {PlaceholderVariable[]} placeholders - Placeholder variables
   * @returns {Object} Syntax counts
   */
  countPlaceholderSyntax(placeholders) {
    const counts = {};
    
    for (const placeholder of placeholders) {
      const syntax = placeholder.syntax.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      counts[syntax] = (counts[syntax] || 0) + 1;
    }
    
    return counts;
  }

  /**
   * Calculate template complexity
   * @param {PlaceholderVariable[]} placeholders - Placeholder variables
   * @param {DocumentStructure} structure - Document structure
   * @returns {string} Complexity level
   */
  calculateComplexity(placeholders, structure) {
    let score = 0;
    
    // Placeholder complexity
    score += placeholders.length * 2;
    score += placeholders.filter(p => p.type !== 'string').length * 3;
    
    // Structure complexity
    if (structure) {
      score += structure.sections.length * 2;
      score += structure.tables.length * 5;
      score += structure.lists.length * 1;
    }
    
    if (score < 10) return 'Simple';
    if (score < 25) return 'Moderate';
    if (score < 50) return 'Complex';
    return 'Very Complex';
  }

  /**
   * Enhance analysis with AI
   * @param {TemplateAnalysis} analysis - Template analysis
   * @param {AnalysisOptions} options - Analysis options
   * @returns {Promise<void>}
   */
  async enhanceWithAI(analysis, options) {
    if (!this.openai || !options.useAI) return;
    
    try {
      // Enhance placeholder descriptions
      for (const placeholder of analysis.placeholders) {
        if (options.generateDescriptions) {
          placeholder.description = await this.generateVariableDescription(
            placeholder.name,
            placeholder.type,
            placeholder.metadata.context
          );
        }
      }
      
      // Add AI insights
      analysis.metadata.aiInsights = await this.generateAIInsights(analysis);
      
    } catch (error) {
      // Log AI enhancement errors but don't fail the analysis
      console.warn('AI enhancement failed:', error.message);
    }
  }

  /**
   * Generate AI insights
   * @param {TemplateAnalysis} analysis - Template analysis
   * @returns {Promise<Object>} AI insights
   */
  async generateAIInsights(analysis) {
    try {
      const prompt = `Analyze this document template and provide insights:

Template: ${analysis.fileName}
Placeholders: ${analysis.placeholders.map(p => p.name).join(', ')}
Structure: ${analysis.structure ? `${analysis.structure.sections.length} sections, ${analysis.structure.tables.length} tables` : 'No structure analysis'}

Provide 2-3 insights about:
1. Template complexity and usage
2. Potential improvements
3. Best practices for this type of template

Keep insights concise and actionable.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a document template expert. Provide concise, actionable insights.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.3
      });

      return {
        insights: response.choices[0].message.content.trim().split('\n').filter(line => line.trim()),
        generatedAt: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        insights: ['AI insights generation failed'],
        generatedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Clear cache
   * @returns {void}
   */
  clearCache() {
    if (this.cache) {
      this.cache.flushAll();
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    if (!this.cache) {
      return { enabled: false };
    }
    
    return {
      enabled: true,
      keys: this.cache.keys().length,
      hits: this.cache.getStats().hits,
      misses: this.cache.getStats().misses,
      ttl: this.options.cacheTTL
    };
  }

  /**
   * Batch analyze multiple templates
   * @param {string[]} templatePaths - Array of template file paths
   * @param {Object} options - Batch analysis options
   * @returns {Promise<Array>} Array of analysis results
   */
  async batchAnalyzeTemplates(templatePaths, options = {}) {
    try {
      const {
        parallel = true,
        maxConcurrent = 5,
        includeComparison = false,
        useAI = false
      } = options;

      if (templatePaths.length === 0) {
        return [];
      }

      const results = [];
      
      if (parallel) {
        // Process templates in parallel with concurrency limit
        const chunks = this.chunkArray(templatePaths, maxConcurrent);
        
        for (const chunk of chunks) {
          const chunkPromises = chunk.map(async (templatePath) => {
            try {
              const analysis = await this.analyzeTemplate(
                templatePath,
                path.extname(templatePath).substring(1),
                { useAI }
              );
              
              return {
                ...analysis,
                path: templatePath,
                status: 'success'
              };
            } catch (error) {
              return {
                path: templatePath,
                status: 'error',
                error: error.message
              };
            }
          });

          const chunkResults = await Promise.all(chunkPromises);
          results.push(...chunkResults);
        }
      } else {
        // Process templates sequentially
        for (const templatePath of templatePaths) {
          try {
            const analysis = await this.analyzeTemplate(
              templatePath,
              path.extname(templatePath).substring(1),
              { useAI }
            );
            
            results.push({
              ...analysis,
              path: templatePath,
              status: 'success'
            });
          } catch (error) {
            results.push({
              path: templatePath,
              status: 'error',
              error: error.message
            });
          }
        }
      }

      // Add comparison analysis if requested and we have multiple successful results
      if (includeComparison && results.filter(r => r.status === 'success').length > 1) {
        const successfulResults = results.filter(r => r.status === 'success');
        
        for (let i = 0; i < successfulResults.length - 1; i++) {
          for (let j = i + 1; j < successfulResults.length; j++) {
            const comparison = await this.compareTemplates(
              successfulResults[i].path,
              successfulResults[j].path,
              { useAI }
            );
            
            // Add comparison to both results
            if (!successfulResults[i].comparisons) successfulResults[i].comparisons = [];
            if (!successfulResults[j].comparisons) successfulResults[j].comparisons = [];
            
            successfulResults[i].comparisons.push({
              with: path.basename(successfulResults[j].path),
              comparison
            });
            
            successfulResults[j].comparisons.push({
              with: path.basename(successfulResults[i].path),
              comparison
            });
          }
        }
      }

      // Add batch summary
      const batchSummary = {
        totalTemplates: templatePaths.length,
        successful: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'error').length,
        processingMode: parallel ? 'parallel' : 'sequential',
        maxConcurrent: parallel ? maxConcurrent : 1,
        totalProcessingTime: this.calculateTotalProcessingTime(results)
      };

      return results.map(result => ({
        ...result,
        batchSummary
      }));

    } catch (error) {
      throw new FileProcessingError(`Failed to batch analyze templates: ${error.message}`);
    }
  }

  /**
   * Split array into chunks for parallel processing
   * @param {Array} array - Array to chunk
   * @param {number} chunkSize - Size of each chunk
   * @returns {Array} Array of chunks
   */
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Calculate total processing time for batch analysis
   * @param {Array} results - Analysis results
   * @returns {number} Total processing time in milliseconds
   */
  calculateTotalProcessingTime(results) {
    // This would typically track actual processing time
    // For now, return estimated time based on file sizes
    const totalSize = results.reduce((sum, result) => {
      return sum + (result.fileSize || 0);
    }, 0);
    
    // Rough estimate: 1ms per KB
    return Math.round(totalSize / 1024);
  }

  /**
   * Compare two templates and identify differences
   * @param {string} template1Path - Path to first template
   * @param {string} template2Path - Path to second template
   * @param {Object} options - Comparison options
   * @returns {Promise<Object>} Template comparison results
   */
  async compareTemplates(template1Path, template2Path, options = {}) {
    try {
      const {
        compareStructure = true,
        comparePlaceholders = true,
        compareFormatting = true,
        generateDiff = true,
        useAI = false
      } = options;

      // Analyze both templates
      const [analysis1, analysis2] = await Promise.all([
        this.analyzeTemplate(template1Path, path.extname(template1Path).substring(1)),
        this.analyzeTemplate(template2Path, path.extname(template2Path).substring(1))
      ]);

      const comparison = {
        summary: {
          totalDifferences: 0,
          structuralDifferences: 0,
          placeholderDifferences: 0,
          formattingDifferences: 0
        },
        differences: {},
        similarities: {},
        recommendations: []
      };

      // Compare placeholders
      if (comparePlaceholders) {
        const placeholderComparison = this.comparePlaceholders(
          analysis1.placeholders,
          analysis2.placeholders
        );
        comparison.differences.placeholders = placeholderComparison.differences;
        comparison.similarities.placeholders = placeholderComparison.similarities;
        comparison.summary.placeholderDifferences = placeholderComparison.differences.length;
        comparison.summary.totalDifferences += placeholderComparison.differences.length;
      }

      // Compare structure
      if (compareStructure && analysis1.structure && analysis2.structure) {
        const structureComparison = this.compareStructure(
          analysis1.structure,
          analysis2.structure
        );
        comparison.differences.structure = structureComparison.differences;
        comparison.similarities.structure = structureComparison.similarities;
        comparison.summary.structuralDifferences = structureComparison.differences.length;
        comparison.summary.totalDifferences += structureComparison.differences.length;
      }

      // Compare formatting
      if (compareFormatting) {
        const formattingComparison = this.compareFormatting(
          analysis1.metadata,
          analysis2.metadata
        );
        comparison.differences.formatting = formattingComparison.differences;
        comparison.similarities.formatting = formattingComparison.similarities;
        comparison.summary.formattingDifferences = formattingComparison.differences.length;
        comparison.summary.totalDifferences += formattingComparison.differences.length;
      }

      // Generate AI-powered recommendations if enabled
      if (useAI && this.openai) {
        comparison.recommendations = await this.generateComparisonRecommendations(
          analysis1,
          analysis2,
          comparison
        );
      }

      // Generate diff summary
      if (generateDiff) {
        comparison.diffSummary = this.generateDiffSummary(comparison);
      }

      return comparison;

    } catch (error) {
      throw new FileProcessingError(`Failed to compare templates: ${error.message}`);
    }
  }

  /**
   * Compare placeholder variables between two templates
   * @param {PlaceholderVariable[]} placeholders1 - First template placeholders
   * @param {PlaceholderVariable[]} placeholders2 - Second template placeholders
   * @returns {Object} Placeholder comparison results
   */
  comparePlaceholders(placeholders1, placeholders2) {
    const names1 = placeholders1.map(p => p.name);
    const names2 = placeholders2.map(p => p.name);

    const differences = [];
    const similarities = [];

    // Find unique placeholders in each template
    const uniqueTo1 = names1.filter(name => !names2.includes(name));
    const uniqueTo2 = names2.filter(name => !names1.includes(name));
    const common = names1.filter(name => names2.includes(name));

    // Add differences
    uniqueTo1.forEach(name => {
      differences.push({
        type: 'missing_in_template2',
        placeholder: name,
        template1: placeholders1.find(p => p.name === name),
        template2: null
      });
    });

    uniqueTo2.forEach(name => {
      differences.push({
        type: 'missing_in_template1',
        placeholder: name,
        template1: null,
        template2: placeholders2.find(p => p.name === name)
      });
    });

    // Add similarities
    common.forEach(name => {
      const p1 = placeholders1.find(p => p.name === name);
      const p2 = placeholders2.find(p => p.name === name);
      
      similarities.push({
        placeholder: name,
        template1: p1,
        template2: p2,
        typeMatch: p1.type === p2.type,
        descriptionMatch: p1.description === p2.description
      });
    });

    return { differences, similarities };
  }

  /**
   * Compare document structure between two templates
   * @param {DocumentStructure} structure1 - First template structure
   * @param {DocumentStructure} structure2 - Second template structure
   * @returns {Object} Structure comparison results
   */
  compareStructure(structure1, structure2) {
    const differences = [];
    const similarities = [];

    // Compare sections
    if (structure1.sections && structure2.sections) {
      const sectionDiff = Math.abs(structure1.sections.length - structure2.sections.length);
      if (sectionDiff > 0) {
        differences.push({
          type: 'section_count_mismatch',
          template1: structure1.sections.length,
          template2: structure2.sections.length,
          difference: sectionDiff
        });
      }
    }

    // Compare headings
    if (structure1.headings && structure2.headings) {
      const headingDiff = Math.abs(structure1.headings.length - structure2.headings.length);
      if (headingDiff > 0) {
        differences.push({
          type: 'heading_count_mismatch',
          template1: structure1.headings.length,
          template2: structure2.headings.length,
          difference: headingDiff
        });
      }
    }

    // Compare tables
    if (structure1.tables && structure2.tables) {
      const tableDiff = Math.abs(structure1.tables.length - structure2.tables.length);
      if (tableDiff > 0) {
        differences.push({
          type: 'table_count_mismatch',
          template1: structure1.tables.length,
          template2: structure2.tables.length,
          difference: tableDiff
        });
      }
    }

    // Add similarities
    similarities.push({
      type: 'word_count',
      template1: structure1.wordCount,
      template2: structure2.wordCount,
      difference: Math.abs(structure1.wordCount - structure2.wordCount)
    });

    return { differences, similarities };
  }

  /**
   * Compare formatting between two templates
   * @param {Object} metadata1 - First template metadata
   * @param {Object} metadata2 - Second template metadata
   * @returns {Object} Formatting comparison results
   */
  compareFormatting(metadata1, metadata2) {
    const differences = [];
    const similarities = [];

    // Compare file types
    if (metadata1.fileType !== metadata2.fileType) {
      differences.push({
        type: 'file_type_mismatch',
        template1: metadata1.fileType,
        template2: metadata2.fileType
      });
    }

    // Compare file sizes
    if (metadata1.fileSize && metadata2.fileSize) {
      const sizeDiff = Math.abs(metadata1.fileSize - metadata2.fileSize);
      const sizeDiffPercent = (sizeDiff / Math.max(metadata1.fileSize, metadata2.fileSize)) * 100;
      
      if (sizeDiffPercent > 10) { // 10% threshold
        differences.push({
          type: 'size_difference',
          template1: metadata1.fileSize,
          template2: metadata2.fileSize,
          difference: sizeDiff,
          differencePercent: sizeDiffPercent.toFixed(2)
        });
      }
    }

    // Add similarities
    similarities.push({
      type: 'formatting',
      template1: metadata1.formatting || 'standard',
      template2: metadata2.formatting || 'standard',
      match: (metadata1.formatting || 'standard') === (metadata2.formatting || 'standard')
    });

    return { differences, similarities };
  }

  /**
   * Generate AI-powered comparison recommendations
   * @param {TemplateAnalysis} analysis1 - First template analysis
   * @param {TemplateAnalysis} analysis2 - Second template analysis
   * @param {Object} comparison - Comparison results
   * @returns {Promise<Array>} AI recommendations
   */
  async generateComparisonRecommendations(analysis1, analysis2, comparison) {
    try {
      const prompt = `Analyze these two document templates and provide recommendations:

Template 1: ${analysis1.fileName} (${analysis1.placeholders.length} placeholders)
Template 2: ${analysis2.fileName} (${analysis2.placeholders.length} placeholders)

Key differences found:
- Placeholder differences: ${comparison.summary.placeholderDifferences}
- Structural differences: ${comparison.summary.structuralDifferences}
- Total differences: ${comparison.summary.totalDifferences}

Provide 3-5 actionable recommendations for:
1. Standardizing the templates
2. Improving consistency
3. Best practices for template management

Keep recommendations concise and practical.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a document template expert. Provide practical recommendations for template standardization.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 300,
        temperature: 0.3
      });

      return response.choices[0].message.content.trim().split('\n').filter(line => line.trim());
      
    } catch (error) {
      return ['AI recommendations generation failed'];
    }
  }

  /**
   * Generate a summary of differences
   * @param {Object} comparison - Comparison results
   * @returns {Object} Diff summary
   */
  generateDiffSummary(comparison) {
    const summary = {
      overall: comparison.summary.totalDifferences === 0 ? 'identical' : 'different',
      confidence: this.calculateComparisonConfidence(comparison),
      keyDifferences: [],
      actionItems: []
    };

    // Identify key differences
    if (comparison.differences.placeholders) {
      const missingIn2 = comparison.differences.placeholders.filter(d => d.type === 'missing_in_template2');
      const missingIn1 = comparison.differences.placeholders.filter(d => d.type === 'missing_in_template1');
      
      if (missingIn2.length > 0) {
        summary.keyDifferences.push(`${missingIn2.length} placeholders missing in template 2`);
        summary.actionItems.push('Add missing placeholders to template 2');
      }
      
      if (missingIn1.length > 0) {
        summary.keyDifferences.push(`${missingIn1.length} placeholders missing in template 1`);
        summary.actionItems.push('Add missing placeholders to template 1');
      }
    }

    // Add structural differences
    if (comparison.differences.structure) {
      const structuralIssues = comparison.differences.structure.map(d => d.type);
      summary.keyDifferences.push(`Structural differences: ${structuralIssues.join(', ')}`);
      summary.actionItems.push('Review and align document structure');
    }

    return summary;
  }

  /**
   * Calculate confidence score for comparison
   * @param {Object} comparison - Comparison results
   * @returns {number} Confidence score (0-100)
   */
  calculateComparisonConfidence(comparison) {
    let confidence = 100;
    
    // Reduce confidence based on differences
    if (comparison.summary.placeholderDifferences > 0) {
      confidence -= Math.min(comparison.summary.placeholderDifferences * 5, 30);
    }
    
    if (comparison.summary.structuralDifferences > 0) {
      confidence -= Math.min(comparison.summary.structuralDifferences * 10, 40);
    }
    
    if (comparison.summary.formattingDifferences > 0) {
      confidence -= Math.min(comparison.summary.formattingDifferences * 3, 20);
    }
    
    return Math.max(confidence, 0);
  }

  /**
   * Get insights about all templates
   * @param {Array} templates - Array of template analyses
   * @returns {Object} Template insights
   */
  getTemplatesInsights(templates = []) {
    try {
      if (!templates || templates.length === 0) {
        return {
          totalTemplates: 0,
          averagePlaceholders: 0,
          commonFieldTypes: [],
          complexityDistribution: {},
          recommendations: []
        };
      }

      const insights = {
        totalTemplates: templates.length,
        averagePlaceholders: 0,
        commonFieldTypes: [],
        complexityDistribution: {},
        fileTypeDistribution: {},
        sizeDistribution: {},
        recommendations: []
      };

      // Calculate average placeholders
      const totalPlaceholders = templates.reduce((sum, template) => {
        return sum + (template.placeholders ? template.placeholders.length : 0);
      }, 0);
      insights.averagePlaceholders = Math.round(totalPlaceholders / templates.length);

      // Analyze field types
      const fieldTypes = {};
      templates.forEach(template => {
        if (template.placeholders) {
          template.placeholders.forEach(placeholder => {
            const type = placeholder.type || 'unknown';
            fieldTypes[type] = (fieldTypes[type] || 0) + 1;
          });
        }
      });

      insights.commonFieldTypes = Object.entries(fieldTypes)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([type, count]) => ({ type, count, percentage: Math.round((count / totalPlaceholders) * 100) }));

      // Complexity distribution
      templates.forEach(template => {
        const complexity = template.complexity || 'Unknown';
        insights.complexityDistribution[complexity] = (insights.complexityDistribution[complexity] || 0) + 1;
      });

      // File type distribution
      templates.forEach(template => {
        const fileType = template.fileType || 'unknown';
        insights.fileTypeDistribution[fileType] = (insights.fileTypeDistribution[fileType] || 0) + 1;
      });

      // Size distribution
      const sizes = templates.map(t => t.fileSize || 0).filter(size => size > 0);
      if (sizes.length > 0) {
        const avgSize = sizes.reduce((sum, size) => sum + size, 0) / sizes.length;
        insights.sizeDistribution = {
          average: Math.round(avgSize / 1024), // KB
          smallest: Math.round(Math.min(...sizes) / 1024),
          largest: Math.round(Math.max(...sizes) / 1024)
        };
      }

      // Generate recommendations
      insights.recommendations = this.generateInsightsRecommendations(insights);

      return insights;

    } catch (error) {
      console.error('Error generating template insights:', error);
      return {
        totalTemplates: 0,
        error: 'Failed to generate insights'
      };
    }
  }

  /**
   * Get template patterns and trends
   * @param {Array} templates - Array of template analyses
   * @returns {Object} Template patterns
   */
  getTemplatePatterns(templates = []) {
    try {
      if (!templates || templates.length === 0) {
        return {
          patterns: [],
          trends: [],
          anomalies: []
        };
      }

      const patterns = {
        patterns: [],
        trends: [],
        anomalies: []
      };

      // Analyze naming patterns
      const namingPatterns = this.analyzeNamingPatterns(templates);
      patterns.patterns.push(...namingPatterns);

      // Analyze structural patterns
      const structuralPatterns = this.analyzeStructuralPatterns(templates);
      patterns.patterns.push(...structuralPatterns);

      // Analyze field patterns
      const fieldPatterns = this.analyzeFieldPatterns(templates);
      patterns.patterns.push(...fieldPatterns);

      // Detect trends
      patterns.trends = this.detectTrends(templates);

      // Detect anomalies
      patterns.anomalies = this.detectAnomalies(templates);

      return patterns;

    } catch (error) {
      console.error('Error analyzing template patterns:', error);
      return {
        patterns: [],
        trends: [],
        anomalies: []
      };
    }
  }

  /**
   * Get template recommendations
   * @param {Array} templates - Array of template analyses
   * @param {Object} userPreferences - User preferences and requirements
   * @returns {Object} Template recommendations
   */
  getTemplateRecommendations(templates = [], userPreferences = {}) {
    try {
      if (!templates || templates.length === 0) {
        return {
          recommendations: [],
          bestPractices: [],
          optimization: []
        };
      }

      const recommendations = {
        recommendations: [],
        bestPractices: [],
        optimization: []
      };

      // Generate field standardization recommendations
      const fieldRecommendations = this.generateFieldStandardizationRecommendations(templates);
      recommendations.recommendations.push(...fieldRecommendations);

      // Generate structure optimization recommendations
      const structureRecommendations = this.generateStructureOptimizationRecommendations(templates);
      recommendations.recommendations.push(...structureRecommendations);

      // Generate best practices
      recommendations.bestPractices = this.generateBestPractices(templates);

      // Generate optimization suggestions
      recommendations.optimization = this.generateOptimizationSuggestions(templates, userPreferences);

      return recommendations;

    } catch (error) {
      console.error('Error generating template recommendations:', error);
      return {
        recommendations: [],
        bestPractices: [],
        optimization: []
      };
    }
  }

  /**
   * Generate insights recommendations
   * @param {Object} insights - Template insights
   * @returns {Array} Recommendations
   */
  generateInsightsRecommendations(insights) {
    const recommendations = [];

    if (insights.averagePlaceholders > 20) {
      recommendations.push({
        type: 'warning',
        message: 'High average placeholder count detected. Consider simplifying templates for better maintainability.',
        action: 'review_complexity'
      });
    }

    if (insights.complexityDistribution['Complex'] > insights.totalTemplates * 0.3) {
      recommendations.push({
        type: 'info',
        message: 'Many complex templates detected. Consider providing templates for different skill levels.',
        action: 'create_simple_versions'
      });
    }

    if (Object.keys(insights.fileTypeDistribution).length > 3) {
      recommendations.push({
        type: 'info',
        message: 'Multiple file types detected. Consider standardizing on one format for consistency.',
        action: 'standardize_format'
      });
    }

    return recommendations;
  }

  /**
   * Analyze naming patterns in templates
   * @param {Array} templates - Array of template analyses
   * @returns {Array} Naming patterns
   */
  analyzeNamingPatterns(templates) {
    const patterns = [];
    
    // Analyze placeholder naming conventions
    const namingConventions = {};
    templates.forEach(template => {
      if (template.placeholders) {
        template.placeholders.forEach(placeholder => {
          const convention = this.detectNamingConvention(placeholder.name);
          namingConventions[convention] = (namingConventions[convention] || 0) + 1;
        });
      }
    });

    if (Object.keys(namingConventions).length > 1) {
      patterns.push({
        type: 'naming_convention',
        message: 'Mixed naming conventions detected',
        details: namingConventions,
        recommendation: 'Standardize naming conventions across templates'
      });
    }

    return patterns;
  }

  /**
   * Analyze structural patterns in templates
   * @param {Array} templates - Array of template analyses
   * @returns {Array} Structural patterns
   */
  analyzeStructuralPatterns(templates) {
    const patterns = [];
    
    // Analyze section patterns
    const sectionCounts = templates.map(t => t.structure?.sections?.length || 0);
    const avgSections = sectionCounts.reduce((sum, count) => sum + count, 0) / sectionCounts.length;
    
    if (avgSections > 10) {
      patterns.push({
        type: 'structure_complexity',
        message: 'High average section count detected',
        details: { average: Math.round(avgSections) },
        recommendation: 'Consider breaking complex templates into smaller components'
      });
    }

    return patterns;
  }

  /**
   * Analyze field patterns in templates
   * @param {Array} templates - Array of template analyses
   * @returns {Array} Field patterns
   */
  analyzeFieldPatterns(templates) {
    const patterns = [];
    
    // Analyze common field combinations
    const fieldCombinations = {};
    templates.forEach(template => {
      if (template.placeholders && template.placeholders.length > 1) {
        const fieldNames = template.placeholders.map(p => p.name).sort();
        const combination = fieldNames.join('+');
        fieldCombinations[combination] = (fieldCombinations[combination] || 0) + 1;
      }
    });

    // Find frequently occurring combinations
    Object.entries(fieldCombinations)
      .filter(([, count]) => count > 2)
      .forEach(([combination, count]) => {
        patterns.push({
          type: 'field_combination',
          message: 'Common field combination detected',
          details: { combination, count },
          recommendation: 'Consider creating a reusable field group'
        });
      });

    return patterns;
  }

  /**
   * Detect trends in templates
   * @param {Array} templates - Array of template analyses
   * @returns {Array} Trends
   */
  detectTrends(templates) {
    const trends = [];
    
    // Analyze template size trends
    const sizes = templates.map(t => t.fileSize || 0).filter(size => size > 0);
    if (sizes.length > 1) {
      const sortedSizes = sizes.sort((a, b) => a - b);
      const sizeTrend = this.calculateTrend(sortedSizes);
      
      if (Math.abs(sizeTrend) > 0.1) {
        trends.push({
          type: 'size_trend',
          direction: sizeTrend > 0 ? 'increasing' : 'decreasing',
          magnitude: Math.abs(sizeTrend),
          recommendation: sizeTrend > 0 ? 'Monitor template size growth' : 'Templates are becoming more concise'
        });
      }
    }

    return trends;
  }

  /**
   * Detect anomalies in templates
   * @param {Array} templates - Array of template analyses
   * @returns {Array} Anomalies
   */
  detectAnomalies(templates) {
    const anomalies = [];
    
    // Detect unusually large templates
    const sizes = templates.map(t => t.fileSize || 0).filter(size => size > 0);
    if (sizes.length > 0) {
      const avgSize = sizes.reduce((sum, size) => sum + size, 0) / sizes.length;
      const stdDev = this.calculateStandardDeviation(sizes);
      
      sizes.forEach((size, index) => {
        if (Math.abs(size - avgSize) > 2 * stdDev) {
          anomalies.push({
            type: 'size_anomaly',
            template: templates[index].fileName || `Template ${index}`,
            size: size,
            average: avgSize,
            deviation: Math.round((size - avgSize) / stdDev * 100) / 100
          });
        }
      });
    }

    return anomalies;
  }

  /**
   * Generate field standardization recommendations
   * @param {Array} templates - Array of template analyses
   * @returns {Array} Field recommendations
   */
  generateFieldStandardizationRecommendations(templates) {
    const recommendations = [];
    
    // Analyze field type consistency
    const fieldTypes = {};
    templates.forEach(template => {
      if (template.placeholders) {
        template.placeholders.forEach(placeholder => {
          const name = placeholder.name.toLowerCase();
          if (!fieldTypes[name]) fieldTypes[name] = [];
          fieldTypes[name].push(placeholder.type || 'unknown');
        });
      }
    });

    // Find inconsistent field types
    Object.entries(fieldTypes).forEach(([fieldName, types]) => {
      if (types.length > 1 && new Set(types).size > 1) {
        recommendations.push({
          type: 'field_standardization',
          field: fieldName,
          message: `Inconsistent field type for '${fieldName}'`,
          details: { types: [...new Set(types)] },
          action: 'Standardize field type across templates'
        });
      }
    });

    return recommendations;
  }

  /**
   * Generate structure optimization recommendations
   * @param {Array} templates - Array of template analyses
   * @returns {Array} Structure recommendations
   */
  generateStructureOptimizationRecommendations(templates) {
    const recommendations = [];
    
    // Analyze section complexity
    const complexTemplates = templates.filter(t => 
      t.structure && t.structure.sections && t.structure.sections.length > 15
    );

    if (complexTemplates.length > 0) {
      recommendations.push({
        type: 'structure_optimization',
        message: 'Complex templates detected',
        details: { count: complexTemplates.length },
        action: 'Consider breaking into smaller, focused templates'
      });
    }

    return recommendations;
  }

  /**
   * Generate best practices
   * @param {Array} templates - Array of template analyses
   * @returns {Array} Best practices
   */
  generateBestPractices(templates) {
    return [
      {
        type: 'naming',
        practice: 'Use consistent naming conventions for placeholders',
        examples: ['firstName', 'lastName', 'emailAddress']
      },
      {
        type: 'structure',
        practice: 'Keep templates focused on single purpose',
        examples: ['Separate contracts, letters, and forms']
      },
      {
        type: 'fields',
        practice: 'Group related fields together',
        examples: ['Personal info, contact info, employment details']
      }
    ];
  }

  /**
   * Generate optimization suggestions
   * @param {Array} templates - Array of template analyses
   * @param {Object} userPreferences - User preferences
   * @returns {Array} Optimization suggestions
   */
  generateOptimizationSuggestions(templates, userPreferences) {
    const suggestions = [];
    
    // Analyze based on user preferences
    if (userPreferences.priority === 'performance') {
      suggestions.push({
        type: 'performance',
        message: 'Optimize for processing speed',
        actions: ['Reduce placeholder count', 'Simplify conditional logic', 'Use efficient field types']
      });
    }

    if (userPreferences.priority === 'maintainability') {
      suggestions.push({
        type: 'maintainability',
        message: 'Optimize for easy maintenance',
        actions: ['Standardize field names', 'Create field groups', 'Document template structure']
      });
    }

    return suggestions;
  }

  /**
   * Detect naming convention
   * @param {string} fieldName - Field name
   * @returns {string} Naming convention
   */
  detectNamingConvention(fieldName) {
    if (/^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/.test(fieldName)) {
      return 'camelCase';
    } else if (/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(fieldName)) {
      return 'snake_case';
    } else if (/^[A-Z][a-z0-9]*([A-Z][a-z0-9]*)*$/.test(fieldName)) {
      return 'PascalCase';
    } else {
      return 'mixed';
    }
  }

  /**
   * Calculate trend
   * @param {Array} values - Array of numeric values
   * @returns {number} Trend value
   */
  calculateTrend(values) {
    if (values.length < 2) return 0;
    
    const n = values.length;
    const sumX = (n * (n + 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, index) => sum + val * (index + 1), 0);
    const sumX2 = (n * (n + 1) * (2 * n + 1)) / 6;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  /**
   * Calculate standard deviation
   * @param {Array} values - Array of numeric values
   * @returns {number} Standard deviation
   */
  calculateStandardDeviation(values) {
    if (values.length < 2) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
    
    return Math.sqrt(variance);
  }
}

module.exports = TemplateAnalyzerService;
