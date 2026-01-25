const nodemailer = require('nodemailer');

/**
 * Create a transporter based on environment configuration
 */
const createTransporter = () => {
  const { EMAIL_SERVICE, EMAIL_USER, EMAIL_PASS, EMAIL_HOST, EMAIL_PORT, EMAIL_SECURE } = process.env;
  
  // For development, use console transport
  if (EMAIL_SERVICE === 'console') {
    return {
      sendMail: async (mailOptions) => {
        console.log('=== EMAIL SIMULATION ===');
        console.log('To:', mailOptions.to);
        console.log(mailOptions);
        return { messageId: 'simulated-email-id' };
      }
    };
  }
  
  // For Gmail
  if (EMAIL_SERVICE === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
      },
    });
  }
  
  // For other SMTP services
  if (EMAIL_HOST) {
    return nodemailer.createTransport({
      host: EMAIL_HOST,
      port: Number(EMAIL_PORT) || 587,
      secure: EMAIL_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
      },
    });
  }
  
  // Fallback to console if no valid configuration
  console.warn('No valid email configuration found. Using console transport.');
  return {
    sendMail: async (mailOptions) => {
      console.log('Email Fallback:',mailOptions);
      return { messageId: 'fallback' };
    }
  };
};

/**
 * Send password reset email
 * @param {string} email - Recipient email address
 * @param {string} resetURL - Password reset URL
 * @param {string} name - User's full name
 */
const sendPasswordResetEmail = async (email, resetURL, name = '') => {
  const transporter = createTransporter();
  
  const mailOptions = {
    from: `"Extrahand Support" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Password Reset Request - Extrahand',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 30px;">
          <img src="cid:logo" alt="Extrahand Logo" style="height: 40px; vertical-align: middle;">
          <span style="font-size: 20px; font-weight: bold; color: #333; vertical-align: middle; margin-left: 10px;">Extrahand</span>
        </div>
        <h2 style="color: #333; text-align: center;">Password Reset Request</h2>
        <p style="text-align: center;">Hello ${name},</p>
        <p style="text-align: center;">You have requested to reset your password for your Extrahand ContentAdmin account.</p>
        <p style="text-align: center;">Click the button below to reset your password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetURL}" 
             style="background-color: #f59e0b; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 6px; display: inline-block;
                    font-weight: bold;">
            Reset Your Password
          </a>
        </div>
        <p style="text-align: center;">If you didn't request this, please ignore this email.</p>
        <p style="text-align: center;">This link will expire in 15 minutes.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #666; text-align: center;">
          If the button above doesn't work, copy and paste this link into your browser:<br>
          <a href="${resetURL}" style="color: #4f46e5;">${resetURL}</a>
        </p>
      </div>
    `,
    attachments: [{
      filename: 'logo.png',
      path: __dirname + '/../../client/public/images/logo.png',
      cid: 'logo'
    }]
  };
  
  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(`Password reset email sent successfully to ${email}`);
    return result;
  } catch (error) {
    console.error(`Failed to send password reset email to ${email}:`, error);
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
};

/**
 * Send email verification email
 * @param {string} email - Recipient email address
 * @param {string} verificationURL - Email verification URL
 * @param {string} name - User's full name
 */
const sendEmailVerification = async (email, verificationURL, name = '') => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"Extrahand Support" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify Your Email - Extrahand',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 30px;">
          <img src="cid:logo" alt="Extrahand Logo" style="height: 40px; vertical-align: middle;">
          <span style="font-size: 20px; font-weight: bold; color: #333; vertical-align: middle; margin-left: 10px;">Extrahand</span>
        </div>
        <h2 style="color: #333; text-align: center;">Verify Your Email</h2>
        <p style="text-align: center;">Hello ${name},</p>
        <p style="text-align: center;">Thank you for signing up with Extrahand!</p>
        <p style="text-align: center;">Please verify your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationURL}" 
             style="background-color: #f59e0b; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 6px; display: inline-block;
                    font-weight: bold;">
            Verify Email
          </a>
        </div>
        <p style="text-align: center;">If you didn't create an account, please ignore this email.</p>
        <p style="text-align: center;">This link will expire in 24 hours.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #666; text-align: center;">
          If the button above doesn't work, copy and paste this link into your browser:<br>
          <a href="${verificationURL}" style="color: #10b981;">${verificationURL}</a>
        </p>
      </div>
    `,
    attachments: [{
      filename: 'logo.png',
      path: __dirname + '/../../client/public/images/logo.png',
      cid: 'logo'
    }]
  };
  
  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(`Email verification sent successfully to ${email}`);
    return result;
  } catch (error) {
    console.error(`Failed to send email verification to ${email}:`, error);
    throw new Error(`Failed to send email verification: ${error.message}`);
}}


module.exports = {
  sendPasswordResetEmail,
  sendEmailVerification
};