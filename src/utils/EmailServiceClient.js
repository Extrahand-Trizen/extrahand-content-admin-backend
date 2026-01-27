const axios = require('axios');

/**
 * EmailServiceClient - Client for communicating with the email service
 * Uses service-to-service authentication via X-Service-Auth header
 */
class EmailServiceClient {
  constructor() {
    this.baseUrl = process.env.EMAIL_SERVICE || 'http://localhost:4007';
    this.serviceAuthToken = process.env.SERVICE_AUTH_TOKEN || '';
    this.serviceName = 'content-admin-backend';
  }

  /**
   * Get base URL for email service
   * @returns {string}
   */
  getBaseUrl() {
    if (!this.baseUrl) {
      throw new Error('EMAIL_SERVICE environment variable is required. Please set it in your .env file.');
    }
    return this.baseUrl;
  }

  /**
   * Get axios instance with proper headers
   * @returns {import('axios').AxiosInstance}
   */
  getAxiosInstance() {
    return axios.create({
      baseURL: this.getBaseUrl(),
      headers: {
        'X-Service-Auth': this.serviceAuthToken,
        'X-Service-Name': this.serviceName,
        'Content-Type': 'application/json',
      },
      timeout: 5000, // 5 second timeout
    });
  }

  /**
   * Send password reset email
   * @param {string} email - Recipient email address
   * @param {string} resetLink - Password reset link
   * @param {string} name - User's name (optional)
   * @param {Date} expiresAt - Token expiration date (optional)
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
   */
  async sendPasswordResetEmail(email, resetLink, name, expiresAt) {
    try {
      if (!email || !resetLink) {
        throw new Error('Email and resetLink are required');
      }

      const response = await this.getAxiosInstance().post(
        '/api/v1/email/password-reset',
        {
          email,
          resetLink,
          name: name || email.split('@')[0],
          expiresAt: expiresAt ? expiresAt.toISOString() : undefined,
        }
      );

      if (response.data && response.data.success) {
        console.log('Password reset email queued for sending', {
          email,
          message: response.data.message,
          messageId: response.data.messageId,
        });
      }

      return {
        success: true,
        messageId: response.data?.messageId,
        message: response.data?.message || 'Email queued for sending',
      };
    } catch (error) {
      console.error('Email service error (password reset)', {
        email,
        error: error.message,
        response: error.response?.data,
      });

      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to queue email',
      };
    }
  }

  /**
   * Send suspension notification email
   * @param {string} email - Recipient email address
   * @param {string} name - User's name
   * @param {Date} suspendedUntil - Suspension expiration date
   * @param {string} reason - Suspension reason
   * @param {number} daysRemaining - Days until suspension expires
   * @param {string} contactInfo - Contact information for appeals (optional)
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
   */
  async sendSuspensionEmail(email, name, suspendedUntil, reason, daysRemaining, contactInfo) {
    try {
      if (!email || !name || !suspendedUntil || !reason) {
        throw new Error('Email, name, suspendedUntil, and reason are required');
      }

      const response = await this.getAxiosInstance().post(
        '/api/v1/email/suspension',
        {
          email,
          name,
          suspendedUntil: suspendedUntil.toISOString(),
          reason,
          daysRemaining: daysRemaining || Math.ceil((suspendedUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
          contactInfo: contactInfo || 'Please contact your manager or administrator for assistance.',
        }
      );

      if (response.data && response.data.success) {
        console.log('Suspension email queued for sending', {
          email,
          name,
          message: response.data.message,
          messageId: response.data.messageId,
        });
      }

      return {
        success: true,
        messageId: response.data?.messageId,
        message: response.data?.message || 'Email queued for sending',
      };
    } catch (error) {
      console.error('Email service error (suspension)', {
        email,
        name,
        error: error.message,
        response: error.response?.data,
      });

      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to queue email',
      };
    }
  }

  /**
   * Send ban notification email
   * @param {string} email - Recipient email address
   * @param {string} name - User's name
   * @param {string} reason - Ban reason
   * @param {string} contactInfo - Contact information for appeals (optional)
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
   */
  async sendBanEmail(email, name, reason, contactInfo) {
    try {
      if (!email || !name || !reason) {
        throw new Error('Email, name, and reason are required');
      }

      const response = await this.getAxiosInstance().post(
        '/api/v1/email/ban',
        {
          email,
          name,
          reason,
          contactInfo: contactInfo || 'Please contact your manager or administrator for assistance.',
        }
      );

      if (response.data && response.data.success) {
        console.log('Ban email queued for sending', {
          email,
          name,
          message: response.data.message,
          messageId: response.data.messageId,
        });
      }

      return {
        success: true,
        messageId: response.data?.messageId,
        message: response.data?.message || 'Email queued for sending',
      };
    } catch (error) {
      console.error('Email service error (ban)', {
        email,
        name,
        error: error.message,
        response: error.response?.data,
      });

      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to queue email',
      };
    }
  }
}

// Export singleton instance
module.exports = new EmailServiceClient();
