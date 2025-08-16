#!/bin/bash

# Production Backup Script for Bulk Document Generator Backend
# Runs daily at 2 AM via cron job

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="/var/backups/bulkdocgenerator"
RETENTION_DAYS=30

# Load environment variables
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    export $(cat "$PROJECT_ROOT/.env" | grep -v '^#' | xargs)
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Database backup
backup_database() {
    local timestamp=$(date +'%Y%m%d_%H%M%S')
    local backup_file="$BACKUP_DIR/db_backup_$timestamp.sql"
    
    log "Starting database backup..."
    
    if docker exec bulk-doc-generator-postgres-prod pg_dump -U "$DB_USER" -d "$DB_NAME" > "$backup_file"; then
        log "Database backup completed: $backup_file"
        
        # Compress backup
        gzip "$backup_file"
        log "Database backup compressed: $backup_file.gz"
    else
        log "Database backup failed"
        return 1
    fi
}

# File backup
backup_files() {
    local timestamp=$(date +'%Y%m%d_%H%M%S')
    local backup_file="$BACKUP_DIR/files_backup_$timestamp.tar.gz"
    
    log "Starting file backup..."
    
    cd "$PROJECT_ROOT"
    if tar -czf "$backup_file" uploads/ generated/ temp/; then
        log "File backup completed: $backup_file"
    else
        log "File backup failed"
        return 1
    fi
}

# Cleanup old backups
cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."
    
    find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
    find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
    
    log "Cleanup completed"
}

# Main backup function
main() {
    log "Starting backup process..."
    
    backup_database
    backup_files
    cleanup_old_backups
    
    log "Backup process completed successfully"
}

# Run main function
main "$@"
