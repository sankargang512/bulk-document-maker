const emailService = require('../services/emailService');
const responseUtils = require('../utils/responseUtils');

class EmailController {
  // Send document ready notification
  async sendDocumentNotification(req, res) {
    try {
      const { email, documentId, documentName, downloadUrl } = req.body;

      if (!email || !documentId || !documentName) {
        return responseUtils.error(res, 'Email, document ID, and document name are required', 400);
      }

      await emailService.sendDocumentReadyEmail(email, {
        documentId,
        documentName,
        downloadUrl
      });

      res.status(200).json({
        success: true,
        message: 'Document notification email sent successfully'
      });

    } catch (error) {
      console.error('Email notification error:', error);
      responseUtils.error(res, 'Failed to send email notification', 500, error.message);
    }
  }

  // Send batch completion notification
  async sendBatchNotification(req, res) {
    try {
      const { email, batchId, totalDocuments, downloadUrl } = req.body;

      if (!email || !batchId || !totalDocuments) {
        return responseUtils.error(res, 'Email, batch ID, and total documents are required', 400);
      }

      await emailService.sendBatchDocumentReadyEmail(email, {
        batchId,
        totalDocuments,
        downloadUrl
      });

      res.status(200).json({
        success: true,
        message: 'Batch completion notification email sent successfully'
      });

    } catch (error) {
      console.error('Batch email notification error:', error);
      responseUtils.error(res, 'Failed to send batch email notification', 500, error.message);
    }
  }

  // Send error notification
  async sendErrorNotification(req, res) {
    try {
      const { email, jobId, errorMessage, retryUrl } = req.body;

      if (!email || !jobId || !errorMessage) {
        return responseUtils.error(res, 'Email, job ID, and error message are required', 400);
      }

      await emailService.sendErrorNotificationEmail(email, {
        jobId,
        errorMessage,
        retryUrl
      });

      res.status(200).json({
        success: true,
        message: 'Error notification email sent successfully'
      });

    } catch (error) {
      console.error('Error notification email error:', error);
      responseUtils.error(res, 'Failed to send error notification email', 500, error.message);
    }
  }

  // Send welcome email
  async sendWelcomeEmail(req, res) {
    try {
      const { email, name } = req.body;

      if (!email || !name) {
        return responseUtils.error(res, 'Email and name are required', 400);
      }

      await emailService.sendWelcomeEmail(email, { name });

      res.status(200).json({
        success: true,
        message: 'Welcome email sent successfully'
      });

    } catch (error) {
      console.error('Welcome email error:', error);
      responseUtils.error(res, 'Failed to send welcome email', 500, error.message);
    }
  }

  // Send password reset email
  async sendPasswordResetEmail(req, res) {
    try {
      const { email, resetToken, resetUrl } = req.body;

      if (!email || !resetToken || !resetUrl) {
        return responseUtils.error(res, 'Email, reset token, and reset URL are required', 400);
      }

      await emailService.sendPasswordResetEmail(email, {
        resetToken,
        resetUrl
      });

      res.status(200).json({
        success: true,
        message: 'Password reset email sent successfully'
      });

    } catch (error) {
      console.error('Password reset email error:', error);
      responseUtils.error(res, 'Failed to send password reset email', 500, error.message);
    }
  }

  // Send account verification email
  async sendVerificationEmail(req, res) {
    try {
      const { email, verificationToken, verificationUrl } = req.body;

      if (!email || !verificationToken || !verificationUrl) {
        return responseUtils.error(res, 'Email, verification token, and verification URL are required', 400);
      }

      await emailService.sendVerificationEmail(email, {
        verificationToken,
        verificationUrl
      });

      res.status(200).json({
        success: true,
        message: 'Verification email sent successfully'
      });

    } catch (error) {
      console.error('Verification email error:', error);
      responseUtils.error(res, 'Failed to send verification email', 500, error.message);
    }
  }

  // Get email templates
  async getEmailTemplates(req, res) {
    try {
      const templates = await emailService.getEmailTemplates();

      res.status(200).json({
        success: true,
        templates
      });

    } catch (error) {
      responseUtils.error(res, 'Failed to fetch email templates', 500, error.message);
    }
  }

  // Update email template
  async updateEmailTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const { subject, body, variables } = req.body;

      await emailService.updateEmailTemplate(templateId, {
        subject,
        body,
        variables
      });

      res.status(200).json({
        success: true,
        message: 'Email template updated successfully'
      });

    } catch (error) {
      responseUtils.error(res, 'Failed to update email template', 500, error.message);
    }
  }

  // Test email template
  async testEmailTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const { testEmail, testData } = req.body;

      if (!testEmail) {
        return responseUtils.error(res, 'Test email is required', 400);
      }

      await emailService.testEmailTemplate(templateId, testEmail, testData);

      res.status(200).json({
        success: true,
        message: 'Test email sent successfully'
      });

    } catch (error) {
      responseUtils.error(res, 'Failed to send test email', 500, error.message);
    }
  }

  // Get email logs
  async getEmailLogs(req, res) {
    try {
      const { page = 1, limit = 20, status, email } = req.query;

      const logs = await emailService.getEmailLogs({
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        email
      });

      res.status(200).json({
        success: true,
        logs: logs.data,
        pagination: logs.pagination
      });

    } catch (error) {
      responseUtils.error(res, 'Failed to fetch email logs', 500, error.message);
    }
  }

  // Resend failed email
  async resendFailedEmail(req, res) {
    try {
      const { emailLogId } = req.params;

      await emailService.resendFailedEmail(emailLogId);

      res.status(200).json({
        success: true,
        message: 'Email resent successfully'
      });

    } catch (error) {
      responseUtils.error(res, 'Failed to resend email', 500, error.message);
    }
  }
}

module.exports = new EmailController();
