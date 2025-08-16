const EmailService = require('../../services/emailService');

// Mock external dependencies
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn(),
    verify: jest.fn()
  }))
}));

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn()
}));

describe('Email Service', () => {
  let emailService;
  
  beforeEach(() => {
    emailService = new EmailService();
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('sendEmail', () => {
    it('should send email successfully using SMTP', async () => {
      const emailData = {
        to: 'recipient@example.com',
        subject: 'Test Email',
        text: 'This is a test email',
        html: '<p>This is a test email</p>'
      };
      
      const mockTransport = {
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'test-message-id',
          response: 'OK'
        }),
        verify: jest.fn().mockResolvedValue(true)
      };
      
      const nodemailer = require('nodemailer');
      nodemailer.createTransport.mockReturnValue(mockTransport);
      
      const result = await emailService.sendEmail(emailData);
      
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');
      expect(nodemailer.createTransport).toHaveBeenCalled();
      expect(mockTransport.sendMail).toHaveBeenCalledWith(emailData);
    });
    
    it('should send email successfully using SendGrid', async () => {
      // Configure to use SendGrid
      process.env.EMAIL_PROVIDER = 'sendgrid';
      process.env.SENDGRID_API_KEY = 'test-api-key';
      
      const emailData = {
        to: 'recipient@example.com',
        subject: 'Test Email',
        text: 'This is a test email',
        html: '<p>This is a test email</p>'
      };
      
      const mockSendGrid = require('@sendgrid/mail');
      mockSendGrid.send.mockResolvedValue([{
        statusCode: 202,
        headers: {},
        body: {}
      }]);
      
      const result = await emailService.sendEmail(emailData);
      
      expect(result.success).toBe(true);
      expect(mockSendGrid.setApiKey).toHaveBeenCalledWith('test-api-key');
      expect(mockSendGrid.send).toHaveBeenCalled();
      
      // Reset environment
      delete process.env.EMAIL_PROVIDER;
      delete process.env.SENDGRID_API_KEY;
    });
    
    it('should handle SMTP connection errors', async () => {
      const emailData = {
        to: 'recipient@example.com',
        subject: 'Test Email',
        text: 'This is a test email'
      };
      
      const mockTransport = {
        sendMail: jest.fn().mockRejectedValue(new Error('SMTP connection failed')),
        verify: jest.fn().mockRejectedValue(new Error('SMTP connection failed'))
      };
      
      const nodemailer = require('nodemailer');
      nodemailer.createTransport.mockReturnValue(mockTransport);
      
      await expect(emailService.sendEmail(emailData)).rejects.toThrow('SMTP connection failed');
    });
    
    it('should handle SendGrid API errors', async () => {
      process.env.EMAIL_PROVIDER = 'sendgrid';
      process.env.SENDGRID_API_KEY = 'test-api-key';
      
      const emailData = {
        to: 'recipient@example.com',
        subject: 'Test Email',
        text: 'This is a test email'
      };
      
      const mockSendGrid = require('@sendgrid/mail');
      mockSendGrid.send.mockRejectedValue(new Error('SendGrid API error'));
      
      await expect(emailService.sendEmail(emailData)).rejects.toThrow('SendGrid API error');
      
      delete process.env.EMAIL_PROVIDER;
      delete process.env.SENDGRID_API_KEY;
    });
    
    it('should validate email data before sending', async () => {
      const invalidEmailData = {
        subject: 'Test Email',
        text: 'This is a test email'
        // Missing 'to' field
      };
      
      await expect(emailService.sendEmail(invalidEmailData)).rejects.toThrow();
    });
  });
  
  describe('sendBulkEmail', () => {
    it('should send bulk emails successfully', async () => {
      const recipients = [
        'user1@example.com',
        'user2@example.com',
        'user3@example.com'
      ];
      
      const emailTemplate = {
        subject: 'Bulk Test Email',
        text: 'Hello {{name}}, this is a test email.',
        html: '<p>Hello {{name}}, this is a test email.</p>'
      };
      
      const mockTransport = {
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'test-message-id',
          response: 'OK'
        }),
        verify: jest.fn().mockResolvedValue(true)
      };
      
      const nodemailer = require('nodemailer');
      nodemailer.createTransport.mockReturnValue(mockTransport);
      
      const results = await emailService.sendBulkEmail(recipients, emailTemplate);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
      expect(mockTransport.sendMail).toHaveBeenCalledTimes(3);
    });
    
    it('should handle partial failures in bulk email sending', async () => {
      const recipients = [
        'user1@example.com',
        'user2@example.com',
        'user3@example.com'
      ];
      
      const emailTemplate = {
        subject: 'Bulk Test Email',
        text: 'Hello {{name}}, this is a test email.'
      };
      
      const mockTransport = {
        sendMail: jest.fn()
          .mockResolvedValueOnce({ messageId: 'msg1', response: 'OK' })
          .mockRejectedValueOnce(new Error('Email failed'))
          .mockResolvedValueOnce({ messageId: 'msg3', response: 'OK' }),
        verify: jest.fn().mockResolvedValue(true)
      };
      
      const nodemailer = require('nodemailer');
      nodemailer.createTransport.mockReturnValue(mockTransport);
      
      const results = await emailService.sendBulkEmail(recipients, emailTemplate);
      
      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });
    
    it('should handle empty recipients array', async () => {
      const recipients = [];
      const emailTemplate = {
        subject: 'Test Email',
        text: 'Test content'
      };
      
      const results = await emailService.sendBulkEmail(recipients, emailTemplate);
      
      expect(results).toEqual([]);
    });
  });
  
  describe('sendNotificationEmail', () => {
    it('should send notification email successfully', async () => {
      const notificationData = {
        type: 'document_completed',
        recipient: 'user@example.com',
        data: {
          documentName: 'Test Document',
          batchName: 'Test Batch',
          downloadUrl: 'https://example.com/download'
        }
      };
      
      const mockTransport = {
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'notification-msg-id',
          response: 'OK'
        }),
        verify: jest.fn().mockResolvedValue(true)
      };
      
      const nodemailer = require('nodemailer');
      nodemailer.createTransport.mockReturnValue(mockTransport);
      
      const result = await emailService.sendNotificationEmail(notificationData);
      
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('notification-msg-id');
      expect(mockTransport.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Document Completed')
        })
      );
    });
    
    it('should handle different notification types', async () => {
      const notificationTypes = [
        'document_completed',
        'batch_completed',
        'processing_failed',
        'system_maintenance'
      ];
      
      const mockTransport = {
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'test-msg-id',
          response: 'OK'
        }),
        verify: jest.fn().mockResolvedValue(true)
      };
      
      const nodemailer = require('nodemailer');
      nodemailer.createTransport.mockReturnValue(mockTransport);
      
      for (const type of notificationTypes) {
        const notificationData = {
          type,
          recipient: 'user@example.com',
          data: { test: 'data' }
        };
        
        const result = await emailService.sendNotificationEmail(notificationData);
        expect(result.success).toBe(true);
      }
    });
    
    it('should handle missing notification data', async () => {
      const invalidNotificationData = {
        type: 'document_completed'
        // Missing recipient and data
      };
      
      await expect(emailService.sendNotificationEmail(invalidNotificationData)).rejects.toThrow();
    });
  });
  
  describe('sendWelcomeEmail', () => {
    it('should send welcome email successfully', async () => {
      const userData = {
        email: 'newuser@example.com',
        name: 'John Doe',
        company: 'ACME Corp'
      };
      
      const mockTransport = {
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'welcome-msg-id',
          response: 'OK'
        }),
        verify: jest.fn().mockResolvedValue(true)
      };
      
      const nodemailer = require('nodemailer');
      nodemailer.createTransport.mockReturnValue(mockTransport);
      
      const result = await emailService.sendWelcomeEmail(userData);
      
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('welcome-msg-id');
      expect(mockTransport.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'newuser@example.com',
          subject: expect.stringContaining('Welcome')
        })
      );
    });
    
    it('should personalize welcome email content', async () => {
      const userData = {
        email: 'user@example.com',
        name: 'Jane Smith',
        company: 'Tech Inc'
      };
      
      const mockTransport = {
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'welcome-msg-id',
          response: 'OK'
        }),
        verify: jest.fn().mockResolvedValue(true)
      };
      
      const nodemailer = require('nodemailer');
      nodemailer.createTransport.mockReturnValue(mockTransport);
      
      await emailService.sendWelcomeEmail(userData);
      
      const sentEmail = mockTransport.sendMail.mock.calls[0][0];
      expect(sentEmail.html).toContain('Jane Smith');
      expect(sentEmail.html).toContain('Tech Inc');
    });
  });
  
  describe('sendPasswordResetEmail', () => {
    it('should send password reset email successfully', async () => {
      const resetData = {
        email: 'user@example.com',
        resetToken: 'reset-token-123',
        resetUrl: 'https://example.com/reset?token=reset-token-123'
      };
      
      const mockTransport = {
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'reset-msg-id',
          response: 'OK'
        }),
        verify: jest.fn().mockResolvedValue(true)
      };
      
      const nodemailer = require('nodemailer');
      nodemailer.createTransport.mockReturnValue(mockTransport);
      
      const result = await emailService.sendPasswordResetEmail(resetData);
      
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('reset-msg-id');
      expect(mockTransport.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Password Reset')
        })
      );
    });
    
    it('should include reset token in email content', async () => {
      const resetData = {
        email: 'user@example.com',
        resetToken: 'reset-token-123',
        resetUrl: 'https://example.com/reset?token=reset-token-123'
      };
      
      const mockTransport = {
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'reset-msg-id',
          response: 'OK'
        }),
        verify: jest.fn().mockResolvedValue(true)
      };
      
      const nodemailer = require('nodemailer');
      nodemailer.createTransport.mockReturnValue(mockTransport);
      
      await emailService.sendPasswordResetEmail(resetData);
      
      const sentEmail = mockTransport.sendMail.mock.calls[0][0];
      expect(sentEmail.html).toContain('reset-token-123');
      expect(sentEmail.html).toContain('https://example.com/reset?token=reset-token-123');
    });
  });
  
  describe('Email Templates', () => {
    it('should generate HTML email template correctly', () => {
      const templateData = {
        title: 'Test Email',
        content: 'This is test content',
        actionText: 'Click Here',
        actionUrl: 'https://example.com/action'
      };
      
      const html = emailService.generateHTMLTemplate(templateData);
      
      expect(html).toContain('Test Email');
      expect(html).toContain('This is test content');
      expect(html).toContain('Click Here');
      expect(html).toContain('https://example.com/action');
      expect(html).toContain('<html>');
      expect(html).toContain('</html>');
    });
    
    it('should generate text email template correctly', () => {
      const templateData = {
        title: 'Test Email',
        content: 'This is test content',
        actionText: 'Click Here',
        actionUrl: 'https://example.com/action'
      };
      
      const text = emailService.generateTextTemplate(templateData);
      
      expect(text).toContain('Test Email');
      expect(text).toContain('This is test content');
      expect(text).toContain('Click Here');
      expect(text).toContain('https://example.com/action');
      expect(text).not.toContain('<html>');
    });
  });
  
  describe('Email Validation', () => {
    it('should validate email addresses correctly', () => {
      const validEmails = [
        'user@example.com',
        'user.name@example.com',
        'user+tag@example.com',
        'user@subdomain.example.com'
      ];
      
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user@.com'
      ];
      
      validEmails.forEach(email => {
        expect(emailService.validateEmail(email)).toBe(true);
      });
      
      invalidEmails.forEach(email => {
        expect(emailService.validateEmail(email)).toBe(false);
      });
    });
    
    it('should validate email data structure', () => {
      const validEmailData = {
        to: 'user@example.com',
        subject: 'Test Subject',
        text: 'Test content'
      };
      
      const invalidEmailData = {
        subject: 'Test Subject'
        // Missing 'to' field
      };
      
      expect(emailService.validateEmailData(validEmailData)).toBe(true);
      expect(emailService.validateEmailData(invalidEmailData)).toBe(false);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle invalid email provider configuration', async () => {
      process.env.EMAIL_PROVIDER = 'invalid_provider';
      
      const emailData = {
        to: 'user@example.com',
        subject: 'Test Email',
        text: 'Test content'
      };
      
      await expect(emailService.sendEmail(emailData)).rejects.toThrow('Invalid email provider');
      
      delete process.env.EMAIL_PROVIDER;
    });
    
    it('should handle missing API keys', async () => {
      process.env.EMAIL_PROVIDER = 'sendgrid';
      // Missing SENDGRID_API_KEY
      
      const emailData = {
        to: 'user@example.com',
        subject: 'Test Email',
        text: 'Test content'
      };
      
      await expect(emailService.sendEmail(emailData)).rejects.toThrow('SendGrid API key is required');
      
      delete process.env.EMAIL_PROVIDER;
    });
    
    it('should handle email rate limiting', async () => {
      const emailData = {
        to: 'user@example.com',
        subject: 'Test Email',
        text: 'Test content'
      };
      
      const mockTransport = {
        sendMail: jest.fn().mockRejectedValue(new Error('Rate limit exceeded')),
        verify: jest.fn().mockResolvedValue(true)
      };
      
      const nodemailer = require('nodemailer');
      nodemailer.createTransport.mockReturnValue(mockTransport);
      
      await expect(emailService.sendEmail(emailData)).rejects.toThrow('Rate limit exceeded');
    });
  });
  
  describe('Performance Tests', () => {
    it('should send multiple emails efficiently', async () => {
      const recipients = Array.from({ length: 100 }, (_, i) => `user${i}@example.com`);
      const emailTemplate = {
        subject: 'Bulk Test Email',
        text: 'Test content'
      };
      
      const mockTransport = {
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'test-msg-id',
          response: 'OK'
        }),
        verify: jest.fn().mockResolvedValue(true)
      };
      
      const nodemailer = require('nodemailer');
      nodemailer.createTransport.mockReturnValue(mockTransport);
      
      const startTime = Date.now();
      const results = await emailService.sendBulkEmail(recipients, emailTemplate);
      const endTime = Date.now();
      
      expect(results).toHaveLength(100);
      results.forEach(result => expect(result.success).toBe(true));
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});
