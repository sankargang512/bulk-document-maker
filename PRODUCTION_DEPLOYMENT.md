# Production Deployment Guide

## Overview
This guide covers the complete production deployment of the Bulk Document Generator Backend, including environment setup, Docker deployment, process management, monitoring, and maintenance.

## Prerequisites

### System Requirements
- **OS**: Ubuntu 20.04+ or CentOS 8+
- **CPU**: 2+ cores (4+ recommended)
- **RAM**: 4GB+ (8GB+ recommended)
- **Storage**: 50GB+ available space
- **Network**: Public IP with SSL certificate

### Software Requirements
- Docker 20.10+
- Docker Compose 2.0+
- Node.js 18+ (for PM2)
- PM2 (global installation)
- PostgreSQL 15+ (if not using Docker)
- Redis 7+ (if not using Docker)

## 1. Environment Setup

### 1.1 Create Production Environment File
```bash
# Copy production environment template
cp env.production .env

# Edit with your production values
nano .env
```

**Required Environment Variables:**
- `DB_TYPE=postgres` - Database type
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - PostgreSQL credentials
- `STORAGE_TYPE=s3` - File storage type
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` - AWS S3 credentials
- `SENDGRID_API_KEY` - Email service API key
- `JWT_SECRET`, `API_KEY_SECRET` - Security secrets (min 32 characters)
- `REDIS_URL`, `REDIS_PASSWORD` - Redis connection details

### 1.2 SSL Certificate Setup
```bash
# Create SSL directory
sudo mkdir -p /etc/nginx/ssl

# Copy your SSL certificates
sudo cp yourdomain.crt /etc/nginx/ssl/
sudo cp yourdomain.key /etc/nginx/ssl/
sudo cp ca-bundle.crt /etc/nginx/ssl/

# Set proper permissions
sudo chmod 600 /etc/nginx/ssl/yourdomain.key
sudo chmod 644 /etc/nginx/ssl/yourdomain.crt
```

## 2. Database Setup

### 2.1 PostgreSQL Database
```bash
# Start PostgreSQL container
docker-compose -f docker-compose.production.yml up -d postgres

# Wait for database to be ready
sleep 30

# Run database migrations
docker exec -i bulk-doc-generator-postgres-prod psql -U $DB_USER -d $DB_NAME < database/schema-postgres.sql
```

### 2.2 Database Verification
```bash
# Check database connection
docker exec bulk-doc-generator-postgres-prod pg_isready -U $DB_USER -d $DB_NAME

# Verify tables
docker exec -i bulk-doc-generator-postgres-prod psql -U $DB_USER -d $DB_NAME -c "\dt"
```

## 3. Application Deployment

### 3.1 Docker Deployment
```bash
# Build production image
npm run docker:build

# Start all services
npm run docker:run

# Check service status
docker-compose -f docker-compose.production.yml ps
```

### 3.2 PM2 Process Management
```bash
# Start with PM2
npm run pm2:start

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup

# Monitor processes
npm run pm2:monitor
```

## 4. Monitoring & Health Checks

### 4.1 Health Check Endpoints
- **Application Health**: `GET /api/health`
- **Nginx Health**: `GET /health`
- **Database Health**: Via monitoring script

### 4.2 Monitoring Setup
```bash
# Setup monitoring cron jobs
npm run monitor

# Check monitoring logs
tail -f /var/log/bulkdocgenerator/monitor.log
```

### 4.3 Resource Monitoring
```bash
# Check PM2 status
pm2 status

# Check Docker containers
docker stats

# Check system resources
htop
```

## 5. Backup & Recovery

### 5.1 Automated Backups
```bash
# Manual backup
npm run db:backup

# Check backup directory
ls -la /var/backups/bulkdocgenerator/
```

### 5.2 Backup Verification
```bash
# Verify database backup
gunzip -c /var/backups/bulkdocgenerator/db_backup_*.sql.gz | head -20

# Verify file backup
tar -tzf /var/backups/bulkdocgenerator/files_backup_*.tar.gz | head -20
```

## 6. Security Configuration

### 6.1 Firewall Setup
```bash
# Allow only necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redirect)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 6.2 SSL/TLS Configuration
- Use strong ciphers (TLS 1.2+)
- Enable HSTS headers
- Regular certificate renewal
- Monitor SSL Labs rating

### 6.3 Access Control
- Restrict database access to application only
- Use strong passwords and API keys
- Regular security updates
- Monitor access logs

## 7. Performance Optimization

### 7.1 Database Optimization
```sql
-- Check slow queries
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Analyze table statistics
ANALYZE;
```

### 7.2 Application Optimization
- Enable gzip compression
- Use Redis for caching
- Optimize file uploads
- Monitor response times

### 7.3 System Optimization
- Tune kernel parameters
- Optimize disk I/O
- Monitor resource usage
- Scale horizontally if needed

## 8. Maintenance Procedures

### 8.1 Regular Maintenance
```bash
# Daily
npm run deploy:health

# Weekly
npm run db:backup
docker system prune -f

# Monthly
npm run test:ci
docker image prune -a
```

### 8.2 Update Procedures
```bash
# Backup current version
docker tag bulk-doc-generator-backend:latest bulk-doc-generator-backend:previous

# Deploy new version
npm run deploy

# Verify deployment
npm run deploy:health

# Rollback if needed
npm run deploy:rollback
```

### 8.3 Log Management
```bash
# Check application logs
npm run pm2:logs

# Check Docker logs
npm run docker:logs

# Check system logs
sudo journalctl -u docker
```

## 9. Troubleshooting

### 9.1 Common Issues

#### Application Won't Start
```bash
# Check PM2 logs
pm2 logs bulk-doc-generator-backend

# Check environment variables
pm2 env bulk-doc-generator-backend

# Restart application
pm2 restart bulk-doc-generator-backend
```

#### Database Connection Issues
```bash
# Check PostgreSQL status
docker exec bulk-doc-generator-postgres-prod pg_isready

# Check connection logs
docker logs bulk-doc-generator-postgres-prod

# Verify environment variables
echo $DB_HOST $DB_NAME $DB_USER
```

#### File Upload Issues
```bash
# Check file permissions
ls -la uploads/ generated/ temp/

# Check disk space
df -h

# Check S3 credentials
aws s3 ls s3://$AWS_S3_BUCKET
```

### 9.2 Performance Issues
```bash
# Check resource usage
docker stats
pm2 monit

# Check slow queries
docker exec -i bulk-doc-generator-postgres-prod psql -U $DB_USER -d $DB_NAME -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 5;"
```

## 10. Scaling & High Availability

### 10.1 Horizontal Scaling
- Use load balancer (HAProxy, Nginx)
- Multiple application instances
- Database read replicas
- Redis cluster for caching

### 10.2 Load Balancing Configuration
```nginx
upstream backend {
    server backend1:3001;
    server backend2:3001;
    server backend3:3001;
}
```

### 10.3 Database Scaling
- Primary-replica setup
- Connection pooling (PgBouncer)
- Read replicas for analytics
- Sharding for large datasets

## 11. Disaster Recovery

### 11.1 Recovery Procedures
```bash
# Database recovery
gunzip -c /var/backups/bulkdocgenerator/db_backup_*.sql.gz | docker exec -i bulk-doc-generator-postgres-prod psql -U $DB_USER -d $DB_NAME

# File recovery
tar -xzf /var/backups/bulkdocgenerator/files_backup_*.tar.gz

# Application restart
pm2 restart all
```

### 11.2 Backup Testing
- Regular restore tests
- Verify backup integrity
- Test recovery procedures
- Document recovery steps

## 12. Monitoring & Alerting

### 12.1 Key Metrics
- Response time (p95, p99)
- Error rate
- Throughput (requests/second)
- Resource utilization
- Database performance

### 12.2 Alert Configuration
- High error rates
- High response times
- Resource exhaustion
- Service failures
- Backup failures

### 12.3 Monitoring Tools
- PM2 monitoring
- Docker monitoring
- System monitoring (htop, iotop)
- Application monitoring (Sentry, New Relic)
- Database monitoring (pg_stat_statements)

## 13. Compliance & Auditing

### 13.1 Audit Logging
- User actions
- API access
- File operations
- Database changes
- System events

### 13.2 Data Retention
- Log retention policies
- Backup retention
- Audit log retention
- Compliance requirements

## 14. Support & Maintenance

### 14.1 Support Contacts
- System Administrator: admin@yourdomain.com
- Development Team: dev@yourdomain.com
- Emergency Contact: emergency@yourdomain.com

### 14.2 Maintenance Windows
- Scheduled maintenance: Sundays 2-4 AM UTC
- Emergency maintenance: As needed
- Notification: 24 hours in advance

### 14.3 Documentation Updates
- Keep this guide updated
- Document configuration changes
- Update runbooks
- Version control documentation

## Quick Reference Commands

```bash
# Health check
npm run health

# Deploy
npm run deploy

# Rollback
npm run deploy:rollback

# Monitor
npm run pm2:monitor

# Backup
npm run db:backup

# Logs
npm run pm2:logs

# Restart
npm run pm2:restart
```

## Emergency Procedures

1. **Service Down**: Check PM2 status, restart if needed
2. **Database Issues**: Check PostgreSQL logs, restart container
3. **High Load**: Scale horizontally, check resource usage
4. **Security Breach**: Isolate system, check logs, contact security team
5. **Data Loss**: Stop services, restore from backup, investigate cause

---

**Last Updated**: $(date +'%Y-%m-%d')
**Version**: 1.0
**Maintainer**: DevOps Team
