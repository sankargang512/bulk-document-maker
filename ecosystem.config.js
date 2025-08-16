module.exports = {
  apps: [
    {
      name: 'bulk-doc-generator-backend',
      script: 'server.js',
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      // Logging configuration
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Process management
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      
      // Monitoring
      pmx: true,
      
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Health check
      health_check_grace_period: 3000,
      
      // Auto restart on file changes (development only)
      ignore_watch: [
        'node_modules',
        'logs',
        'uploads',
        'generated',
        'temp',
        'database'
      ],
      
      // Environment variables
      env_file: '.env',
      
      // Node.js options
      node_args: '--max-old-space-size=2048',
      
      // Cron jobs for maintenance
      cron_restart: '0 2 * * *', // Restart daily at 2 AM
      
      // Metrics
      merge_logs: true,
      
      // Error handling
      autorestart: true,
      exp_backoff_restart_delay: 100,
      
      // Performance tuning
      instance_var: 'INSTANCE_ID',
      
      // Security
      uid: 'nodejs',
      gid: 'nodejs'
    }
  ],

  deploy: {
    production: {
      user: 'deploy',
      host: 'your-production-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/bulk-doc-generator.git',
      path: '/var/www/bulk-doc-generator',
      'pre-deploy-local': '',
      'post-deploy': 'npm install --production && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
