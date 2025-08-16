-- =====================================================
-- Bulk Document Maker Database Schema
-- =====================================================

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- =====================================================
-- Core Tables
-- =====================================================

-- Batches table: Stores document generation jobs
CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    progress INTEGER DEFAULT 0 
        CHECK (progress >= 0 AND progress <= 100),
    total_documents INTEGER NOT NULL DEFAULT 0,
    completed_documents INTEGER DEFAULT 0,
    failed_documents INTEGER DEFAULT 0,
    template_path TEXT NOT NULL,
    csv_path TEXT NOT NULL,
    zip_path TEXT,
    options TEXT, -- JSON string for generation options
    notification_email TEXT,
    error_message TEXT,
    estimated_time TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    cancelled_at DATETIME
);

-- Documents table: Stores individual generated documents
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    row_id TEXT NOT NULL, -- Reference to CSV row
    filename TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    file_path TEXT,
    file_size INTEGER,
    file_type TEXT,
    error_message TEXT,
    processing_time_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
);

-- Templates table: Stores reusable templates
CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    file_type TEXT NOT NULL,
    variables TEXT, -- JSON string for placeholder variables
    structure TEXT, -- JSON string for document structure
    complexity TEXT DEFAULT 'simple'
        CHECK (complexity IN ('simple', 'moderate', 'complex', 'very_complex')),
    usage_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    tags TEXT -- JSON array of tags
);

-- =====================================================
-- Supporting Tables
-- =====================================================

-- Users table: For future authentication system
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    company TEXT,
    role TEXT DEFAULT 'user'
        CHECK (role IN ('user', 'admin', 'super_admin')),
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
);

-- Template categories table: For organizing templates
CREATE TABLE IF NOT EXISTS template_categories (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    parent_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES template_categories(id)
);

-- Batch notifications table: For tracking email notifications
CREATE TABLE IF NOT EXISTS batch_notifications (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    type TEXT NOT NULL
        CHECK (type IN ('created', 'progress', 'completed', 'failed', 'cancelled')),
    email TEXT NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'sent'
        CHECK (status IN ('sent', 'delivered', 'failed', 'bounced')),
    error_message TEXT,
    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
);

-- API logs table: For monitoring and debugging
CREATE TABLE IF NOT EXISTS api_logs (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    user_email TEXT,
    ip_address TEXT,
    user_agent TEXT,
    request_body TEXT,
    response_status INTEGER,
    response_time_ms INTEGER,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- Indexes for Performance
-- =====================================================

-- Batches table indexes
CREATE INDEX IF NOT EXISTS idx_batches_user_email ON batches(user_email);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_created_at ON batches(created_at);
CREATE INDEX IF NOT EXISTS idx_batches_status_created ON batches(status, created_at);
CREATE INDEX IF NOT EXISTS idx_batches_user_status ON batches(user_email, status);

-- Documents table indexes
CREATE INDEX IF NOT EXISTS idx_documents_batch_id ON documents(batch_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_batch_status ON documents(batch_id, status);

-- Templates table indexes
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_complexity ON templates(complexity);
CREATE INDEX IF NOT EXISTS idx_templates_is_active ON templates(is_active);
CREATE INDEX IF NOT EXISTS idx_templates_usage_count ON templates(usage_count);
CREATE INDEX IF NOT EXISTS idx_templates_created_at ON templates(created_at);

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- API logs table indexes
CREATE INDEX IF NOT EXISTS idx_api_logs_request_id ON api_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint ON api_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_logs_user_email ON api_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_logs_status_created ON api_logs(response_status, created_at);

-- =====================================================
-- Views for Common Queries
-- =====================================================

-- Batch summary view
CREATE VIEW IF NOT EXISTS batch_summary AS
SELECT 
    b.id,
    b.user_email,
    b.status,
    b.progress,
    b.total_documents,
    b.completed_documents,
    b.failed_documents,
    b.created_at,
    b.completed_at,
    CASE 
        WHEN b.status = 'completed' THEN 'success'
        WHEN b.status = 'failed' THEN 'error'
        WHEN b.status = 'cancelled' THEN 'warning'
        WHEN b.status = 'processing' THEN 'info'
        ELSE 'default'
    END as status_type,
    ROUND(
        CASE 
            WHEN b.total_documents > 0 
            THEN (b.completed_documents * 100.0 / b.total_documents)
            ELSE 0 
        END, 2
    ) as completion_percentage
FROM batches b;

-- Template usage statistics view
CREATE VIEW IF NOT EXISTS template_usage_stats AS
SELECT 
    t.id,
    t.name,
    t.category,
    t.complexity,
    t.usage_count,
    t.created_at,
    COUNT(d.id) as total_documents_generated,
    COUNT(CASE WHEN d.status = 'completed' THEN 1 END) as successful_documents,
    COUNT(CASE WHEN d.status = 'failed' THEN 1 END) as failed_documents,
    ROUND(
        CASE 
            WHEN COUNT(d.id) > 0 
            THEN (COUNT(CASE WHEN d.status = 'completed' THEN 1 END) * 100.0 / COUNT(d.id))
            ELSE 0 
        END, 2
    ) as success_rate
FROM templates t
LEFT JOIN documents d ON d.batch_id IN (
    SELECT id FROM batches WHERE template_path = t.file_path
)
GROUP BY t.id, t.name, t.category, t.complexity, t.usage_count, t.created_at;

-- User activity summary view
CREATE VIEW IF NOT EXISTS user_activity_summary AS
SELECT 
    u.email,
    u.first_name,
    u.last_name,
    u.company,
    COUNT(b.id) as total_batches,
    COUNT(CASE WHEN b.status = 'completed' THEN 1 END) as completed_batches,
    COUNT(CASE WHEN b.status = 'failed' THEN 1 END) as failed_batches,
    SUM(b.total_documents) as total_documents_processed,
    MAX(b.created_at) as last_activity,
    u.created_at as user_since
FROM users u
LEFT JOIN batches b ON u.email = b.user_email
GROUP BY u.email, u.first_name, u.last_name, u.company, u.created_at;

-- =====================================================
-- Triggers for Data Integrity
-- =====================================================

-- Update updated_at timestamp on batch updates
CREATE TRIGGER IF NOT EXISTS update_batches_updated_at
    AFTER UPDATE ON batches
    FOR EACH ROW
BEGIN
    UPDATE batches SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Update updated_at timestamp on document updates
CREATE TRIGGER IF NOT EXISTS update_documents_updated_at
    AFTER UPDATE ON documents
    FOR EACH ROW
BEGIN
    UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Update updated_at timestamp on template updates
CREATE TRIGGER IF NOT EXISTS update_templates_updated_at
    AFTER UPDATE ON templates
    FOR EACH ROW
BEGIN
    UPDATE templates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Update updated_at timestamp on user updates
CREATE TRIGGER IF NOT EXISTS update_users_updated_at
    AFTER UPDATE ON users
    FOR EACH ROW
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Auto-update batch progress when documents are updated
CREATE TRIGGER IF NOT EXISTS update_batch_progress
    AFTER UPDATE ON documents
    FOR EACH ROW
BEGIN
    UPDATE batches 
    SET 
        completed_documents = (
            SELECT COUNT(*) 
            FROM documents 
            WHERE batch_id = NEW.batch_id AND status = 'completed'
        ),
        failed_documents = (
            SELECT COUNT(*) 
            FROM documents 
            WHERE batch_id = NEW.batch_id AND status = 'failed'
        ),
        progress = CASE 
            WHEN total_documents > 0 
            THEN ROUND(
                (SELECT COUNT(*) FROM documents WHERE batch_id = NEW.batch_id AND status = 'completed') * 100.0 / total_documents
            )
            ELSE 0 
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.batch_id;
END;

-- Auto-update batch status when all documents are processed
CREATE TRIGGER IF NOT EXISTS update_batch_status_complete
    AFTER UPDATE ON documents
    FOR EACH ROW
BEGIN
    UPDATE batches 
    SET 
        status = CASE 
            WHEN (
                SELECT COUNT(*) 
                FROM documents 
                WHERE batch_id = NEW.batch_id AND status IN ('completed', 'failed')
            ) = (
                SELECT total_documents 
                FROM batches 
                WHERE id = NEW.batch_id
            ) THEN 'completed'
            ELSE status
        END,
        completed_at = CASE 
            WHEN (
                SELECT COUNT(*) 
                FROM documents 
                WHERE batch_id = NEW.batch_id AND status IN ('completed', 'failed')
            ) = (
                SELECT total_documents 
                FROM batches 
                WHERE id = NEW.batch_id
            ) THEN CURRENT_TIMESTAMP
            ELSE completed_at
        END
    WHERE id = NEW.batch_id;
END;

-- =====================================================
-- Initial Data
-- =====================================================

-- Insert default template categories
INSERT OR IGNORE INTO template_categories (id, name, description) VALUES
('cat_hr', 'Human Resources', 'HR-related documents like contracts, offer letters, and policies'),
('cat_legal', 'Legal Documents', 'Legal contracts, agreements, and legal correspondence'),
('cat_business', 'Business Documents', 'Business proposals, reports, and correspondence'),
('cat_education', 'Education', 'Educational certificates, transcripts, and reports'),
('cat_healthcare', 'Healthcare', 'Medical forms, patient records, and healthcare documents'),
('cat_finance', 'Finance', 'Financial reports, invoices, and financial documents');

-- Insert system user for internal operations
INSERT OR IGNORE INTO users (id, email, first_name, last_name, role) VALUES
('system_user', 'system@bulkdocumentmaker.com', 'System', 'User', 'super_admin');

-- =====================================================
-- Database Version Tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert current schema version
INSERT OR IGNORE INTO schema_migrations (version, description) VALUES
('1.0.0', 'Initial schema with batches, documents, templates, and users tables');

-- =====================================================
-- Comments and Documentation
-- =====================================================

-- This schema provides a robust foundation for the Bulk Document Maker application
-- Key features:
-- 1. Comprehensive batch and document tracking
-- 2. Template management with versioning
-- 3. User activity monitoring
-- 4. Performance optimization with proper indexing
-- 5. Data integrity with triggers and constraints
-- 6. Audit trail with API logging
-- 7. Scalable design for future enhancements
