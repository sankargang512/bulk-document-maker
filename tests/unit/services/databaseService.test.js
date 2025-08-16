const DatabaseService = require('../../services/databaseService');
const sqlite3 = require('sqlite3');

// Mock sqlite3
jest.mock('sqlite3', () => ({
  Database: jest.fn(),
  OPEN_READWRITE: 2,
  OPEN_CREATE: 4
}));

describe('Database Service', () => {
  let databaseService;
  let mockDb;
  
  beforeEach(() => {
    mockDb = {
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn(),
      prepare: jest.fn(),
      close: jest.fn(),
      exec: jest.fn()
    };
    
    sqlite3.Database.mockImplementation(() => mockDb);
    databaseService = new DatabaseService();
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('connect', () => {
    it('should connect to database successfully', async () => {
      mockDb.exec.mockImplementation((sql, callback) => {
        callback(null);
      });
      
      await databaseService.connect();
      
      expect(sqlite3.Database).toHaveBeenCalled();
      expect(mockDb.exec).toHaveBeenCalled();
    });
    
    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      mockDb.exec.mockImplementation((sql, callback) => {
        callback(error);
      });
      
      await expect(databaseService.connect()).rejects.toThrow('Connection failed');
    });
    
    it('should handle database file creation errors', async () => {
      const error = new Error('Permission denied');
      sqlite3.Database.mockImplementation(() => {
        throw error;
      });
      
      await expect(databaseService.connect()).rejects.toThrow('Permission denied');
    });
  });
  
  describe('disconnect', () => {
    it('should disconnect from database successfully', async () => {
      mockDb.close.mockImplementation((callback) => {
        callback(null);
      });
      
      await databaseService.disconnect();
      
      expect(mockDb.close).toHaveBeenCalled();
    });
    
    it('should handle disconnection errors', async () => {
      const error = new Error('Disconnection failed');
      mockDb.close.mockImplementation((callback) => {
        callback(error);
      });
      
      await expect(databaseService.disconnect()).rejects.toThrow('Disconnection failed');
    });
  });
  
  describe('executeQuery', () => {
    it('should execute query successfully', async () => {
      const sql = 'SELECT * FROM users WHERE id = ?';
      const params = [1];
      const expectedResult = { id: 1, name: 'John Doe' };
      
      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, expectedResult);
      });
      
      const result = await databaseService.executeQuery(sql, params);
      
      expect(result).toEqual(expectedResult);
      expect(mockDb.get).toHaveBeenCalledWith(sql, params, expect.any(Function));
    });
    
    it('should execute query without parameters', async () => {
      const sql = 'SELECT COUNT(*) as count FROM users';
      const expectedResult = { count: 10 };
      
      mockDb.get.mockImplementation((sql, callback) => {
        callback(null, expectedResult);
      });
      
      const result = await databaseService.executeQuery(sql);
      
      expect(result).toEqual(expectedResult);
      expect(mockDb.get).toHaveBeenCalledWith(sql, expect.any(Function));
    });
    
    it('should handle query execution errors', async () => {
      const sql = 'SELECT * FROM nonexistent_table';
      const error = new Error('Table not found');
      
      mockDb.get.mockImplementation((sql, callback) => {
        callback(error);
      });
      
      await expect(databaseService.executeQuery(sql)).rejects.toThrow('Table not found');
    });
  });
  
  describe('executeQueryAll', () => {
    it('should execute query and return all results', async () => {
      const sql = 'SELECT * FROM users';
      const expectedResults = [
        { id: 1, name: 'John Doe' },
        { id: 2, name: 'Jane Smith' }
      ];
      
      mockDb.all.mockImplementation((sql, callback) => {
        callback(null, expectedResults);
      });
      
      const results = await databaseService.executeQueryAll(sql);
      
      expect(results).toEqual(expectedResults);
      expect(mockDb.all).toHaveBeenCalledWith(sql, expect.any(Function));
    });
    
    it('should execute query with parameters', async () => {
      const sql = 'SELECT * FROM users WHERE status = ?';
      const params = ['active'];
      const expectedResults = [
        { id: 1, name: 'John Doe', status: 'active' }
      ];
      
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, expectedResults);
      });
      
      const results = await databaseService.executeQueryAll(sql, params);
      
      expect(results).toEqual(expectedResults);
      expect(mockDb.all).toHaveBeenCalledWith(sql, params, expect.any(Function));
    });
    
    it('should handle query execution errors', async () => {
      const sql = 'SELECT * FROM users';
      const error = new Error('Database error');
      
      mockDb.all.mockImplementation((sql, callback) => {
        callback(error);
      });
      
      await expect(databaseService.executeQueryAll(sql)).rejects.toThrow('Database error');
    });
  });
  
  describe('executeUpdate', () => {
    it('should execute update query successfully', async () => {
      const sql = 'UPDATE users SET name = ? WHERE id = ?';
      const params = ['John Smith', 1];
      const expectedResult = { changes: 1, lastID: 1 };
      
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback(null, expectedResult);
      });
      
      const result = await databaseService.executeUpdate(sql, params);
      
      expect(result).toEqual(expectedResult);
      expect(mockDb.run).toHaveBeenCalledWith(sql, params, expect.any(Function));
    });
    
    it('should execute update without parameters', async () => {
      const sql = 'DELETE FROM users WHERE status = "inactive"';
      const expectedResult = { changes: 5 };
      
      mockDb.run.mockImplementation((sql, callback) => {
        callback(null, expectedResult);
      });
      
      const result = await databaseService.executeUpdate(sql);
      
      expect(result).toEqual(expectedResult);
      expect(mockDb.run).toHaveBeenCalledWith(sql, expect.any(Function));
    });
    
    it('should handle update execution errors', async () => {
      const sql = 'UPDATE users SET name = ? WHERE id = ?';
      const params = ['John Smith', 1];
      const error = new Error('Update failed');
      
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback(error);
      });
      
      await expect(databaseService.executeUpdate(sql, params)).rejects.toThrow('Update failed');
    });
  });
  
  describe('executeTransaction', () => {
    it('should execute transaction successfully', async () => {
      const queries = [
        { sql: 'INSERT INTO users (name) VALUES (?)', params: ['John Doe'] },
        { sql: 'INSERT INTO users (name) VALUES (?)', params: ['Jane Smith'] }
      ];
      
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback(null, { lastID: 1 });
      });
      
      const results = await databaseService.executeTransaction(queries);
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(mockDb.run).toHaveBeenCalledTimes(2);
    });
    
    it('should rollback transaction on error', async () => {
      const queries = [
        { sql: 'INSERT INTO users (name) VALUES (?)', params: ['John Doe'] },
        { sql: 'INSERT INTO users (name) VALUES (?)', params: ['Jane Smith'] }
      ];
      
      mockDb.run
        .mockImplementationOnce((sql, params, callback) => {
          callback(null, { lastID: 1 });
        })
        .mockImplementationOnce((sql, params, callback) => {
          callback(new Error('Insert failed'));
        });
      
      const results = await databaseService.executeTransaction(queries);
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('Insert failed');
    });
    
    it('should handle empty queries array', async () => {
      const results = await databaseService.executeTransaction([]);
      
      expect(results).toEqual([]);
    });
  });
  
  describe('prepareStatement', () => {
    it('should prepare statement successfully', async () => {
      const sql = 'SELECT * FROM users WHERE id = ? AND status = ?';
      const mockStmt = {
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn(),
        finalize: jest.fn()
      };
      
      mockDb.prepare.mockReturnValue(mockStmt);
      
      const stmt = await databaseService.prepareStatement(sql);
      
      expect(stmt).toBe(mockStmt);
      expect(mockDb.prepare).toHaveBeenCalledWith(sql, expect.any(Function));
    });
    
    it('should handle statement preparation errors', async () => {
      const sql = 'INVALID SQL';
      const error = new Error('Syntax error');
      
      mockDb.prepare.mockImplementation((sql, callback) => {
        callback(error);
      });
      
      await expect(databaseService.prepareStatement(sql)).rejects.toThrow('Syntax error');
    });
  });
  
  describe('executePreparedStatement', () => {
    it('should execute prepared statement successfully', async () => {
      const sql = 'SELECT * FROM users WHERE id = ?';
      const params = [1];
      const expectedResult = { id: 1, name: 'John Doe' };
      
      const mockStmt = {
        get: jest.fn().mockImplementation((params, callback) => {
          callback(null, expectedResult);
        }),
        finalize: jest.fn()
      };
      
      mockDb.prepare.mockImplementation((sql, callback) => {
        callback(null, mockStmt);
      });
      
      const result = await databaseService.executePreparedStatement(sql, params);
      
      expect(result).toEqual(expectedResult);
      expect(mockStmt.get).toHaveBeenCalledWith(params, expect.any(Function));
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
    
    it('should handle prepared statement execution errors', async () => {
      const sql = 'SELECT * FROM users WHERE id = ?';
      const params = [1];
      const error = new Error('Execution failed');
      
      const mockStmt = {
        get: jest.fn().mockImplementation((params, callback) => {
          callback(error);
        }),
        finalize: jest.fn()
      };
      
      mockDb.prepare.mockImplementation((sql, callback) => {
        callback(null, mockStmt);
      });
      
      await expect(databaseService.executePreparedStatement(sql, params)).rejects.toThrow('Execution failed');
      expect(mockStmt.finalize).toHaveBeenCalled();
    });
  });
  
  describe('backupDatabase', () => {
    it('should backup database successfully', async () => {
      const backupPath = '/backup/database_backup.sqlite';
      
      mockDb.backup.mockImplementation((backupPath, callback) => {
        callback(null);
      });
      
      await databaseService.backupDatabase(backupPath);
      
      expect(mockDb.backup).toHaveBeenCalledWith(backupPath, expect.any(Function));
    });
    
    it('should handle backup errors', async () => {
      const backupPath = '/backup/database_backup.sqlite';
      const error = new Error('Backup failed');
      
      mockDb.backup.mockImplementation((backupPath, callback) => {
        callback(error);
      });
      
      await expect(databaseService.backupDatabase(backupPath)).rejects.toThrow('Backup failed');
    });
  });
  
  describe('optimizeDatabase', () => {
    it('should optimize database successfully', async () => {
      mockDb.exec.mockImplementation((sql, callback) => {
        callback(null);
      });
      
      await databaseService.optimizeDatabase();
      
      expect(mockDb.exec).toHaveBeenCalledWith('VACUUM', expect.any(Function));
      expect(mockDb.exec).toHaveBeenCalledWith('ANALYZE', expect.any(Function));
    });
    
    it('should handle optimization errors', async () => {
      const error = new Error('Optimization failed');
      mockDb.exec.mockImplementation((sql, callback) => {
        callback(error);
      });
      
      await expect(databaseService.optimizeDatabase()).rejects.toThrow('Optimization failed');
    });
  });
  
  describe('getDatabaseInfo', () => {
    it('should get database information successfully', async () => {
      const mockTables = [
        { name: 'users', sql: 'CREATE TABLE users...' },
        { name: 'templates', sql: 'CREATE TABLE templates...' }
      ];
      
      mockDb.all.mockImplementation((sql, callback) => {
        callback(null, mockTables);
      });
      
      const info = await databaseService.getDatabaseInfo();
      
      expect(info).toHaveProperty('tables');
      expect(info.tables).toEqual(mockTables);
      expect(mockDb.all).toHaveBeenCalled();
    });
    
    it('should handle database info retrieval errors', async () => {
      const error = new Error('Info retrieval failed');
      mockDb.all.mockImplementation((sql, callback) => {
        callback(error);
      });
      
      await expect(databaseService.getDatabaseInfo()).rejects.toThrow('Info retrieval failed');
    });
  });
  
  describe('validateConnection', () => {
    it('should validate connection successfully', async () => {
      mockDb.exec.mockImplementation((sql, callback) => {
        callback(null);
      });
      
      const isValid = await databaseService.validateConnection();
      
      expect(isValid).toBe(true);
      expect(mockDb.exec).toHaveBeenCalledWith('SELECT 1', expect.any(Function));
    });
    
    it('should detect invalid connection', async () => {
      const error = new Error('Connection lost');
      mockDb.exec.mockImplementation((sql, callback) => {
        callback(error);
      });
      
      const isValid = await databaseService.validateConnection();
      
      expect(isValid).toBe(false);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle database corruption gracefully', async () => {
      const error = new Error('database disk image is malformed');
      mockDb.exec.mockImplementation((sql, callback) => {
        callback(error);
      });
      
      await expect(databaseService.connect()).rejects.toThrow('database disk image is malformed');
    });
    
    it('should handle database locked errors', async () => {
      const error = new Error('database is locked');
      mockDb.exec.mockImplementation((sql, callback) => {
        callback(error);
      });
      
      await expect(databaseService.connect()).rejects.toThrow('database is locked');
    });
    
    it('should handle disk full errors', async () => {
      const error = new Error('disk I/O error');
      mockDb.exec.mockImplementation((sql, callback) => {
        callback(error);
      });
      
      await expect(databaseService.connect()).rejects.toThrow('disk I/O error');
    });
  });
  
  describe('Performance Tests', () => {
    it('should handle large queries efficiently', async () => {
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`,
        email: `user${i + 1}@example.com`
      }));
      
      mockDb.all.mockImplementation((sql, callback) => {
        callback(null, largeData);
      });
      
      const startTime = Date.now();
      const results = await databaseService.executeQueryAll('SELECT * FROM users');
      const endTime = Date.now();
      
      expect(results).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
    
    it('should handle multiple concurrent queries', async () => {
      const queries = [
        'SELECT * FROM users WHERE status = "active"',
        'SELECT * FROM templates WHERE isActive = 1',
        'SELECT COUNT(*) FROM documents WHERE status = "completed"'
      ];
      
      mockDb.all.mockImplementation((sql, callback) => {
        callback(null, [{ count: 10 }]);
      });
      
      const startTime = Date.now();
      const promises = queries.map(sql => databaseService.executeQueryAll(sql));
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      expect(results).toHaveLength(3);
      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});
