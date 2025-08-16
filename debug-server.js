console.log('Starting debug server...');

try {
  console.log('1. Loading express...');
  const express = require('express');
  console.log('✅ Express loaded successfully');
  
  console.log('2. Loading middleware...');
  const cors = require('cors');
  const helmet = require('helmet');
  const morgan = require('morgan');
  console.log('✅ Middleware loaded successfully');
  
  console.log('3. Loading routes...');
  const healthRoutes = require('./routes/health');
  console.log('✅ Health routes loaded successfully');
  
  console.log('4. Creating app...');
  const app = express();
  console.log('✅ App created successfully');
  
  console.log('5. Setting up middleware...');
  app.use(cors());
  app.use(helmet());
  app.use(morgan('combined'));
  app.use(express.json());
  console.log('✅ Middleware setup complete');
  
  console.log('6. Setting up routes...');
  app.use('/api/health', healthRoutes);
  console.log('✅ Routes setup complete');
  
  console.log('7. Starting server...');
  const PORT = 3001;
  app.listen(PORT, () => {
    console.log(`🚀 Debug server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  });
  
} catch (error) {
  console.error('❌ Error during startup:', error);
  console.error('Stack trace:', error.stack);
}
