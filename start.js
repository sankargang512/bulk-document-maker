#!/usr/bin/env node

const path = require('path');
const fs = require('fs-extra');
const DatabaseInitializer = require('./database/init');
const loggingService = require('./services/loggingService');

async function startApplication() {
  try {
    console.log('🚀 Starting Bulk Document Maker Backend...');
    console.log('==========================================');
    
    // Ensure required directories exist
    const dirs = ['uploads', 'generated', 'temp', 'logs'];
    for (const dir of dirs) {
      const dirPath = path.join(__dirname, dir);
      await fs.ensureDir(dirPath);
      console.log(`✅ Created directory: ${dir}`);
    }
    
    // Initialize database
    console.log('\n🗄️  Initializing database...');
    const dbInitializer = new DatabaseInitializer();
    await dbInitializer.initialize();
    
    // Start logging service
    console.log('\n📝 Starting logging service...');
    await loggingService.info('Application starting up', {
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    });
    
    // Import and start server
    console.log('\n🌐 Starting Express server...');
    const app = require('./server');
    
    // Graceful shutdown handling
    process.on('SIGINT', async () => {
      console.log('\n🛑 Received SIGINT, shutting down gracefully...');
      await gracefulShutdown();
    });
    
    process.on('SIGTERM', async () => {
      console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
      await gracefulShutdown();
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('💥 Uncaught Exception:', error);
      await loggingService.error('Uncaught Exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      await loggingService.error('Unhandled Rejection', { reason: reason?.message || reason, promise: promise.toString() });
      process.exit(1);
    });
    
    console.log('\n🎉 Application started successfully!');
    console.log('==========================================');
    console.log(`📁 Upload directory: ${path.join(__dirname, 'uploads')}`);
    console.log(`📁 Generated directory: ${path.join(__dirname, 'generated')}`);
    console.log(`📁 Database: ${path.join(__dirname, 'database', 'database.sqlite')}`);
    console.log(`📁 Logs: ${path.join(__dirname, 'logs')}`);
    console.log(`🌐 Server: http://localhost:${process.env.PORT || 3001}`);
    console.log(`📊 Health check: http://localhost:${process.env.PORT || 3001}/api/health`);
    console.log('==========================================');
    
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

async function gracefulShutdown() {
  try {
    console.log('🔄 Shutting down services...');
    
    // Stop logging service
    await loggingService.info('Application shutting down', {
      reason: 'graceful shutdown',
      timestamp: new Date().toISOString()
    });
    
    // Close database connections
    const databaseService = require('./services/databaseService');
    await databaseService.disconnect();
    
    // Stop job queue service
    const jobQueueService = require('./services/jobQueueService');
    await jobQueueService.stop();
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Start the application
startApplication().catch((error) => {
  console.error('💥 Fatal error during startup:', error);
  process.exit(1);
});
