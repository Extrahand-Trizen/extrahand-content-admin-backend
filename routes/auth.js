const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { sendPasswordResetEmail, sendEmailVerification } = require('../utils/email');

const router = express.Router();
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);

// Helper function to validate strong password
const isStrongPassword = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  return password.length >= minLength && hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar;
};

// POST /auth/signup
router.post(
  '/signup',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email')
      .isEmail().withMessage('Valid email is required')
      .normalizeEmail()
      .custom((value) => {
        if (!value.endsWith('@gmail.com')) {
          throw new Error('Only Gmail addresses (@gmail.com) are allowed');
        }
        return true;
      }),
    body('password')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .custom((value) => {
        if (!isStrongPassword(value)) {
          throw new Error('Password must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character');
        }
        return true;
      }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;

    try {
      // Check if email already exists
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await User.create({
        name,
        email,
        passwordHash,
        role: 'user',
        status: 'APPROVED',
        emailVerified: false, // Email verification required
      });

      // Generate email verification token
      const verificationToken = user.createEmailVerificationToken();
      await user.save();

      // Send verification email
      const verificationURL = `${process.env.CLIENT_URL || 'http://localhost:3000'}/verify-email/${verificationToken}`;
      await sendEmailVerification(email, verificationURL, user.name);

      return res.status(201).json({
        message: 'Signup successful. Please check your email to verify your account.',
        userId: user._id,
      });
    } catch (err) {
      console.error('Signup error:', err);
      if (err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0];
        return res.status(409).json({ error: `${field} already exists` });
      }
      return res.status(500).json({ error: 'Failed to signup' });
    }
  }
);

// POST /auth/login
router.post(
  '/login',
  [
    body('email')
      .isEmail().withMessage('Valid email is required')
      .normalizeEmail()
      .custom((value) => {
        if (!value.endsWith('@gmail.com')) {
          throw new Error('Only Gmail addresses (@gmail.com) are allowed');
        }
        return true;
      }),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

    try {
      // Find user by email
      const user = await User.findOne({ email }).select('+passwordHash +loginAttempts +lockUntil');

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check if account is locked
      if (user.lockUntil && user.lockUntil > Date.now()) {
        const remainingTime = Math.ceil((user.lockUntil - Date.now()) / 60000);
        return res.status(429).json({ 
          error: `Too many login attempts. Account is locked. Try again after ${remainingTime} minutes.` 
        });
      }

      // Verify password
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        await user.incLoginAttempts();
        const attemptsLeft = 5 - (user.loginAttempts + 1);
        if (attemptsLeft <= 0) {
          return res.status(429).json({ 
            error: 'Too many failed login attempts. Account locked for 15 minutes.' 
          });
        }
        return res.status(401).json({ 
          error: `Invalid credentials. ${attemptsLeft} attempts remaining.` 
        });
      }

      // Check account status
      if (user.status !== 'APPROVED') {
        const statusMessages = {
          PENDING: 'Account under review',
          REJECTED: 'Signup request rejected',
          SUSPENDED: 'Account temporarily disabled',
        };
        return res.status(403).json({ error: statusMessages[user.status] || 'Access denied' });
      }

      // Check email verification (disabled for now - enable when email service is ready)
      // if (!user.emailVerified) {
      //   return res.status(403).json({ 
      //     error: 'Please verify your email before logging in',
      //     emailVerificationRequired: true
      //   });
      // }

      // Reset login attempts on successful login
      await user.resetLoginAttempts();

      // Generate tokens
      const accessToken = signAccessToken(user);
      const refreshToken = signRefreshToken(user);
      
      // Update last login info
      user.lastLoginAt = new Date();
      user.lastLoginIP = clientIP;
      await user.save();

      return res.status(200).json({
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          emailVerified: user.emailVerified,
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Failed to login' });
    }
  }
);

// POST /auth/forgot-password
router.post(
  '/forgot-password',
  [
    body('email')
      .isEmail().withMessage('Valid email is required')
      .normalizeEmail()
      .custom((value) => {
        if (!value.endsWith('@gmail.com')) {
          throw new Error('Only Gmail addresses (@gmail.com) are allowed');
        }
        return true;
      }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    try {
      const user = await User.findOne({ email });
      
      // Always return success message (security best practice)
      // Don't reveal if email exists or not
      if (!user) {
        return res.status(200).json({
          message: 'If your email is registered, you will receive a password reset link shortly.',
        });
      }

      // Generate password reset token
      const resetToken = user.createPasswordResetToken();
      await user.save({ validateBeforeSave: false });

      // Send password reset email
      const resetURL = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;
      try {
        await sendPasswordResetEmail(email, resetURL, user.name);
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError);
        // Even if email fails, we still return success for security reasons
        // But log the error for monitoring purposes
        // In production, you might want to use a monitoring service here
      }

      return res.status(200).json({
        message: 'If your email is registered, you will receive a password reset link shortly.',
      });
    } catch (err) {
      console.error('Forgot password error:', err);
      return res.status(500).json({ error: 'Failed to process request' });
    }
  }
);

// POST /auth/reset-password
router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('password')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .custom((value) => {
        if (!isStrongPassword(value)) {
          throw new Error('Password must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character');
        }
        return true;
      }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, password } = req.body;

    try {
      // Hash the token to compare with stored hashed token
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      // Find user with valid reset token
      const user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: Date.now() }
      }).select('+passwordHash +resetPasswordToken +resetPasswordExpires');

      if (!user) {
        return res.status(400).json({ 
          error: 'Password reset token is invalid or has expired' 
        });
      }

      // Update password
      user.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      await user.save();

      return res.status(200).json({
        message: 'Password has been reset successfully. You can now login with your new password.',
      });
    } catch (err) {
      console.error('Reset password error:', err);
      return res.status(500).json({ error: 'Failed to reset password' });
    }
  }
);

// POST /auth/verify-email
router.post(
  '/verify-email',
  [
    body('token').notEmpty().withMessage('Verification token is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token } = req.body;

    try {
      // Hash the token to compare with stored hashed token
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      // Find user with valid verification token
      const user = await User.findOne({
        emailVerificationToken: hashedToken,
        emailVerificationExpires: { $gt: Date.now() }
      }).select('+emailVerificationToken +emailVerificationExpires');

      if (!user) {
        return res.status(400).json({ 
          error: 'Email verification token is invalid or has expired' 
        });
      }

      // Verify email
      user.emailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      await user.save();

      return res.status(200).json({
        message: 'Email verified successfully. You can now login.',
      });
    } catch (err) {
      console.error('Verify email error:', err);
      return res.status(500).json({ error: 'Failed to verify email' });
    }
  }
);

// POST /auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const payload = verifyRefreshToken(refreshToken);
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    if (user.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Account not approved' });
    }

    const accessToken = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user);

    return res.status(200).json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Refresh token expired' : 'Invalid refresh token';
    return res.status(401).json({ error: message });
  }
});

module.exports = router;