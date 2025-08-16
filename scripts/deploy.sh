#!/bin/bash

# Production Deployment Script for Bulk Document Generator Backend
# Usage: ./scripts/deploy.sh [environment] [action]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT=${1:-production}
ACTION=${2:-deploy}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
    exit 1
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        error "This script should not be run as root"
    fi
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first."
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed. Please install Docker Compose first."
    fi
    
    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        warn "PM2 is not installed. Installing PM2..."
        npm install -g pm2
    fi
    
    # Check if environment file exists
    if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
        error "Environment file .env not found. Please create it from env.production"
    fi
    
    log "Prerequisites check completed"
}

# Load environment variables
load_env() {
    log "Loading environment variables..."
    
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        export $(cat "$PROJECT_ROOT/.env" | grep -v '^#' | xargs)
    else
        error "Environment file not found"
    fi
    
    log "Environment variables loaded"
}

# Database setup
setup_database() {
    log "Setting up production database..."
    
    # Check if PostgreSQL container is running
    if ! docker ps | grep -q "bulk-doc-generator-postgres-prod"; then
        log "Starting PostgreSQL container..."
        cd "$PROJECT_ROOT"
        docker-compose -f docker-compose.production.yml up -d postgres
        
        # Wait for PostgreSQL to be ready
        log "Waiting for PostgreSQL to be ready..."
        sleep 30
    fi
    
    # Run database migrations
    log "Running database migrations..."
    cd "$PROJECT_ROOT"
    
    # Check if schema file exists
    if [[ -f "database/schema-postgres.sql" ]]; then
        docker exec -i bulk-doc-generator-postgres-prod psql -U "$DB_USER" -d "$DB_NAME" < database/schema-postgres.sql
        log "Database schema created successfully"
    else
        error "Database schema file not found"
    fi
    
    log "Database setup completed"
}

# Build and deploy application
deploy_application() {
    log "Building and deploying application..."
    
    cd "$PROJECT_ROOT"
    
    # Stop existing containers
    log "Stopping existing containers..."
    docker-compose -f docker-compose.production.yml down
    
    # Build new image
    log "Building production Docker image..."
    docker build -f Dockerfile.production -t bulk-doc-generator-backend:latest .
    
    # Start services
    log "Starting services..."
    docker-compose -f docker-compose.production.yml up -d
    
    # Wait for services to be ready
    log "Waiting for services to be ready..."
    sleep 60
    
    log "Application deployment completed"
}

# Health checks
run_health_checks() {
    log "Running health checks..."
    
    local max_attempts=10
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        log "Health check attempt $attempt/$max_attempts"
        
        # Check backend health
        if curl -f http://localhost:3001/api/health > /dev/null 2>&1; then
            log "Backend health check passed"
            break
        else
            warn "Backend health check failed (attempt $attempt/$max_attempts)"
            if [[ $attempt -eq $max_attempts ]]; then
                error "Backend health check failed after $max_attempts attempts"
            fi
            sleep 10
            ((attempt++))
        fi
    done
    
    # Check database connection
    if docker exec bulk-doc-generator-postgres-prod pg_isready -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; then
        log "Database health check passed"
    else
        error "Database health check failed"
    fi
    
    # Check Redis connection
    if docker exec bulk-doc-generator-redis-prod redis-cli --raw incr ping > /dev/null 2>&1; then
        log "Redis health check passed"
    else
        error "Redis health check failed"
    fi
    
    log "All health checks passed"
}

# Setup PM2
setup_pm2() {
    log "Setting up PM2 process management..."
    
    cd "$PROJECT_ROOT"
    
    # Check if PM2 is already running
    if pm2 list | grep -q "bulk-doc-generator-backend"; then
        log "Reloading PM2 configuration..."
        pm2 reload ecosystem.config.js --env production
    else
        log "Starting PM2 with production configuration..."
        pm2 start ecosystem.config.js --env production
    fi
    
    # Save PM2 configuration
    pm2 save
    
    # Setup PM2 startup script
    pm2 startup
    
    log "PM2 setup completed"
}

# Setup monitoring
setup_monitoring() {
    log "Setting up monitoring and logging..."
    
    # Create log directories
    sudo mkdir -p /var/log/bulkdocgenerator
    sudo chown -R $USER:$USER /var/log/bulkdocgenerator
    
    # Setup log rotation
    if [[ ! -f "/etc/logrotate.d/bulkdocgenerator" ]]; then
        sudo tee /etc/logrotate.d/bulkdocgenerator > /dev/null <<EOF
/var/log/bulkdocgenerator/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        pm2 reloadLogs
    endscript
}
EOF
        log "Log rotation configured"
    fi
    
    # Setup monitoring cron jobs
    if ! crontab -l 2>/dev/null | grep -q "bulkdocgenerator"; then
        (crontab -l 2>/dev/null; echo "# Bulk Document Generator monitoring") | crontab -
        (crontab -l 2>/dev/null; echo "*/5 * * * * $PROJECT_ROOT/scripts/monitor.sh") | crontab -
        (crontab -l 2>/dev/null; echo "0 2 * * * $PROJECT_ROOT/scripts/backup.sh") | crontab -
        log "Monitoring cron jobs configured"
    fi
    
    log "Monitoring setup completed"
}

# Rollback function
rollback() {
    log "Rolling back to previous version..."
    
    cd "$PROJECT_ROOT"
    
    # Stop current containers
    docker-compose -f docker-compose.production.yml down
    
    # Revert to previous image
    if docker images | grep -q "bulk-doc-generator-backend:previous"; then
        docker tag bulk-doc-generator-backend:previous bulk-doc-generator-backend:latest
        log "Rolled back to previous image"
    else
        warn "No previous image found for rollback"
    fi
    
    # Start services
    docker-compose -f docker-compose.production.yml up -d
    
    log "Rollback completed"
}

# Main deployment function
main() {
    log "Starting production deployment for environment: $ENVIRONMENT"
    
    check_root
    check_prerequisites
    load_env
    
    case $ACTION in
        "deploy")
            setup_database
            deploy_application
            run_health_checks
            setup_pm2
            setup_monitoring
            log "Production deployment completed successfully!"
            ;;
        "rollback")
            rollback
            run_health_checks
            log "Rollback completed successfully!"
            ;;
        "health")
            run_health_checks
            ;;
        "db-setup")
            setup_database
            ;;
        "pm2-setup")
            setup_pm2
            ;;
        *)
            error "Invalid action: $ACTION. Valid actions: deploy, rollback, health, db-setup, pm2-setup"
            ;;
    esac
}

# Run main function
main "$@"
