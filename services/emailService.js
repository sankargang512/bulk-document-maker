const sgMail = require('@sendgrid/mail');
const fs = require('fs').promises;
const path = require('path');
const handlebars = require('handlebars');
const { ValidationError, ExternalServiceError } = require('../middleware/errorHandler');

/**
 * @typedef {Object} EmailOptions
 * @property {string} to - Recipient email address
 * @property {string} subject - Email subject
 * @property {string} template - Email template name
 * @property {Object} data - Template data
 * @property {string} from - Sender email address
 * @property {string} replyTo - Reply-to email address
 * @property {Object[]} attachments - Email attachments
 * @property {boolean} trackOpens - Whether to track email opens
 * @property {boolean} trackClicks - Whether to track email clicks
 * @property {Object} customHeaders - Custom email headers
 */

/**
 * @typedef {Object} EmailTemplate
 * @property {string} name - Template name
 * @property {string} subject - Default subject line
 * @property {string} html - HTML template content
 * @property {string} text - Plain text template content
 * @property {Object} variables - Template variables definition
 * @property {string} category - Template category
 * @property {boolean} isActive - Whether template is active
 */

/**
 * @typedef {Object} EmailResult
 * @property {string} messageId - SendGrid message ID
 * @property {string} status - Email status
 * @property {Date} sentAt - When email was sent
 * @property {Object} metadata - Additional metadata
 */

/**
 * Email Service
 * Handles email notifications using SendGrid with templated emails and tracking
 */
class EmailService {
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.SENDGRID_API_KEY,
      fromEmail: config.fromEmail || process.env.FROM_EMAIL || 'noreply@bulkdocumentmaker.com',
      fromName: config.fromName || process.env.FROM_NAME || 'Bulk Document Maker',
      replyTo: config.replyTo || process.env.REPLY_TO_EMAIL,
      templatesDir: config.templatesDir || path.join(__dirname, '../templates/emails'),
      defaultLanguage: config.defaultLanguage || 'en',
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      ...config
    };

    if (!this.config.apiKey) {
      throw new Error('SendGrid API key is required');
    }

    // Initialize SendGrid
    sgMail.setApiKey(this.config.apiKey);

    // Initialize templates
    this.templates = new Map();
    this.loadTemplates();

    // Email tracking
    this.sentEmails = new Map();
    this.failedEmails = new Map();
  }

  /**
   * Send email using template
   * @param {EmailOptions} options - Email options
   * @returns {Promise<EmailResult>} Email result
   */
  async sendEmail(options) {
    try {
      // Validate options
      this.validateEmailOptions(options);

      // Get template
      const template = this.getTemplate(options.template);
      if (!template) {
        throw new Error(`Email template '${options.template}' not found`);
      }

      // Prepare email data
      const emailData = await this.prepareEmailData(options, template);

      // Send email
      const result = await this.sendViaSendGrid(emailData);

      // Track successful email
      this.trackEmail(options.to, result, 'sent');

      return result;

    } catch (error) {
      // Track failed email
      this.trackEmail(options.to, { error: error.message }, 'failed');

      if (error instanceof ValidationError) {
        throw error;
      }

      throw new ExternalServiceError(`Email sending failed: ${error.message}`, [{
        field: 'email',
        message: error.message,
        code: 'EMAIL_SEND_ERROR'
      }]);
    }
  }

  /**
   * Send job completion notification
   * @param {Object} job - Generation job
   * @param {string} userEmail - User email address
   * @param {Object} options - Additional options
   * @returns {Promise<EmailResult>} Email result
   */
  async sendJobCompletionNotification(job, userEmail, options = {}) {
    const emailOptions = {
      to: userEmail,
      subject: `Your documents are ready - Job ${job.id}`,
      template: 'job-completion',
      data: {
        jobId: job.id,
        jobName: job.fileName || 'Document Generation',
        totalDocuments: job.results.length,
        completedDocuments: job.results.filter(r => r.status === 'completed').length,
        failedDocuments: job.results.filter(r => r.status === 'failed').length,
        downloadLinks: this.generateDownloadLinks(job.results),
        completedAt: job.completedAt,
        ...options
      }
    };

    return this.sendEmail(emailOptions);
  }

  /**
   * Send job failure notification
   * @param {Object} job - Generation job
   * @param {string} userEmail - User email address
   * @param {Object} options - Additional options
   * @returns {Promise<EmailResult>} Email result
   */
  async sendJobFailureNotification(job, userEmail, options = {}) {
    const emailOptions = {
      to: userEmail,
      subject: `Document generation failed - Job ${job.id}`,
      template: 'job-failure',
      data: {
        jobId: job.id,
        jobName: job.fileName || 'Document Generation',
        errorCount: job.errors.length,
        errors: job.errors.slice(0, 5), // Limit to first 5 errors
        failedAt: job.updatedAt,
        supportEmail: this.config.replyTo || 'support@bulkdocumentmaker.com',
        ...options
      }
    };

    return this.sendEmail(emailOptions);
  }

  /**
   * Send progress update notification
   * @param {Object} job - Generation job
   * @param {string} userEmail - User email address
   * @param {Object} options - Additional options
   * @returns {Promise<EmailResult>} Email result
   */
  async sendProgressUpdateNotification(job, userEmail, options = {}) {
    const emailOptions = {
      to: userEmail,
      subject: `Document generation progress - Job ${job.id}`,
      template: 'job-progress',
      data: {
        jobId: job.id,
        jobName: job.fileName || 'Document Generation',
        progress: job.progress,
        totalDocuments: job.dataRows.length,
        processedDocuments: job.results.length,
        estimatedTimeRemaining: this.calculateEstimatedTime(job),
        ...options
      }
    };

    return this.sendEmail(emailOptions);
  }

  /**
   * Send welcome email
   * @param {Object} user - User information
   * @param {Object} options - Additional options
   * @returns {Promise<EmailResult>} Email result
   */
  async sendWelcomeEmail(user, options = {}) {
    const emailOptions = {
      to: user.email,
      subject: 'Welcome to Bulk Document Maker!',
      template: 'welcome',
      data: {
        firstName: user.firstName || user.name?.split(' ')[0] || 'there',
        fullName: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.name || 'User',
        loginUrl: options.loginUrl || 'https://bulkdocumentmaker.com/login',
        dashboardUrl: options.dashboardUrl || 'https://bulkdocumentmaker.com/dashboard',
        supportEmail: this.config.replyTo || 'support@bulkdocumentmaker.com',
        ...options
      }
    };

    return this.sendEmail(emailOptions);
  }

  /**
   * Send password reset email
   * @param {Object} user - User information
   * @param {string} resetToken - Password reset token
   * @param {Object} options - Additional options
   * @returns {Promise<EmailResult>} Email result
   */
  async sendPasswordResetEmail(user, resetToken, options = {}) {
    const emailOptions = {
      to: user.email,
      subject: 'Reset your password - Bulk Document Maker',
      template: 'password-reset',
      data: {
        firstName: user.firstName || user.name?.split(' ')[0] || 'there',
        resetUrl: options.resetUrl || `https://bulkdocumentmaker.com/reset-password?token=${resetToken}`,
        resetToken,
        expiresAt: options.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        supportEmail: this.config.replyTo || 'support@bulkdocumentmaker.com',
        ...options
      }
    };

    return this.sendEmail(emailOptions);
  }

  /**
   * Send account verification email
   * @param {Object} user - User information
   * @param {string} verificationToken - Verification token
   * @param {Object} options - Additional options
   * @returns {Promise<EmailResult>} Email result
   */
  async sendAccountVerificationEmail(user, verificationToken, options = {}) {
    const emailOptions = {
      to: user.email,
      subject: 'Verify your account - Bulk Document Maker',
      template: 'account-verification',
      data: {
        firstName: user.firstName || user.name?.split(' ')[0] || 'there',
        verificationUrl: options.verificationUrl || `https://bulkdocumentmaker.com/verify?token=${verificationToken}`,
        verificationToken,
        expiresAt: options.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        supportEmail: this.config.replyTo || 'support@buly-documentmaker.com',
        ...options
      }
    };

    return this.sendEmail(emailOptions);
  }

  /**
   * Send system alert email
   * @param {string} alertType - Type of alert
   * @param {Object} alertData - Alert data
   * @param {string} adminEmail - Admin email address
   * @param {Object} options - Additional options
   * @returns {Promise<EmailResult>} Email result
   */
  async sendSystemAlertEmail(alertType, alertData, adminEmail, options = {}) {
    const emailOptions = {
      to: adminEmail,
      subject: `System Alert: ${alertType} - Bulk Document Maker`,
      template: 'system-alert',
      data: {
        alertType,
        alertData,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        dashboardUrl: options.dashboardUrl || 'https://bulkdocumentmaker.com/admin',
        ...options
      }
    };

    return this.sendEmail(emailOptions);
  }

  /**
   * Prepare email data for sending
   * @param {EmailOptions} options - Email options
   * @param {EmailTemplate} template - Email template
   * @returns {Promise<Object>} Prepared email data
   */
  async prepareEmailData(options, template) {
    // Compile template
    const compiledTemplate = handlebars.compile(template.html);
    const compiledTextTemplate = template.text ? handlebars.compile(template.text) : null;

    // Merge template data with options data
    const templateData = {
      ...this.getDefaultTemplateData(),
      ...options.data
    };

    // Generate HTML and text content
    const htmlContent = compiledTemplate(templateData);
    const textContent = compiledTextTemplate ? compiledTextTemplate(templateData) : this.htmlToText(htmlContent);

    // Prepare email data
    const emailData = {
      to: options.to,
      from: {
        email: options.from || this.config.fromEmail,
        name: options.fromName || this.config.fromName
      },
      subject: options.subject || template.subject,
      html: htmlContent,
      text: textContent,
      replyTo: options.replyTo || this.config.replyTo,
      trackingSettings: {
        clickTracking: {
          enable: options.trackClicks !== false,
          enableText: options.trackClicks !== false
        },
        openTracking: {
          enable: options.trackOpens !== false
        }
      }
    };

    // Add attachments if any
    if (options.attachments && options.attachments.length > 0) {
      emailData.attachments = await this.prepareAttachments(options.attachments);
    }

    // Add custom headers if any
    if (options.customHeaders) {
      emailData.customArgs = options.customHeaders;
    }

    return emailData;
  }

  /**
   * Send email via SendGrid
   * @param {Object} emailData - Prepared email data
   * @returns {Promise<EmailResult>} Email result
   */
  async sendViaSendGrid(emailData) {
    let attempts = 0;
    
    while (attempts < this.config.retryAttempts) {
      try {
        const response = await sgMail.send(emailData);
        
        return {
          messageId: response[0]?.headers['x-message-id'] || 'unknown',
          status: 'sent',
          sentAt: new Date(),
          metadata: {
            responseHeaders: response[0]?.headers,
            attempts: attempts + 1
          }
        };

      } catch (error) {
        attempts++;
        
        if (attempts >= this.config.retryAttempts) {
          throw error;
        }
        
        // Wait before retry
        await this.delay(this.config.retryDelay * attempts);
      }
    }
  }

  /**
   * Prepare email attachments
   * @param {Object[]} attachments - Attachment objects
   * @returns {Promise<Object[]>} Prepared attachments
   */
  async prepareAttachments(attachments) {
    const preparedAttachments = [];
    
    for (const attachment of attachments) {
      try {
        let content;
        
        if (attachment.path) {
          // Read file from path
          content = await fs.readFile(attachment.path);
        } else if (attachment.content) {
          // Use provided content
          content = attachment.content;
        } else {
          throw new Error('Attachment must have either path or content');
        }
        
        preparedAttachments.push({
          content: content.toString('base64'),
          filename: attachment.filename || 'attachment',
          type: attachment.type || 'application/octet-stream',
          disposition: attachment.disposition || 'attachment'
        });
        
      } catch (error) {
        console.error(`Failed to prepare attachment: ${error.message}`);
      }
    }
    
    return preparedAttachments;
  }

  /**
   * Generate download links for completed documents
   * @param {Object[]} results - Generation results
   * @returns {Object[]} Download links
   */
  generateDownloadLinks(results) {
    return results
      .filter(result => result.status === 'completed')
      .map(result => ({
        fileName: result.fileName,
        downloadUrl: `/api/documents/download/${result.rowId}`,
        fileSize: this.formatFileSize(result.fileSize),
        generatedAt: result.generatedAt
      }));
  }

  /**
   * Calculate estimated time remaining for job
   * @param {Object} job - Generation job
   * @returns {string} Estimated time remaining
   */
  calculateEstimatedTime(job) {
    if (job.results.length === 0) {
      return 'Calculating...';
    }
    
    const completedResults = job.results.filter(r => r.status === 'completed');
    if (completedResults.length === 0) {
      return 'Calculating...';
    }
    
    // Calculate average time per document
    const totalTime = Date.now() - job.createdAt.getTime();
    const avgTimePerDoc = totalTime / completedResults.length;
    
    // Calculate remaining documents
    const remainingDocs = job.dataRows.length - completedResults.length;
    const estimatedTimeMs = remainingDocs * avgTimePerDoc;
    
    return this.formatDuration(estimatedTimeMs);
  }

  /**
   * Format file size
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format duration
   * @param {number} milliseconds - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Convert HTML to plain text
   * @param {string} html - HTML content
   * @returns {string} Plain text content
   */
  htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
      .replace(/&amp;/g, '&') // Replace &amp; with &
      .replace(/&lt;/g, '<') // Replace &lt; with <
      .replace(/&gt;/g, '>') // Replace &gt; with >
      .replace(/&quot;/g, '"') // Replace &quot; with "
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
  }

  /**
   * Get default template data
   * @returns {Object} Default template data
   */
  getDefaultTemplateData() {
    return {
      companyName: 'Bulk Document Maker',
      companyUrl: 'https://bulkdocumentmaker.com',
      supportEmail: this.config.replyTo || 'support@bulkdocumentmaker.com',
      currentYear: new Date().getFullYear(),
      logoUrl: 'https://bulkdocumentmaker.com/images/logo.png',
      brandColors: {
        primary: '#E26868',
        secondary: '#81967A',
        accent: '#3B2E2E'
      }
    };
  }

  /**
   * Load email templates
   * @returns {Promise<void>}
   */
  async loadTemplates() {
    try {
      const templateFiles = await fs.readdir(this.config.templatesDir);
      
      for (const file of templateFiles) {
        if (file.endsWith('.json')) {
          const templatePath = path.join(this.config.templatesDir, file);
          const templateContent = await fs.readFile(templatePath, 'utf8');
          const template = JSON.parse(templateContent);
          
          this.templates.set(template.name, template);
        }
      }
      
      console.log(`Loaded ${this.templates.size} email templates`);
      
    } catch (error) {
      console.warn('Failed to load email templates:', error.message);
      // Load default templates
      this.loadDefaultTemplates();
    }
  }

  /**
   * Load default email templates
   * @returns {void}
   */
  loadDefaultTemplates() {
    const defaultTemplates = {
      'job-completion': {
        name: 'job-completion',
        subject: 'Your documents are ready!',
        html: this.getDefaultJobCompletionTemplate(),
        text: this.getDefaultJobCompletionTextTemplate(),
        variables: ['jobId', 'jobName', 'totalDocuments', 'completedDocuments', 'downloadLinks'],
        category: 'notifications',
        isActive: true
      },
      'job-failure': {
        name: 'job-failure',
        subject: 'Document generation failed',
        html: this.getDefaultJobFailureTemplate(),
        text: this.getDefaultJobFailureTextTemplate(),
        variables: ['jobId', 'jobName', 'errorCount', 'errors', 'supportEmail'],
        category: 'notifications',
        isActive: true
      },
      'welcome': {
        name: 'welcome',
        subject: 'Welcome to Bulk Document Maker!',
        html: this.getDefaultWelcomeTemplate(),
        text: this.getDefaultWelcomeTextTemplate(),
        variables: ['firstName', 'fullName', 'loginUrl', 'dashboardUrl'],
        category: 'onboarding',
        isActive: true
      }
    };

    for (const [name, template] of Object.entries(defaultTemplates)) {
      this.templates.set(name, template);
    }
  }

  /**
   * Get default job completion HTML template
   * @returns {string} HTML template
   */
  getDefaultJobCompletionTemplate() {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Documents Ready</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #E26868; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #81967A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Your Documents Are Ready!</h1>
          </div>
          <div class="content">
            <h2>Job: {{jobName}}</h2>
            <p>Your document generation job has been completed successfully!</p>
            
            <div style="background: white; padding: 15px; border-radius: 6px; margin: 15px 0;">
              <strong>Summary:</strong><br>
              • Total documents: {{totalDocuments}}<br>
              • Completed: {{completedDocuments}}<br>
              • Failed: {{failedDocuments}}
            </div>
            
            <p><strong>Download your documents:</strong></p>
            {{#each downloadLinks}}
            <div style="background: white; padding: 15px; border-radius: 6px; margin: 10px 0;">
              <strong>{{fileName}}</strong><br>
              Size: {{fileSize}}<br>
              <a href="{{downloadUrl}}" class="button">Download</a>
            </div>
            {{/each}}
            
            <p>If you have any questions, please contact our support team.</p>
          </div>
          <div class="footer">
            <p>&copy; {{currentYear}} Bulk Document Maker. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get default job completion text template
   * @returns {string} Text template
   */
  getDefaultJobCompletionTextTemplate() {
    return `
Your Documents Are Ready!

Job: {{jobName}}

Your document generation job has been completed successfully!

Summary:
- Total documents: {{totalDocuments}}
- Completed: {{completedDocuments}}
- Failed: {{failedDocuments}}

Download your documents:
{{#each downloadLinks}}
{{fileName}} ({{fileSize}})
Download: {{downloadUrl}}

{{/each}}

If you have any questions, please contact our support team.

© {{currentYear}} Bulk Document Maker. All rights reserved.
    `;
  }

  /**
   * Get default job failure HTML template
   * @returns {string} HTML template
   */
  getDefaultJobFailureTemplate() {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Generation Failed</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .error { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 15px; border-radius: 6px; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Document Generation Failed</h1>
          </div>
          <div class="content">
            <h2>Job: {{jobName}}</h2>
            <p>Unfortunately, your document generation job has failed.</p>
            
            <div class="error">
              <strong>Error Summary:</strong><br>
              • Total errors: {{errorCount}}<br>
              {{#each errors}}
              • {{this}}<br>
              {{/each}}
            </div>
            
            <p>Please check your template and data, then try again. If the problem persists, contact our support team.</p>
            
            <p><strong>Support:</strong> <a href="mailto:{{supportEmail}}">{{supportEmail}}</a></p>
          </div>
          <div class="footer">
            <p>&copy; {{currentYear}} Bulk Document Maker. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get default job failure text template
   * @returns {string} Text template
   */
  getDefaultJobFailureTextTemplate() {
    return `
Document Generation Failed

Job: {{jobName}}

Unfortunately, your document generation job has failed.

Error Summary:
- Total errors: {{errorCount}}
{{#each errors}}
- {{this}}
{{/each}}

Please check your template and data, then try again. If the problem persists, contact our support team.

Support: {{supportEmail}}

© {{currentYear}} Bulk Document Maker. All rights reserved.
    `;
  }

  /**
   * Get default welcome HTML template
   * @returns {string} HTML template
   */
  getDefaultWelcomeTemplate() {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome!</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #E26868; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #81967A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to Bulk Document Maker!</h1>
          </div>
          <div class="content">
            <h2>Hello {{firstName}}!</h2>
            <p>Welcome to Bulk Document Maker! We're excited to have you on board.</p>
            
            <p>With our platform, you can:</p>
            <ul>
              <li>Generate hundreds of documents in minutes</li>
              <li>Use professional templates</li>
              <li>Automate your document workflow</li>
              <li>Save time and reduce errors</li>
            </ul>
            
            <p><a href="{{dashboardUrl}}" class="button">Go to Dashboard</a></p>
            
            <p>If you have any questions, our support team is here to help!</p>
          </div>
          <div class="footer">
            <p>&copy; {{currentYear}} Bulk Document Maker. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get default welcome text template
   * @returns {string} Text template
   */
  getDefaultWelcomeTextTemplate() {
    return `
Welcome to Bulk Document Maker!

Hello {{firstName}}!

Welcome to Bulk Document Maker! We're excited to have you on board.

With our platform, you can:
- Generate hundreds of documents in minutes
- Use professional templates
- Automate your document workflow
- Save time and reduce errors

Dashboard: {{dashboardUrl}}

If you have any questions, our support team is here to help!

© {{currentYear}} Bulk Document Maker. All rights reserved.
    `;
  }

  /**
   * Validate email options
   * @param {EmailOptions} options - Email options
   * @returns {void}
   */
  validateEmailOptions(options) {
    if (!options.to || typeof options.to !== 'string') {
      throw new ValidationError('Recipient email is required and must be a string');
    }
    
    if (!this.isValidEmail(options.to)) {
      throw new ValidationError('Invalid recipient email format');
    }
    
    if (!options.template || typeof options.template !== 'string') {
      throw new ValidationError('Email template is required and must be a string');
    }
    
    if (options.from && !this.isValidEmail(options.from)) {
      throw new ValidationError('Invalid sender email format');
    }
  }

  /**
   * Validate email format
   * @param {string} email - Email address
   * @returns {boolean} Whether email is valid
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Get template by name
   * @param {string} name - Template name
   * @returns {EmailTemplate|null} Template or null
   */
  getTemplate(name) {
    return this.templates.get(name) || null;
  }

  /**
   * Get all templates
   * @returns {EmailTemplate[]} Array of templates
   */
  getAllTemplates() {
    return Array.from(this.templates.values());
  }

  /**
   * Add or update template
   * @param {EmailTemplate} template - Template to add/update
   * @returns {void}
   */
  addTemplate(template) {
    this.templates.set(template.name, template);
  }

  /**
   * Remove template
   * @param {string} name - Template name
   * @returns {boolean} Whether template was removed
   */
  removeTemplate(name) {
    return this.templates.delete(name);
  }

  /**
   * Track email
   * @param {string} email - Email address
   * @param {Object} result - Email result
   * @param {string} status - Email status
   * @returns {void}
   */
  trackEmail(email, result, status) {
    const trackingData = {
      email,
      status,
      timestamp: new Date(),
      result
    };
    
    if (status === 'sent') {
      this.sentEmails.set(email, trackingData);
    } else if (status === 'failed') {
      this.failedEmails.set(email, trackingData);
    }
  }

  /**
   * Get email tracking statistics
   * @returns {Object} Tracking statistics
   */
  getTrackingStats() {
    return {
      totalSent: this.sentEmails.size,
      totalFailed: this.failedEmails.size,
      successRate: this.sentEmails.size / (this.sentEmails.size + this.failedEmails.size) * 100
    };
  }

  /**
   * Clear tracking data
   * @returns {void}
   */
  clearTrackingData() {
    this.sentEmails.clear();
    this.failedEmails.clear();
  }

  /**
   * Delay execution
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test email service
   * @param {string} testEmail - Test email address
   * @returns {Promise<boolean>} Whether test was successful
   */
  async testEmailService(testEmail) {
    try {
      await this.sendEmail({
        to: testEmail,
        subject: 'Test Email - Bulk Document Maker',
        template: 'welcome',
        data: {
          firstName: 'Test',
          fullName: 'Test User',
          loginUrl: 'https://bulkdocumentmaker.com/login',
          dashboardUrl: 'https://bulkdocumentmaker.com/dashboard'
        }
      });
      
      return true;
    } catch (error) {
      console.error('Email service test failed:', error.message);
      return false;
    }
  }
}

module.exports = EmailService;
