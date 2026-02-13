const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt'); // Added bcrypt
const crypto = require('crypto');
const Article = require('../models/Article');
const TaskCategory = require('../models/TaskCategory');
const TaskSubcategory = require('../models/TaskSubcategory');
const User = require('../models/User');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/roles');
const EmailServiceClient = require('../utils/EmailServiceClient');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;

const inferCategoryTypeFromName = (name = '') => {
  const lowerName = (name || '').toLowerCase();
  
  // Explicitly check for Poster keywords
  if (/\bservices\b.*\bservices\b|poster|faq|blog|guide|content/i.test(lowerName)) {
    return 'As A Poster';
  }
  
  // Check for Tasker keywords: Services (singular), Tasks, skill-related
  if (/\bservices?\b|\btasks?\b|repair|installation|cleaner|painter|electrician|plumber|handyman|carpenter|gardener|tutor|coach|trainer|designer|developer|writer/i.test(lowerName)) {
    return 'As A Tasker';
  }
  
  // Default fallback
  return 'As A Poster';
};

// ============================================
// Reviewer ROUTES - Article Approval System
// ============================================

// GET - Get all articles pending approval (Reviewer and Writer and content_access_manager)
router.get('/articles/pending', authenticate, allowRoles('reviewer', 'writer', 'content_access_manager'), async (req, res) => {
  try {
    const { page, limit } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    let filter = {};

    // Writers only see their own pending articles and drafts
    if (req.user.role === 'writer') {
      filter.createdBy = req.user._id;
      filter.status = { $in: ['DRAFT', 'PENDING_APPROVAL'] };
    } else if (req.user.role === 'reviewer' || req.user.role === 'content_access_manager') {
      filter.status = 'PENDING_APPROVAL';
    }

    const articleListFields = 'title description category subcategory subSubcategory status isPublished author createdBy reviewedBy reviewedAt publishedBy createdAt updatedAt';
    const [articles, total] = await Promise.all([
      Article.find(filter)
        .select(articleListFields)
        .populate('createdBy', 'name email role')
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .skip(skip)
        .lean(),
      Article.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: articles,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('Error fetching pending articles:', error);
    return res.status(500).json({ error: 'Failed to fetch pending articles' });
  }
});

// GET - Get all articles with any status (Reviewer and content_access_manager only)
// Writers should use /api/articles/my-articles instead
router.get('/articles/all', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { status, limit, page } = req.query;
    let filter = {};

    // Reviewers and content_access_managers see all articles (no filter by createdBy)
    // Reviewers must not see drafts (only submitted and beyond); content_access_manager sees all for transparency
    if (status) {
      filter.status = status;
    } else if (req.user.role === 'reviewer') {
      filter.status = { $in: ['PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REJECTED'] };
    }

    // Pagination support - default to 50 items per page
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const skip = (pageNum - 1) * limitNum;

    const articleListFields = 'title description category subcategory subSubcategory status isPublished author createdBy reviewedBy reviewedAt publishedBy publishedAt createdAt updatedAt';
    const [articles, total] = await Promise.all([
      Article.find(filter)
        .select(articleListFields)
        .populate('createdBy', 'name email role')
        .populate('reviewedBy', 'name email')
        .populate('publishedBy', 'name email')
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .skip(skip)
        .lean(),
      Article.countDocuments(filter)
    ]);

    return res.status(200).json({
      data: articles,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching all articles:', error);
    return res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// POST - Approve article (Reviewer and content_access_manager only)
router.post('/articles/:id/approve', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewNotes } = req.body;

    const article = await Article.findById(id);

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Allow approval of DRAFT and PENDING_APPROVAL articles
    if (article.status !== 'PENDING_APPROVAL' && article.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Article cannot be approved. Current status: ' + article.status });
    }

    article.status = 'APPROVED';
    article.reviewedBy = req.user._id;
    article.reviewedAt = new Date();
    article.reviewNotes = reviewNotes || '';

    await article.save();

    return res.status(200).json({
      message: 'Article approved successfully',
      article,
    });
  } catch (error) {
    console.error('Error approving article:', error);
    return res.status(500).json({ error: 'Failed to approve article' });
  }
});

// POST - Reject article (Reviewer and content_access_manager only)
router.post('/articles/:id/reject', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewNotes } = req.body;

    const article = await Article.findById(id);

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Allow rejection of DRAFT and PENDING_APPROVAL articles
    if (article.status !== 'PENDING_APPROVAL' && article.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Article cannot be rejected. Current status: ' + article.status });
    }

    article.status = 'REJECTED';
    article.reviewedBy = req.user._id;
    article.reviewedAt = new Date();
    article.reviewNotes = reviewNotes || '';

    await article.save();

    return res.status(200).json({
      message: 'Article rejected',
      article,
    });
  } catch (error) {
    console.error('Error rejecting article:', error);
    return res.status(500).json({ error: 'Failed to reject article' });
  }
});

// POST - Publish approved article (content_access_manager and Reviewer only)
router.post('/articles/:id/publish', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;

    const article = await Article.findById(id);

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    if (article.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Article must be approved before publishing' });
    }

    // If this is a new version (has originalArticleId), replace the old published version
    if (article.originalArticleId) {
      const originalArticle = await Article.findById(article.originalArticleId);

      if (originalArticle && originalArticle.status === 'PUBLISHED') {
        // Mark old version as not current and unpublish it
        originalArticle.isCurrentVersion = false;
        originalArticle.isPublished = false;
        originalArticle.status = 'DRAFT'; // Archive the old version
        await originalArticle.save();
      }
    }

    // Publish the new version
    article.status = 'PUBLISHED';
    article.isPublished = true;
    article.isCurrentVersion = true;
    article.publishedBy = req.user._id;
    article.publishedAt = new Date();

    await article.save();

    return res.status(200).json({
      message: 'Article published successfully',
      article,
    });
  } catch (error) {
    console.error('Error publishing article:', error);
    return res.status(500).json({ error: 'Failed to publish article' });
  }
});

// POST - Unpublish article (Reviewer and content_access_manager only)
router.post('/articles/:id/unpublish', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;

    const article = await Article.findById(id);

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    article.isPublished = false;
    article.status = 'APPROVED'; // Keep as approved but unpublished

    await article.save();

    return res.status(200).json({
      message: 'Article unpublished successfully',
      article,
    });
  } catch (error) {
    console.error('Error unpublishing article:', error);
    return res.status(500).json({ error: 'Failed to unpublish article' });
  }
});

// ============================================
// USER MANAGEMENT (content_access_manager only)
// ============================================

// GET - Get all users
router.get('/users', authenticate, allowRoles('content_access_manager'), async (req, res) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    // Get total count
    const total = await User.countDocuments({});

    // Get paginated users
    const users = await User.find({})
      .select('-passwordHash -resetPasswordToken -resetPasswordExpires -emailVerificationToken -emailVerificationExpires -loginAttempts -lockUntil')
      .populate({
        path: 'suspendedBy',
        select: 'name email',
        options: { strictPopulate: false }
      })
      .populate({
        path: 'bannedBy',
        select: 'name email',
        options: { strictPopulate: false }
      })
      .populate({
        path: 'approvedBy',
        select: 'name email',
        options: { strictPopulate: false }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      data: users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
});

// PUT - Update user role (content_access_manager only)
router.put('/users/:id/role', authenticate, allowRoles('content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;
    let { role } = req.body;

    // Normalize role to lowercase for consistency
    role = role.toLowerCase();

    if (!['writer', 'reviewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.role = role;
    await user.save();

    return res.status(200).json({
      message: 'User role updated successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    return res.status(500).json({ error: 'Failed to update user role' });
  }
});

// PUT - Update user status (content_access_manager only)
router.put('/users/:id/status', authenticate, allowRoles('content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.status = status;
    if (status === 'APPROVED') {
      user.approvedAt = new Date();
      user.approvedBy = req.user._id;
    }
    await user.save();

    return res.status(200).json({
      message: 'User status updated successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        status: user.status,
      },
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    return res.status(500).json({ error: 'Failed to update user status' });
  }
});

// DELETE - Delete user (content_access_manager only)
router.delete('/users/:id', authenticate, allowRoles('content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting self
    if (id === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

// POST - Create user (content_access_manager only)
router.post('/users', authenticate, allowRoles('content_access_manager'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Basic validation
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Email domain validation
    const normalizedEmail = (email || "").toLowerCase().trim();
    const allowedDomains = ["@gmail.com", "@extrahand.in", "@cognitbotz.com", "@trizenventures.com"];
    if (!allowedDomains.some(domain => normalizedEmail.endsWith(domain))) {
      return res.status(400).json({ 
        error: "Only Gmail (@gmail.com), @extrahand.in, @cognitbotz.com, or @trizenventures.com addresses are allowed" 
      });
    }

    if (!['writer', 'reviewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const newUser = new User({
      name,
      email,
      passwordHash,
      role,
      isVerified: true, // Admin created users are verified
      status: 'APPROVED'
    });

    await newUser.save();

    return res.status(201).json({
      message: 'User created successfully',
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

// POST - Reset user password (content_access_manager only)
router.post('/users/:id/reset-password', authenticate, allowRoles('content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent resetting own password through this route
    if (id === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot reset your own password through this route. Use the forgot password feature instead.' });
    }

    // Generate password reset token (24-hour expiry)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Save token to user
    user.resetPasswordToken = hashedResetToken;
    user.resetPasswordExpires = resetExpires;
    await user.save();

    // Construct reset link
    const resetLink = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    // Send password reset email (fire-and-forget)
    EmailServiceClient.sendPasswordResetEmail(
      user.email,
      resetLink,
      user.name,
      resetExpires,
      'Content Admin Portal'
    ).catch((error) => {
      console.error('Failed to send password reset email:', error);
    });

    return res.status(200).json({
      success: true,
      message: 'Password reset email sent successfully',
      data: {
        emailSent: true,
        email: user.email,
        resetLink: resetLink, // Include as fallback
        expiresAt: resetExpires.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

// POST - Suspend user (content_access_manager only)
router.post('/users/:id/suspend', authenticate, allowRoles('content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, durationDays } = req.body;

    // Default to 2.5 days (60 hours) if not specified, allow 2-3 days
    const days = durationDays ? Math.max(2, Math.min(3, durationDays)) : 2.5;
    const suspensionDuration = days * 24 * 60 * 60 * 1000; // Convert to milliseconds
    const suspendedUntil = new Date(Date.now() + suspensionDuration);

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent suspending self
    if (id === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot suspend your own account' });
    }

    // Prevent suspending content_access_manager
    if (user.role === 'content_access_manager') {
      return res.status(400).json({ error: 'Cannot suspend a content access manager' });
    }

    user.status = 'SUSPENDED';
    user.suspendedUntil = suspendedUntil;
    user.suspendedBy = req.user._id;
    user.suspendedReason = reason || 'No reason provided';
    await user.save();

    // Send suspension email (fire-and-forget)
    const daysRemaining = Math.ceil((suspendedUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    EmailServiceClient.sendSuspensionEmail(
      user.email,
      user.name,
      suspendedUntil,
      reason || 'No reason provided',
      daysRemaining,
      'Please contact your manager or administrator for assistance.',
      'Content Admin Portal'
    ).catch((error) => {
      console.error('Failed to send suspension email:', error);
    });

    return res.status(200).json({
      message: `User suspended for ${days} days`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        status: user.status,
        suspendedUntil: user.suspendedUntil,
        suspendedReason: user.suspendedReason,
      },
    });
  } catch (error) {
    console.error('Error suspending user:', error);
    return res.status(500).json({ error: 'Failed to suspend user' });
  }
});

// POST - Unsuspend user (content_access_manager only)
router.post('/users/:id/unsuspend', authenticate, allowRoles('content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.status !== 'SUSPENDED') {
      return res.status(400).json({ error: 'User is not suspended' });
    }

    // Restore to APPROVED status
    user.status = 'APPROVED';
    user.suspendedUntil = null;
    user.suspendedBy = null;
    user.suspendedReason = null;
    await user.save();

    return res.status(200).json({
      message: 'User unsuspended successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        status: user.status,
      },
    });
  } catch (error) {
    console.error('Error unsuspending user:', error);
    return res.status(500).json({ error: 'Failed to unsuspend user' });
  }
});

// POST - Ban user (content_access_manager only)
router.post('/users/:id/ban', authenticate, allowRoles('content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent banning self
    if (id === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot ban your own account' });
    }

    // Prevent banning content_access_manager
    if (user.role === 'content_access_manager') {
      return res.status(400).json({ error: 'Cannot ban a content access manager' });
    }

    user.banned = true;
    user.bannedAt = new Date();
    user.bannedBy = req.user._id;
    user.bannedReason = reason || 'No reason provided';
    user.status = 'REJECTED'; // Set status to REJECTED for banned users
    await user.save();

    // Send ban email (fire-and-forget)
    EmailServiceClient.sendBanEmail(
      user.email,
      user.name,
      reason || 'No reason provided',
      'If you believe this ban was issued in error, you may contact your manager or administrator to discuss the matter.',
      'Content Admin Portal'
    ).catch((error) => {
      console.error('Failed to send ban email:', error);
    });

    return res.status(200).json({
      message: 'User banned successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        banned: user.banned,
        bannedAt: user.bannedAt,
        bannedReason: user.bannedReason,
        status: user.status,
      },
    });
  } catch (error) {
    console.error('Error banning user:', error);
    return res.status(500).json({ error: 'Failed to ban user' });
  }
});

// POST - Unban user (content_access_manager only)
router.post('/users/:id/unban', authenticate, allowRoles('content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.banned) {
      return res.status(400).json({ error: 'User is not banned' });
    }

    // Restore to APPROVED status
    user.banned = false;
    user.bannedAt = null;
    user.bannedBy = null;
    user.bannedReason = null;
    user.status = 'APPROVED';
    await user.save();

    return res.status(200).json({
      message: 'User unbanned successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        banned: user.banned,
        status: user.status,
      },
    });
  } catch (error) {
    console.error('Error unbanning user:', error);
    return res.status(500).json({ error: 'Failed to unban user' });
  }
});

// ============================================
// DASHBOARD STATISTICS
// ============================================

// GET - Dashboard statistics (Content Access Manager and Reviewer and Writer)
router.get('/dashboard/stats', authenticate, allowRoles('reviewer', 'writer', 'content_access_manager'), async (req, res) => {
  try {
    let articleFilter = {};
    let categoryFilter = {};

    // Writers only see their own content stats
    if (req.user.role === 'writer') {
      articleFilter.createdBy = req.user._id;
      categoryFilter.createdBy = req.user._id;
    }
    // Reviewers see all content stats 

    const [
      totalArticles,
      pendingArticles,
      approvedArticles,
      publishedArticles,
      rejectedArticles,
      totalUsers,
      ReviewerUsers,
      writerUsers,
      totalCategories,
      pendingCategories,
      approvedCategories,
      publishedCategories,
      rejectedCategories,
      totalSubcategories,
      pendingSubcategories,
      approvedSubcategories,
      publishedSubcategories,
      rejectedSubcategories,
    ] = await Promise.all([
      Article.countDocuments(articleFilter),
      Article.countDocuments({ ...articleFilter, status: 'PENDING_APPROVAL' }),
      Article.countDocuments({ ...articleFilter, status: 'APPROVED' }),
      Article.countDocuments({ ...articleFilter, status: 'PUBLISHED' }),
      Article.countDocuments({ ...articleFilter, status: 'REJECTED' }),
      (req.user.role === 'reviewer' || req.user.role === 'content_access_manager') ? User.countDocuments() : 0,
      (req.user.role === 'reviewer' || req.user.role === 'content_access_manager') ? User.countDocuments({ role: 'reviewer' }) : 0,
      (req.user.role === 'reviewer' || req.user.role === 'content_access_manager') ? User.countDocuments({ role: 'writer' }) : 0,
      TaskCategory.countDocuments(categoryFilter),
      TaskCategory.countDocuments({ ...categoryFilter, status: 'PENDING_APPROVAL' }),
      TaskCategory.countDocuments({ ...categoryFilter, status: 'APPROVED' }),
      TaskCategory.countDocuments({ ...categoryFilter, status: 'PUBLISHED' }),
      TaskCategory.countDocuments({ ...categoryFilter, status: 'REJECTED' }),
      TaskSubcategory.countDocuments(categoryFilter), // Reuse categoryFilter as it's the same logic
      TaskSubcategory.countDocuments({ ...categoryFilter, status: 'PENDING_APPROVAL' }),
      TaskSubcategory.countDocuments({ ...categoryFilter, status: 'APPROVED' }),
      TaskSubcategory.countDocuments({ ...categoryFilter, status: 'PUBLISHED' }),
      TaskSubcategory.countDocuments({ ...categoryFilter, status: 'REJECTED' }),
    ]);

    return res.status(200).json({
      articles: {
        total: totalArticles,
        pending: pendingArticles,
        approved: approvedArticles,
        published: publishedArticles,
        rejected: rejectedArticles,
      },
      categories: {
        total: totalCategories,
        pending: pendingCategories,
        approved: approvedCategories,
        published: publishedCategories,
        rejected: rejectedCategories,
      },
      subcategories: {
        total: totalSubcategories,
        pending: pendingSubcategories,
        approved: approvedSubcategories,
        published: publishedSubcategories,
        rejected: rejectedSubcategories,
      },
      users: {
        total: totalUsers,
        Reviewers: ReviewerUsers,
        writers: writerUsers,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// GET - Recent activity (Reviewer and content_access_manager)
router.get('/dashboard/activity', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const recentArticles = await Article.find()
      .populate('createdBy', 'name email')
      .populate('reviewedBy', 'name email')
      .sort({ updatedAt: -1 })
      .limit(10);

    const recentUsers = await User.find()
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .limit(10);

    return res.status(200).json({
      recentArticles,
      recentUsers,
    });
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    return res.status(500).json({ error: 'Failed to fetch recent activity' });
  }
});

// GET - Content analytics (articles, categories, subcategories by writer and reviewer) - content_access_manager only
// Handler is also exported for explicit registration in server.ts to avoid 404
async function analyticsHandler(req, res) {
  try {
    const statusGroup = (collectionId) => ({
      _id: collectionId,
      total: { $sum: 1 },
      draft: { $sum: { $cond: [{ $eq: ['$status', 'DRAFT'] }, 1, 0] } },
      pendingApproval: { $sum: { $cond: [{ $eq: ['$status', 'PENDING_APPROVAL'] }, 1, 0] } },
      approved: { $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0] } },
      rejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
      published: { $sum: { $cond: [{ $eq: ['$status', 'PUBLISHED'] }, 1, 0] } },
    });
    const writerProject = {
      userId: '$_id',
      name: '$user.name',
      email: '$user.email',
      total: 1,
      draft: 1,
      pendingApproval: 1,
      approved: 1,
      rejected: 1,
      published: 1,
      _id: 0,
    };
    const reviewerGroup = (idField) => ({
      _id: `$${idField}`,
      totalReviewed: { $sum: 1 },
      totalApproved: { $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0] } },
      totalRejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
    });
    const reviewerProject = {
      userId: '$_id',
      name: '$user.name',
      email: '$user.email',
      totalReviewed: 1,
      totalApproved: 1,
      totalRejected: 1,
      _id: 0,
    };

    // Articles by writer
    const articlesByWriterAgg = await Article.aggregate([
      { $match: { createdBy: { $exists: true, $ne: null } } },
      { $group: { _id: '$createdBy', ...statusGroup('$createdBy'), totalArticles: { $sum: 1 } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { ...writerProject, totalArticles: '$totalArticles' } },
      { $sort: { totalArticles: -1 } },
    ]);

    // Articles by reviewer
    const articlesByReviewerAgg = await Article.aggregate([
      { $match: { reviewedBy: { $exists: true, $ne: null } } },
      { $group: {
        _id: '$reviewedBy',
        totalReviewed: { $sum: 1 },
        totalApproved: { $sum: { $cond: [{ $in: ['$status', ['APPROVED', 'PUBLISHED']] }, 1, 0] } },
        totalRejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
      } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: reviewerProject },
      { $sort: { totalReviewed: -1 } },
    ]);

    // Categories by writer
    const categoriesByWriterAgg = await TaskCategory.aggregate([
      { $match: { createdBy: { $exists: true, $ne: null } } },
      { $group: { _id: '$createdBy', ...statusGroup('$createdBy'), totalCategories: { $sum: 1 } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { ...writerProject, totalCategories: '$totalCategories' } },
      { $sort: { totalCategories: -1 } },
    ]);

    // Categories by reviewer
    const categoriesByReviewerAgg = await TaskCategory.aggregate([
      { $match: { reviewedBy: { $exists: true, $ne: null } } },
      { $group: {
        _id: '$reviewedBy',
        totalReviewed: { $sum: 1 },
        totalApproved: { $sum: { $cond: [{ $in: ['$status', ['APPROVED', 'PUBLISHED']] }, 1, 0] } },
        totalRejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
      } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: reviewerProject },
      { $sort: { totalReviewed: -1 } },
    ]);

    // Subcategories by writer
    const subcategoriesByWriterAgg = await TaskSubcategory.aggregate([
      { $match: { 
        createdBy: { $exists: true, $ne: null },
        categorySlug: { $exists: true, $ne: null, $ne: '' }
      } },
      { $group: { _id: '$createdBy', ...statusGroup('$createdBy'), totalSubcategories: { $sum: 1 } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { ...writerProject, totalSubcategories: '$totalSubcategories' } },
      { $sort: { totalSubcategories: -1 } },
    ]);

    // Subcategories by reviewer
    const subcategoriesByReviewerAgg = await TaskSubcategory.aggregate([
      { $match: { 
        reviewedBy: { $exists: true, $ne: null },
        categorySlug: { $exists: true, $ne: null, $ne: '' }
      } },
      { $group: {
        _id: '$reviewedBy',
        totalReviewed: { $sum: 1 },
        totalApproved: { $sum: { $cond: [{ $in: ['$status', ['APPROVED', 'PUBLISHED']] }, 1, 0] } },
        totalRejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
      } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: reviewerProject },
      { $sort: { totalReviewed: -1 } },
    ]);

    // Status distributions
    const [articleStatusDistribution, categoryStatusDistribution, subcategoryStatusDistribution] = await Promise.all([
      Article.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { status: '$_id', count: 1, _id: 0 } },
      ]),
      TaskCategory.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { status: '$_id', count: 1, _id: 0 } },
      ]),
      TaskSubcategory.aggregate([
        { $match: { categorySlug: { $exists: true, $ne: null, $ne: '' } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { status: '$_id', count: 1, _id: 0 } },
      ]),
    ]);

    const [
      totalArticles,
      totalWithWriter,
      totalReviewed,
      totalWriters,
      totalReviewers,
      totalCategories,
      totalSubcategories,
      totalCategoriesReviewed,
      totalSubcategoriesReviewed,
    ] = await Promise.all([
      Article.countDocuments(),
      Article.countDocuments({ createdBy: { $exists: true, $ne: null } }),
      Article.countDocuments({ reviewedBy: { $exists: true, $ne: null } }),
      User.countDocuments({ role: 'writer' }),
      User.countDocuments({ role: 'reviewer' }),
      TaskCategory.countDocuments(),
      TaskSubcategory.countDocuments({ categorySlug: { $exists: true, $ne: null, $ne: '' } }),
      TaskCategory.countDocuments({ reviewedBy: { $exists: true, $ne: null } }),
      TaskSubcategory.countDocuments({ reviewedBy: { $exists: true, $ne: null }, categorySlug: { $exists: true, $ne: null, $ne: '' } }),
    ]);

    const mapWriter = (r, totalKey = 'totalArticles') => ({
      userId: r.userId?.toString(),
      name: r.name || 'Unknown',
      email: r.email || '',
      total: r[totalKey] ?? r.total ?? 0,
      draft: r.draft ?? 0,
      pendingApproval: r.pendingApproval ?? 0,
      approved: r.approved ?? 0,
      rejected: r.rejected ?? 0,
      published: r.published ?? 0,
    });
    const mapReviewer = (r) => ({
      userId: r.userId?.toString(),
      name: r.name || 'Unknown',
      email: r.email || '',
      totalReviewed: r.totalReviewed,
      totalApproved: r.totalApproved ?? 0,
      totalRejected: r.totalRejected ?? 0,
    });

    return res.status(200).json({
      articlesByWriter: articlesByWriterAgg.map((r) => ({
        ...mapWriter(r, 'totalArticles'),
        totalArticles: r.totalArticles ?? r.total,
      })),
      articlesByReviewer: articlesByReviewerAgg.map(mapReviewer),
      categoriesByWriter: categoriesByWriterAgg.map((r) => ({
        ...mapWriter(r, 'totalCategories'),
        totalCategories: r.totalCategories ?? r.total,
      })),
      categoriesByReviewer: categoriesByReviewerAgg.map(mapReviewer),
      subcategoriesByWriter: subcategoriesByWriterAgg.map((r) => ({
        ...mapWriter(r, 'totalSubcategories'),
        totalSubcategories: r.totalSubcategories ?? r.total,
      })),
      subcategoriesByReviewer: subcategoriesByReviewerAgg.map(mapReviewer),
      summaryMetrics: {
        totalArticles,
        totalWithWriter,
        totalReviewed,
        totalWriters,
        totalReviewers,
        totalCategories,
        totalSubcategories,
        totalCategoriesReviewed,
        totalSubcategoriesReviewed,
      },
      statusDistribution: articleStatusDistribution,
      categoryStatusDistribution,
      subcategoryStatusDistribution,
    });
  } catch (error) {
    console.error('Error fetching content analytics:', error);
    return res.status(500).json({ error: 'Failed to fetch analytics' });
  }
}
router.get('/analytics', authenticate, allowRoles('content_access_manager'), analyticsHandler);

// ============================================
// CATEGORY APPROVAL SYSTEM (Reviewer only)
// ============================================

// GET - Get all pending categories
router.get('/categories/pending', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { page, limit } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter = { status: 'PENDING_APPROVAL' };
    const categoryListFields = 'name slug status isPublished createdBy createdAt updatedAt submissionNotes originalCategoryId';
    const [categories, total] = await Promise.all([
      TaskCategory.find(filter)
        .select(categoryListFields)
        .populate('createdBy', 'name email role')
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .skip(skip)
        .lean(),
      TaskCategory.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: categories,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('Error fetching pending categories:', error);
    return res.status(500).json({ error: 'Failed to fetch pending categories' });
  }
});

// GET - Get all categories
router.get('/categories/all', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { status, limit, page } = req.query;
    const filter = {};

    if (status) {
      filter.status = status;
    } else if (req.user.role === 'reviewer') {
      filter.status = { $in: ['PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REJECTED'] };
    }

    // Pagination support - default to 50 items per page
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const skip = (pageNum - 1) * limitNum;

    const categoryListFields = 'name slug status isPublished categoryType originalCategoryId createdBy reviewedBy reviewedAt publishedBy createdAt updatedAt';
    const [categories, total] = await Promise.all([
      TaskCategory.find(filter)
        .select(categoryListFields)
        .populate('createdBy', 'name email role')
        .populate('reviewedBy', 'name email')
        .populate('publishedBy', 'name email')
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .skip(skip)
        .lean(),
      TaskCategory.countDocuments(filter)
    ]);

    const categoriesWithType = categories.map((item) => ({
      ...item,
      categoryType: item.categoryType || inferCategoryTypeFromName(item.name),
    }));

    return res.status(200).json({
      data: categoriesWithType,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST - Approve category
router.post('/categories/:id/approve', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewNotes } = req.body;

    const category = await TaskCategory.findById(id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Allow approval of DRAFT and PENDING_APPROVAL categories
    if (category.status !== 'PENDING_APPROVAL' && category.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Category cannot be approved. Current status: ' + category.status });
    }

    await TaskCategory.updateMany(
      { slug: category.slug, _id: { $ne: category._id }, status: 'PUBLISHED' },
      { $set: { isPublished: false, status: 'DRAFT', isCurrentVersion: false } },
    );

    category.status = 'APPROVED';
    category.isPublished = false;
    category.isCurrentVersion = true;

    category.reviewedBy = req.user._id;
    category.reviewedAt = new Date();
    category.reviewNotes = reviewNotes || '';

    await category.save();

    return res.status(200).json({
      message: 'Category approved successfully.',
      category,
    });
  } catch (error) {
    console.error('Error approving category:', error);
    return res.status(500).json({ error: 'Failed to approve category' });
  }
});
// POST - Reject category
router.post('/categories/:id/reject', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewNotes } = req.body;

    const category = await TaskCategory.findById(id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Allow rejection of DRAFT and PENDING_APPROVAL categories
    if (category.status !== 'PENDING_APPROVAL' && category.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Category cannot be rejected. Current status: ' + category.status });
    }

    category.status = 'REJECTED';
    category.reviewedBy = req.user._id;
    category.reviewedAt = new Date();
    category.reviewNotes = reviewNotes || '';

    await category.save();

    return res.status(200).json({
      message: 'Category rejected',
      category,
    });
  } catch (error) {
    console.error('Error rejecting category:', error);
    return res.status(500).json({ error: 'Failed to reject category' });
  }
});

// POST - Publish category
router.post('/categories/:id/publish', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;

    const category = await TaskCategory.findById(id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    if (category.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Category must be approved before publishing' });
    }

    // Unified Cross-Collection Deduplication
    await Promise.all([
      TaskCategory.deleteMany({
        slug: category.slug,
        _id: { $ne: category._id }
      }),
      TaskSubcategory.deleteMany({ slug: category.slug })
    ]);
    category.originalCategoryId = null;

    // Publish the new version
    category.status = 'PUBLISHED';
    category.isPublished = true;
    category.isCurrentVersion = true;
    category.publishedBy = req.user._id;
    category.publishedAt = new Date();

    await category.save();

    return res.status(200).json({
      message: 'Category published successfully',
      category,
    });
  } catch (error) {
    console.error('Error publishing category:', error);
    return res.status(500).json({ error: 'Failed to publish category' });
  }
});

// POST - Unpublish category
router.post('/categories/:id/unpublish', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;

    const category = await TaskCategory.findById(id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    category.isPublished = false;
    category.status = 'APPROVED';

    await category.save();

    return res.status(200).json({
      message: 'Category unpublished successfully',
      category,
    });
  } catch (error) {
    console.error('Error unpublishing category:', error);
    return res.status(500).json({ error: 'Failed to unpublish category' });
  }
});

// POST - Bulk unpublish categories
router.post('/categories/unpublish-bulk', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const result = await TaskCategory.updateMany(
      {},
      { $set: { isPublished: false, status: 'APPROVED' } },
    );

    return res.status(200).json({
      message: 'Categories unpublished successfully',
      modifiedCount: result.modifiedCount || 0,
    });
  } catch (error) {
    console.error('Error bulk unpublishing categories:', error);
    return res.status(500).json({ error: 'Failed to bulk unpublish categories' });
  }
});

// ============================================
// SUBCATEGORY APPROVAL SYSTEM (Reviewer and content_access_manager only)
// ============================================

// GET - Get all pending subcategories
router.get('/subcategories/pending', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { page, limit } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter = { status: 'PENDING_APPROVAL' };
    const subcategoryListFields = 'name slug categorySlug status isPublished createdBy createdAt updatedAt submissionNotes originalSubcategoryId';
    const [subcategories, total] = await Promise.all([
      TaskSubcategory.find(filter)
        .select(subcategoryListFields)
        .populate('createdBy', 'name email role')
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .skip(skip)
        .lean(),
      TaskSubcategory.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: subcategories,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('Error fetching pending subcategories:', error);
    return res.status(500).json({ error: 'Failed to fetch pending subcategories' });
  }
});

// GET - Get all subcategories
router.get('/subcategories/all', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { status, limit, page } = req.query;
    const filter = {};

    if (status) {
      filter.status = status;
    } else if (req.user.role === 'reviewer') {
      filter.status = { $in: ['PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REJECTED'] };
    }

    // Pagination support - default to 50 items per page
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const skip = (pageNum - 1) * limitNum;

    const subcategoryListFields = 'name slug categorySlug status isPublished originalSubcategoryId createdBy reviewedBy reviewedAt publishedBy createdAt updatedAt';
    const [subcategories, total] = await Promise.all([
      TaskSubcategory.find(filter)
        .select(subcategoryListFields)
        .populate('createdBy', 'name email role')
        .populate('reviewedBy', 'name email')
        .populate('publishedBy', 'name email')
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .skip(skip)
        .lean(),
      TaskSubcategory.countDocuments(filter),
    ]);

    const categorySlugSet = new Set(subcategories.map((item) => item.categorySlug).filter(Boolean));
    let categoryTypeMap = new Map();
    if (categorySlugSet.size > 0) {
      const parentCategoriesBySlug = await TaskCategory.find({
        slug: { $in: Array.from(categorySlugSet) },
      }).select('slug categoryType').lean();
      categoryTypeMap = new Map(parentCategoriesBySlug.map((item) => [item.slug, item.categoryType || '']));
    }

    const subcategoriesWithType = subcategories.map((item) => ({
      ...item,
      categoryType: categoryTypeMap.get(item.categorySlug)
        || inferCategoryTypeFromName(item.name),
    }));

    return res.status(200).json({
      data: subcategoriesWithType,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching subcategories:', error);
    return res.status(500).json({ error: 'Failed to fetch subcategories' });
  }
});

// POST - Approve subcategory
router.post('/subcategories/:id/approve', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewNotes } = req.body;

    const subcategory = await TaskSubcategory.findById(id);

    if (!subcategory) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }

    // Allow approval of DRAFT and PENDING_APPROVAL subcategories
    if (subcategory.status !== 'PENDING_APPROVAL' && subcategory.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Subcategory cannot be approved. Current status: ' + subcategory.status });
    }

    await TaskSubcategory.updateMany(
      { slug: subcategory.slug, _id: { $ne: subcategory._id }, status: 'PUBLISHED' },
      { $set: { isPublished: false, status: 'DRAFT', isCurrentVersion: false } },
    );

    subcategory.status = 'APPROVED';
    subcategory.isPublished = false;
    subcategory.isCurrentVersion = true;

    subcategory.reviewedBy = req.user._id;
    subcategory.reviewedAt = new Date();
    subcategory.reviewNotes = reviewNotes || '';

    await subcategory.save();

    return res.status(200).json({
      message: 'Subcategory approved successfully.',
      subcategory,
    });
  } catch (error) {
    console.error('Error approving subcategory:', error);
    return res.status(500).json({ error: 'Failed to approve subcategory' });
  }
});

// POST - Reject subcategory
router.post('/subcategories/:id/reject', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewNotes } = req.body;

    const subcategory = await TaskSubcategory.findById(id);

    if (!subcategory) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }

    // Allow rejection of DRAFT and PENDING_APPROVAL subcategories
    if (subcategory.status !== 'PENDING_APPROVAL' && subcategory.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Subcategory cannot be rejected. Current status: ' + subcategory.status });
    }

    subcategory.status = 'REJECTED';
    subcategory.reviewedBy = req.user._id;
    subcategory.reviewedAt = new Date();
    subcategory.reviewNotes = reviewNotes || '';

    await subcategory.save();

    return res.status(200).json({
      message: 'Subcategory rejected',
      subcategory,
    });
  } catch (error) {
    console.error('Error rejecting subcategory:', error);
    return res.status(500).json({ error: 'Failed to reject subcategory' });
  }
});

// POST - Publish subcategory
router.post('/subcategories/:id/publish', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;

    const subcategory = await TaskSubcategory.findById(id);

    if (!subcategory) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }

    if (subcategory.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Subcategory must be approved before publishing' });
    }

    // Unified Deduplication for Subcategories
    await TaskSubcategory.deleteMany({
      slug: subcategory.slug,
      _id: { $ne: subcategory._id }
    });
    subcategory.originalSubcategoryId = null;

    // Publish the new version
    subcategory.status = 'PUBLISHED';
    subcategory.isPublished = true;
    subcategory.isCurrentVersion = true;
    subcategory.publishedBy = req.user._id;
    subcategory.publishedAt = new Date();

    await subcategory.save();

    return res.status(200).json({
      message: 'Subcategory published successfully',
      subcategory,
    });
  } catch (error) {
    console.error('Error publishing subcategory:', error);
    return res.status(500).json({ error: 'Failed to publish subcategory' });
  }
});

// POST - Unpublish subcategory
router.post('/subcategories/:id/unpublish', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;

    const subcategory = await TaskSubcategory.findById(id);

    if (!subcategory) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }

    subcategory.isPublished = false;
    subcategory.status = 'APPROVED';

    await subcategory.save();

    return res.status(200).json({
      message: 'Subcategory unpublished successfully',
      subcategory,
    });
  } catch (error) {
    console.error('Error unpublishing subcategory:', error);
    return res.status(500).json({ error: 'Failed to unpublish subcategory' });
  }
});

// POST - Bulk unpublish subcategories
router.post('/subcategories/unpublish-bulk', authenticate, allowRoles('reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const result = await TaskSubcategory.updateMany(
      {},
      { $set: { isPublished: false, status: 'APPROVED' } },
    );

    return res.status(200).json({
      message: 'Subcategories unpublished successfully',
      modifiedCount: result.modifiedCount || 0,
    });
  } catch (error) {
    console.error('Error bulk unpublishing subcategories:', error);
    return res.status(500).json({ error: 'Failed to bulk unpublish subcategories' });
  }
});

module.exports = router;
module.exports.analyticsHandler = analyticsHandler;
