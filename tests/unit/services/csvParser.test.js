const CSVParser = require('../../services/csvParser');
const fs = require('fs-extra');
const path = require('path');

// Mock external dependencies
jest.mock('fs-extra');
jest.mock('path');

describe('CSV Parser Service', () => {
  let csvParser;
  
  beforeEach(() => {
    csvParser = new CSVParser();
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('parseCSV', () => {
    it('should parse valid CSV content successfully', async () => {
      const csvContent = 'name,email,company\nJohn Doe,john@example.com,ACME Corp\nJane Smith,jane@example.com,Tech Inc';
      const expectedResult = [
        { name: 'John Doe', email: 'john@example.com', company: 'ACME Corp' },
        { name: 'Jane Smith', email: 'jane@example.com', company: 'Tech Inc' }
      ];
      
      const result = await csvParser.parseCSV(csvContent);
      expect(result).toEqual(expectedResult);
    });
    
    it('should handle CSV with different delimiters', async () => {
      const csvContent = 'name;email;company\nJohn Doe;john@example.com;ACME Corp';
      const expectedResult = [
        { name: 'John Doe', email: 'john@example.com', company: 'ACME Corp' }
      ];
      
      const result = await csvParser.parseCSV(csvContent, { delimiter: ';' });
      expect(result).toEqual(expectedResult);
    });
    
    it('should handle empty CSV content', async () => {
      const result = await csvParser.parseCSV('');
      expect(result).toEqual([]);
    });
    
    it('should handle CSV with only headers', async () => {
      const csvContent = 'name,email,company';
      const result = await csvParser.parseCSV(csvContent);
      expect(result).toEqual([]);
    });
    
    it('should handle CSV with quoted fields', async () => {
      const csvContent = '"name","email","company"\n"John Doe","john@example.com","ACME Corp"';
      const expectedResult = [
        { name: 'John Doe', email: 'john@example.com', company: 'ACME Corp' }
      ];
      
      const result = await csvParser.parseCSV(csvContent);
      expect(result).toEqual(expectedResult);
    });
    
    it('should handle CSV with commas in quoted fields', async () => {
      const csvContent = 'name,email,company\n"John Doe, Jr.","john@example.com","ACME Corp, Inc."';
      const expectedResult = [
        { name: 'John Doe, Jr.', email: 'john@example.com', company: 'ACME Corp, Inc.' }
      ];
      
      const result = await csvParser.parseCSV(csvContent);
      expect(result).toEqual(expectedResult);
    });
    
    it('should handle CSV with newlines in quoted fields', async () => {
      const csvContent = 'name,email,company\n"John Doe","john@example.com","ACME\nCorp"';
      const expectedResult = [
        { name: 'John Doe', email: 'john@example.com', company: 'ACME\nCorp' }
      ];
      
      const result = await csvParser.parseCSV(csvContent);
      expect(result).toEqual(expectedResult);
    });
    
    it('should throw error for malformed CSV', async () => {
      const malformedCSV = 'name,email,company\nJohn Doe,john@example.com\nJane Smith,jane@example.com,Tech Inc,Extra Field';
      
      await expect(csvParser.parseCSV(malformedCSV)).rejects.toThrow();
    });
  });
  
  describe('parseCSVFile', () => {
    it('should parse CSV file successfully', async () => {
      const filePath = '/test/path/test.csv';
      const csvContent = 'name,email,company\nJohn Doe,john@example.com,ACME Corp';
      const expectedResult = [
        { name: 'John Doe', email: 'john@example.com', company: 'ACME Corp' }
      ];
      
      fs.readFile.mockResolvedValue(csvContent);
      
      const result = await csvParser.parseCSVFile(filePath);
      expect(result).toEqual(expectedResult);
      expect(fs.readFile).toHaveBeenCalledWith(filePath, 'utf8');
    });
    
    it('should handle file read errors', async () => {
      const filePath = '/test/path/nonexistent.csv';
      const error = new Error('File not found');
      
      fs.readFile.mockRejectedValue(error);
      
      await expect(csvParser.parseCSVFile(filePath)).rejects.toThrow('File not found');
    });
  });
  
  describe('validateCSVStructure', () => {
    it('should validate CSV structure successfully', () => {
      const headers = ['name', 'email', 'company'];
      const data = [
        { name: 'John Doe', email: 'john@example.com', company: 'ACME Corp' },
        { name: 'Jane Smith', email: 'jane@example.com', company: 'Tech Inc' }
      ];
      
      const result = csvParser.validateCSVStructure(headers, data);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should detect missing required columns', () => {
      const headers = ['name', 'email'];
      const data = [
        { name: 'John Doe', email: 'john@example.com' }
      ];
      const requiredColumns = ['name', 'email', 'company'];
      
      const result = csvParser.validateCSVStructure(headers, data, requiredColumns);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required column: company');
    });
    
    it('should detect empty data rows', () => {
      const headers = ['name', 'email', 'company'];
      const data = [];
      
      const result = csvParser.validateCSVStructure(headers, data);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No data rows found');
    });
    
    it('should detect inconsistent column count', () => {
      const headers = ['name', 'email', 'company'];
      const data = [
        { name: 'John Doe', email: 'john@example.com', company: 'ACME Corp' },
        { name: 'Jane Smith', email: 'jane@example.com' } // Missing company
      ];
      
      const result = csvParser.validateCSVStructure(headers, data);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Inconsistent column count in row 2');
    });
  });
  
  describe('transformCSVData', () => {
    it('should transform CSV data with custom transformations', () => {
      const data = [
        { name: 'John Doe', email: 'john@example.com', company: 'ACME Corp' }
      ];
      
      const transformations = {
        name: (value) => value.toUpperCase(),
        email: (value) => value.toLowerCase(),
        company: (value) => value.replace('Corp', 'Corporation')
      };
      
      const result = csvParser.transformCSVData(data, transformations);
      expect(result[0].name).toBe('JOHN DOE');
      expect(result[0].email).toBe('john@example.com');
      expect(result[0].company).toBe('ACME Corporation');
    });
    
    it('should handle missing transformation functions', () => {
      const data = [
        { name: 'John Doe', email: 'john@example.com', company: 'ACME Corp' }
      ];
      
      const transformations = {
        name: (value) => value.toUpperCase()
      };
      
      const result = csvParser.transformCSVData(data, transformations);
      expect(result[0].name).toBe('JOHN DOE');
      expect(result[0].email).toBe('john@example.com'); // Unchanged
      expect(result[0].company).toBe('ACME Corp'); // Unchanged
    });
  });
  
  describe('generateCSV', () => {
    it('should generate CSV content from data', () => {
      const data = [
        { name: 'John Doe', email: 'john@example.com', company: 'ACME Corp' },
        { name: 'Jane Smith', email: 'jane@example.com', company: 'Tech Inc' }
      ];
      
      const result = csvParser.generateCSV(data);
      expect(result).toContain('name,email,company');
      expect(result).toContain('John Doe,john@example.com,ACME Corp');
      expect(result).toContain('Jane Smith,jane@example.com,Tech Inc');
    });
    
    it('should handle empty data array', () => {
      const result = csvParser.generateCSV([]);
      expect(result).toBe('');
    });
    
    it('should handle data with special characters', () => {
      const data = [
        { name: 'John "Doe"', email: 'john@example.com', company: 'ACME, Corp.' }
      ];
      
      const result = csvParser.generateCSV(data);
      expect(result).toContain('"John ""Doe"""');
      expect(result).toContain('"ACME, Corp."');
    });
  });
  
  describe('getCSVStats', () => {
    it('should return correct CSV statistics', () => {
      const data = [
        { name: 'John Doe', email: 'john@example.com', company: 'ACME Corp' },
        { name: 'Jane Smith', email: 'jane@example.com', company: 'Tech Inc' },
        { name: 'Bob Johnson', email: 'bob@example.com', company: 'Startup LLC' }
      ];
      
      const stats = csvParser.getCSVStats(data);
      expect(stats.rowCount).toBe(3);
      expect(stats.columnCount).toBe(3);
      expect(stats.columns).toEqual(['name', 'email', 'company']);
      expect(stats.hasEmptyCells).toBe(false);
    });
    
    it('should detect empty cells', () => {
      const data = [
        { name: 'John Doe', email: 'john@example.com', company: 'ACME Corp' },
        { name: 'Jane Smith', email: '', company: 'Tech Inc' }
      ];
      
      const stats = csvParser.getCSVStats(data);
      expect(stats.hasEmptyCells).toBe(true);
      expect(stats.emptyCellCount).toBe(1);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle invalid CSV format gracefully', async () => {
      const invalidCSV = 'name,email,company\nJohn Doe,john@example.com\nJane Smith,jane@example.com,Extra,Fields';
      
      await expect(csvParser.parseCSV(invalidCSV)).rejects.toThrow();
    });
    
    it('should handle encoding issues', async () => {
      const invalidEncoding = Buffer.from([0xFF, 0xFE, 0x00, 0x00]);
      
      await expect(csvParser.parseCSV(invalidEncoding)).rejects.toThrow();
    });
    
    it('should handle extremely large CSV files', async () => {
      // Create a large CSV string
      const headers = 'name,email,company\n';
      const row = 'John Doe,john@example.com,ACME Corp\n';
      const largeCSV = headers + row.repeat(10000); // 10,000 rows
      
      const result = await csvParser.parseCSV(largeCSV);
      expect(result).toHaveLength(10000);
    });
  });
  
  describe('Performance Tests', () => {
    it('should parse large CSV within reasonable time', async () => {
      const startTime = Date.now();
      
      // Create a large CSV string
      const headers = 'name,email,company,role,department,salary\n';
      const row = 'John Doe,john@example.com,ACME Corp,Developer,Engineering,75000\n';
      const largeCSV = headers + row.repeat(5000); // 5,000 rows
      
      const result = await csvParser.parseCSV(largeCSV);
      const endTime = Date.now();
      
      expect(result).toHaveLength(5000);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});
