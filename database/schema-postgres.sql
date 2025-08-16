-- PostgreSQL Schema for Bulk Document Generator Backend
-- Production-ready with proper indexing and constraints

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE document_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
CREATE TYPE batch_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
CREATE TYPE template_type AS ENUM ('docx', 'pdf', 'html', 'txt');

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Templates table
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    file_type template_type NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    fields JSONB NOT NULL DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    download_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT templates_name_length CHECK (char_length(name) >= 1),
    CONSTRAINT templates_file_size_positive CHECK (file_size > 0)
);

-- Batches table
CREATE TABLE batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status batch_status DEFAULT 'pending',
    total_documents INTEGER DEFAULT 0,
    processed_documents INTEGER DEFAULT 0,
    failed_documents INTEGER DEFAULT 0,
    progress_percentage DECIMAL(5,2) DEFAULT 0.00,
    options JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT batches_progress_percentage_check CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    CONSTRAINT batches_document_counts_check CHECK (total_documents >= 0 AND processed_documents >= 0 AND failed_documents >= 0)
);

-- Documents table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    status document_status DEFAULT 'pending',
    file_path VARCHAR(500),
    file_name VARCHAR(255),
    file_size BIGINT,
    mime_type VARCHAR(100),
    data JSONB NOT NULL DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    error_message TEXT,
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processing_completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT documents_file_size_positive CHECK (file_size IS NULL OR file_size > 0)
);

-- API Keys table
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    permissions JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit Log table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_templates_user_id ON templates(user_id);
CREATE INDEX idx_templates_file_type ON templates(file_type);
CREATE INDEX idx_templates_created_at ON templates(created_at);
CREATE INDEX idx_templates_fields_gin ON templates USING GIN(fields);

CREATE INDEX idx_batches_user_id ON batches(user_id);
CREATE INDEX idx_batches_template_id ON batches(template_id);
CREATE INDEX idx_batches_status ON batches(status);
CREATE INDEX idx_batches_created_at ON batches(created_at);

CREATE INDEX idx_documents_batch_id ON documents(batch_id);
CREATE INDEX idx_documents_template_id ON documents(template_id);
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created_at ON documents(created_at);
CREATE INDEX idx_documents_data_gin ON documents USING GIN(data);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_expires_at ON api_keys(expires_at);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Create partial indexes for active records
CREATE INDEX idx_templates_active ON templates(id) WHERE is_active = true;
CREATE INDEX idx_batches_pending ON batches(id) WHERE status = 'pending';
CREATE INDEX idx_documents_pending ON documents(id) WHERE status = 'pending';

-- Create composite indexes for common queries
CREATE INDEX idx_batches_user_status ON batches(user_id, status);
CREATE INDEX idx_documents_batch_status ON documents(batch_id, status);
CREATE INDEX idx_documents_user_status ON documents(user_id, status);

-- Create indexes for JSONB fields (PostgreSQL specific)
CREATE INDEX idx_templates_metadata_gin ON templates USING GIN(metadata);
CREATE INDEX idx_batches_options_gin ON batches USING GIN(options);
CREATE INDEX idx_documents_metadata_gin ON documents USING GIN(metadata);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_batches_updated_at BEFORE UPDATE ON batches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to update batch progress
CREATE OR REPLACE FUNCTION update_batch_progress()
RETURNS TRIGGER AS $$
BEGIN
    -- Update batch progress when document status changes
    IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN
        UPDATE batches 
        SET 
            processed_documents = (
                SELECT COUNT(*) FROM documents 
                WHERE batch_id = NEW.batch_id AND status = 'completed'
            ),
            failed_documents = (
                SELECT COUNT(*) FROM documents 
                WHERE batch_id = NEW.batch_id AND status = 'failed'
            ),
            progress_percentage = CASE 
                WHEN total_documents > 0 THEN 
                    ROUND(
                        (processed_documents::DECIMAL / total_documents::DECIMAL) * 100, 2
                    )
                ELSE 0 
            END,
            status = CASE 
                WHEN processed_documents + failed_documents >= total_documents THEN 'completed'
                WHEN processed_documents + failed_documents > 0 THEN 'processing'
                ELSE 'pending'
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.batch_id;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for batch progress updates
CREATE TRIGGER update_batch_progress_trigger
    AFTER INSERT OR UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_batch_progress();

-- Create function to clean up old audit logs
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM audit_logs 
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
END;
$$ language 'plpgsql';

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO bulkdocuser_prod;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO bulkdocuser_prod;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO bulkdocuser_prod;

-- Create views for common queries
CREATE VIEW active_templates AS
SELECT t.*, u.email as user_email
FROM templates t
JOIN users u ON t.user_id = u.id
WHERE t.is_active = true;

CREATE VIEW batch_summary AS
SELECT 
    b.*,
    t.name as template_name,
    u.email as user_email,
    ROUND(
        (b.processed_documents::DECIMAL / NULLIF(b.total_documents, 0)) * 100, 2
    ) as calculated_progress
FROM batches b
JOIN templates t ON b.template_id = t.id
JOIN users u ON b.user_id = u.id;

CREATE VIEW document_stats AS
SELECT 
    COUNT(*) as total_documents,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_documents,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_documents,
    COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_documents,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_documents,
    AVG(CASE WHEN file_size IS NOT NULL THEN file_size END) as avg_file_size
FROM documents;
