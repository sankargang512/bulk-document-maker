# Bulk Document Generator Backend - Production

## Quick Start

### 1. Environment Setup
```bash
# Copy and configure production environment
cp env.production .env
nano .env  # Update with your production values
```

### 2. Database Setup
```bash
# Start PostgreSQL and run migrations
docker-compose -f docker-compose.production.yml up -d postgres
sleep 30
docker exec -i bulk-doc-generator-postgres-prod psql -U $DB_USER -d $DB_NAME < database/schema-postgres.sql
```

### 3. Deploy Application
```bash
# Full production deployment
npm run deploy

# Or step by step:
npm run docker:build
npm run docker:run
npm run pm2:start
```

### 4. Verify Deployment
```bash
# Health checks
npm run health
npm run deploy:health

# Monitor processes
npm run pm2:monitor
```

## Key Commands

| Action | Command |
|--------|---------|
| Deploy | `npm run deploy` |
| Rollback | `npm run deploy:rollback` |
| Health Check | `npm run health` |
| Monitor | `npm run pm2:monitor` |
| Logs | `npm run pm2:logs` |
| Backup | `npm run db:backup` |
| Restart | `npm run pm2:restart` |

## Production Features

✅ **Multi-stage Docker build** with security hardening  
✅ **PostgreSQL database** with optimized schema  
✅ **Redis caching** for performance  
✅ **PM2 process management** with cluster mode  
✅ **Nginx reverse proxy** with SSL/TLS  
✅ **Automated monitoring** and health checks  
✅ **Scheduled backups** with rotation  
✅ **Rate limiting** and security headers  
✅ **Health check endpoints** for load balancers  
✅ **Comprehensive logging** and error tracking  

## Architecture

```
Internet → Nginx (SSL) → Backend (PM2) → PostgreSQL + Redis
                ↓
            File Storage (S3/GCS)
```

## Monitoring

- **Health checks**: Every 5 minutes
- **Backups**: Daily at 2 AM
- **Log rotation**: Daily with 30-day retention
- **Resource monitoring**: CPU, Memory, Disk usage

## Security

- Non-root Docker containers
- SSL/TLS encryption
- Rate limiting
- Security headers
- Input validation
- JWT authentication

## Scaling

- Horizontal scaling with load balancer
- Database read replicas
- Redis clustering
- Container orchestration ready

## Support

- **Documentation**: `PRODUCTION_DEPLOYMENT.md`
- **Scripts**: `scripts/` directory
- **Configuration**: `ecosystem.config.js`
- **Docker**: `docker-compose.production.yml`

---

**For detailed deployment instructions, see `PRODUCTION_DEPLOYMENT.md`**
