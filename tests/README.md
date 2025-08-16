# Bulk Document Maker - Testing Suite

This directory contains the comprehensive testing suite for the Bulk Document Maker backend API.

## 🧪 Test Structure

```
tests/
├── README.md                 # This file
├── setup.js                  # Global test setup and utilities
├── env-setup.js             # Test environment configuration
├── global-setup.js          # Global test initialization
├── global-teardown.js       # Global test cleanup
├── unit/                    # Unit tests for individual components
│   └── middleware/          # Middleware unit tests
│       ├── security.test.js
│       ├── authentication.test.js
│       └── fileValidation.test.js
├── integration/             # Integration tests for workflows
│   └── documentGeneration.test.js
├── api/                     # API endpoint tests
│   └── security.test.js
└── fixtures/                # Test data and files
    ├── sample.csv
    ├── sample-template.txt
    └── large-sample.csv
```

## 🚀 Quick Start

### Run All Tests
```bash
npm test
```

### Run Specific Test Categories
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# API tests only
npm run test:api

# Security tests only
npm run test:security

# Performance tests only
npm run test:performance
```

### Development Mode
```bash
# Watch mode for development
npm run test:watch

# Generate coverage report
npm run test:coverage

# CI/CD mode
npm run test:ci
```

## 📋 Test Categories

### 1. Unit Tests (`tests/unit/`)
- **Purpose**: Test individual functions and components in isolation
- **Coverage**: All middleware functions, utility functions, and service methods
- **Mocking**: External dependencies are mocked for reliable testing
- **Examples**:
  - Security middleware validation
  - Authentication logic
  - File validation functions
  - Input sanitization

### 2. Integration Tests (`tests/integration/`)
- **Purpose**: Test complete workflows and component interactions
- **Coverage**: End-to-end document generation process
- **Real Files**: Uses actual test files to simulate real usage
- **Examples**:
  - Complete document generation workflow
  - File upload and processing
  - Batch processing
  - Error handling scenarios

### 3. API Tests (`tests/api/`)
- **Purpose**: Test HTTP endpoints and API behavior
- **Coverage**: All API routes, security features, and rate limiting
- **HTTP Client**: Uses Supertest for realistic HTTP testing
- **Examples**:
  - Security headers validation
  - CORS configuration
  - Rate limiting behavior
  - Error response formats

## 🔧 Test Configuration

### Jest Configuration (`jest.config.js`)
- **Environment**: Node.js
- **Coverage**: 80%+ threshold required
- **Timeout**: 30 seconds per test
- **Setup**: Global setup/teardown files
- **Mocking**: Automatic mock clearing between tests

### Environment Variables
Tests use a separate test environment with:
- In-memory SQLite database
- Disabled external services
- Test-specific file paths
- Minimal logging

### Test Utilities (`tests/setup.js`)
Global test utilities available in all tests:
- `testUtils.createTestFile()` - Create test files
- `testUtils.createTestCSV()` - Generate CSV test data
- `testUtils.generateTestData()` - Generate structured test data
- `testUtils.validateAPIResponse()` - Validate API responses
- `testUtils.mockFileUpload()` - Mock file uploads

## 📊 Test Coverage Requirements

### Minimum Coverage Thresholds
- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%
- **Statements**: 80%

### Coverage Reports
- **Text**: Console output
- **HTML**: Detailed browser report
- **LCOV**: CI/CD integration
- **JSON**: Machine-readable format

## 🧹 Test Data Management

### Test Files
- **Location**: `tests/fixtures/`
- **Types**: CSV, templates, large files
- **Cleanup**: Automatic cleanup after tests
- **Isolation**: Each test uses unique file paths

### Test Database
- **Type**: In-memory SQLite
- **Reset**: Fresh database for each test suite
- **Isolation**: No cross-test data contamination

## 🚨 Error Handling Tests

### Expected Error Scenarios
- Invalid file types
- Malformed CSV data
- Missing required files
- Rate limit exceeded
- Authentication failures
- Invalid input data

### Error Response Validation
- Consistent error format
- Appropriate HTTP status codes
- Request ID inclusion
- No sensitive information exposure

## ⚡ Performance Testing

### Load Testing
- Concurrent request handling
- Memory usage monitoring
- Response time validation
- Rate limiting effectiveness

### Scalability Tests
- Large file processing
- Batch size optimization
- Memory efficiency
- Processing time validation

## 🔒 Security Testing

### Security Headers
- Content Security Policy
- XSS Protection
- Frame Options
- Content Type Options

### Input Validation
- File type validation
- Magic number checking
- Size limit enforcement
- Content sanitization

### Rate Limiting
- General API limits
- Document generation limits
- Upload rate limits
- User-specific limits

## 🧪 Test Development Guidelines

### Writing New Tests
1. **Follow Naming Convention**: `describe('Feature', () => {})`
2. **Use Descriptive Test Names**: `it('should handle invalid input gracefully', () => {})`
3. **Arrange-Act-Assert Pattern**: Setup → Execute → Verify
4. **Mock External Dependencies**: Don't rely on external services
5. **Clean Up Resources**: Use `afterEach` and `afterAll` hooks

### Test File Structure
```javascript
describe('Feature Name', () => {
  let testData;
  
  beforeAll(async () => {
    // Setup test data
  });
  
  afterAll(async () => {
    // Cleanup
  });
  
  beforeEach(() => {
    // Reset state
  });
  
  describe('Specific Functionality', () => {
    it('should work correctly', async () => {
      // Test implementation
    });
  });
});
```

### Mocking Best Practices
- Mock external APIs and services
- Use `jest.fn()` for function mocks
- Reset mocks between tests
- Verify mock calls when relevant

## 🔍 Debugging Tests

### Common Issues
1. **Timeout Errors**: Increase Jest timeout or optimize slow operations
2. **File Cleanup Failures**: Check file permissions and paths
3. **Database Connection Issues**: Verify test environment configuration
4. **Mock Failures**: Ensure mocks are properly configured

### Debug Commands
```bash
# Run single test file
npm test -- tests/unit/middleware/security.test.js

# Run with verbose output
npm test -- --verbose

# Run specific test
npm test -- --testNamePattern="should validate API key"

# Debug mode
node --inspect-brk node_modules/.bin/jest --runInBand
```

## 📈 Continuous Integration

### CI/CD Pipeline
- **Automated Testing**: Runs on every commit
- **Coverage Reports**: Uploaded to coverage service
- **Test Results**: Integrated with PR reviews
- **Performance Monitoring**: Tracks test execution time

### Pre-commit Hooks
- **Linting**: ESLint validation
- **Unit Tests**: Fast unit test execution
- **Format Check**: Code formatting validation

## 🎯 Test Maintenance

### Regular Tasks
- **Update Test Data**: Keep test files current
- **Review Coverage**: Identify untested code paths
- **Update Mocks**: Maintain mock accuracy
- **Performance Review**: Monitor test execution time

### Test Refactoring
- **Extract Common Logic**: Create reusable test utilities
- **Simplify Complex Tests**: Break down large test cases
- **Update Assertions**: Keep expectations current
- **Remove Obsolete Tests**: Clean up outdated tests

## 📚 Additional Resources

### Documentation
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Node.js Testing Best Practices](https://nodejs.org/en/docs/guides/testing-and-debugging/)

### Testing Patterns
- [AAA Pattern](https://medium.com/@pjbgf/title-one-simple-trick-to-write-better-tests-aec3ef5fcc31)
- [Test Doubles](https://martinfowler.com/bliki/TestDouble.html)
- [Test Data Builders](https://www.javacodegeeks.com/2014/10/test-data-builders-pattern.html)

---

**Note**: This testing suite is designed to ensure the reliability, security, and performance of the Bulk Document Maker backend. All tests should pass before deploying to production.
