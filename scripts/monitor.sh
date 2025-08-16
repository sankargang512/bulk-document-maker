#!/bin/bash

# Production Monitoring Script for Bulk Document Generator Backend
# Runs every 5 minutes via cron job

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_FILE="/var/log/bulkdocgenerator/monitor.log"
ALERT_EMAIL="admin@yourdomain.com"

# Load environment variables
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    export $(cat "$PROJECT_ROOT/.env" | grep -v '^#' | xargs)
fi

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check application health
check_app_health() {
    local status_code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health)
    
    if [[ $status_code -eq 200 ]]; then
        log "Application health check: OK"
        return 0
    else
        log "Application health check: FAILED (HTTP $status_code)"
        return 1
    fi
}

# Check database health
check_db_health() {
    if docker exec bulk-doc-generator-postgres-prod pg_isready -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; then
        log "Database health check: OK"
        return 0
    else
        log "Database health check: FAILED"
        return 1
    fi
}

# Check Redis health
check_redis_health() {
    if docker exec bulk-doc-generator-redis-prod redis-cli --raw incr ping > /dev/null 2>&1; then
        log "Redis health check: OK"
        return 0
    else
        log "Redis health check: FAILED"
        return 1
    fi
}

# Check resource usage
check_resources() {
    # CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    if (( $(echo "$cpu_usage > 80" | bc -l) )); then
        log "WARNING: High CPU usage: ${cpu_usage}%"
    fi
    
    # Memory usage
    local mem_usage=$(free | grep Mem | awk '{printf "%.2f", $3/$2 * 100.0}')
    if (( $(echo "$mem_usage > 85" | bc -l) )); then
        log "WARNING: High memory usage: ${mem_usage}%"
    fi
    
    # Disk usage
    local disk_usage=$(df / | tail -1 | awk '{print $5}' | cut -d'%' -f1)
    if [[ $disk_usage -gt 85 ]]; then
        log "WARNING: High disk usage: ${disk_usage}%"
    fi
    
    log "Resource usage - CPU: ${cpu_usage}%, Memory: ${mem_usage}%, Disk: ${disk_usage}%"
}

# Check PM2 processes
check_pm2() {
    if pm2 list | grep -q "bulk-doc-generator-backend"; then
        local status=$(pm2 jlist | jq -r '.[] | select(.name=="bulk-doc-generator-backend") | .pm2_env.status')
        if [[ "$status" == "online" ]]; then
            log "PM2 process status: OK"
        else
            log "PM2 process status: $status"
            return 1
        fi
    else
        log "PM2 process not found"
        return 1
    fi
}

# Send alert
send_alert() {
    local message="$1"
    local subject="Bulk Document Generator Alert - $(date +'%Y-%m-%d %H:%M:%S')"
    
    if command -v mail &> /dev/null; then
        echo "$message" | mail -s "$subject" "$ALERT_EMAIL"
    fi
    
    log "Alert sent: $message"
}

# Main monitoring function
main() {
    log "Starting monitoring check..."
    
    local failures=0
    
    # Check application health
    if ! check_app_health; then
        ((failures++))
    fi
    
    # Check database health
    if ! check_db_health; then
        ((failures++))
    fi
    
    # Check Redis health
    if ! check_redis_health; then
        ((failures++))
    fi
    
    # Check PM2 processes
    if ! check_pm2; then
        ((failures++))
    fi
    
    # Check resource usage
    check_resources
    
    # Send alert if multiple failures
    if [[ $failures -ge 2 ]]; then
        send_alert "Multiple service failures detected. Please check the system immediately."
    elif [[ $failures -eq 1 ]]; then
        log "Single service failure detected"
    fi
    
    log "Monitoring check completed. Failures: $failures"
}

# Run main function
main "$@"
