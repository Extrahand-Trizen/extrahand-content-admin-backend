const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt'); // Added bcrypt
const Article = require('../models/Article');
const TaskCategory = require('../models/TaskCategory');
const TaskSubcategory = require('../models/TaskSubcategory');
const User = require('../models/User');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/roles');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;

// ============================================
// Reviewer ROUTES - Article Approval System
// ============================================

// GET - Get all articles pending approval (Reviewer and Writer)
router.get('/articles/pending', authenticate, allowRoles('reviewer', 'writer'), async (req, res) => {
  try {
    let filter = {};
    
    // Writers only see their own pending articles and drafts
    if (req.user.role === 'writer') {
      filter.createdBy = req.user._id;
      filter.status = { $in: ['DRAFT', 'PENDING_APPROVAL'] };
    } else if (req.user.role === 'reviewer') {
      // Reviewers only see articles that are actually pending approval (submitted by writers)
      // They don't need to see drafts unless they are their own (which handles differently usually)
      // But for the "Pending Approval" queue, it should strictly be PENDING_APPROVAL
      filter.status = 'PENDING_APPROVAL'; 
    }
    
    const articles = await Article.find(filter)
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 });
    
    return res.status(200).json(articles);
  } catch (error) {
    console.error('Error fetching pending articles:', error);
    return res.status(500).json({ error: 'Failed to fetch pending articles' });
  }
});

// GET - Get all articles with any status (Reviewer and Writer)
router.get('/articles/all', authenticate, allowRoles('reviewer', 'writer'), async (req, res) => {
  try {
    const { status } = req.query;
    let filter = {};
    
    // Writers only see their own articles
    if (req.user.role === 'writer') {
      filter.createdBy = req.user._id;
    }
    // Reviewers see all articles
    
    if (status) {
      filter.status = status;
    }

    const articles = await Article.find(filter)
      .populate('createdBy', 'name email role')
      .populate('reviewedBy', 'name email')
      .populate('publishedBy', 'name email')
      .sort({ createdAt: -1 });
    
    return res.status(200).json(articles);
  } catch (error) {
    console.error('Error fetching all articles:', error);
    return res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// POST - Approve article (Reviewer only)
router.post('/articles/:id/approve', authenticate, allowRoles('reviewer'), async (req, res) => {
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

// POST - Reject article (Reviewer only)
router.post('/articles/:id/reject', authenticate, allowRoles('reviewer'), async (req, res) => {
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

// POST - Publish approved article (Reviewer only)
router.post('/articles/:id/publish', authenticate, allowRoles('reviewer'), async (req, res) => {
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

// POST - Unpublish article (Reviewer only)
router.post('/articles/:id/unpublish', authenticate, allowRoles('reviewer'), async (req, res) => {
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
// USER MANAGEMENT (Reviewer only)
// ============================================

// GET - Get all users
router.get('/users', authenticate, allowRoles('reviewer'), async (req, res) => {
  try {
    const users = await User.find({})
      .select('-passwordHash')
      .sort({ createdAt: -1 });
    
    return res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PUT - Update user role (Reviewer only)
router.put('/users/:id/role', authenticate, allowRoles('reviewer'), async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

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

// PUT - Update user status (Reviewer only)
router.put('/users/:id/status', authenticate, allowRoles('reviewer'), async (req, res) => {
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

// DELETE - Delete user (Reviewer only)
router.delete('/users/:id', authenticate, allowRoles('reviewer'), async (req, res) => {
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

// POST - Create user (Reviewer only)
router.post('/users', authenticate, allowRoles('reviewer'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Basic validation
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
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

// ============================================
// DASHBOARD STATISTICS
// ============================================

// GET - Dashboard statistics (Reviewer and Writer)
router.get('/dashboard/stats', authenticate, allowRoles('reviewer', 'writer'), async (req, res) => {
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
    ] = await Promise.all([
      Article.countDocuments(articleFilter),
      Article.countDocuments({ ...articleFilter, status: 'PENDING_APPROVAL' }),
      Article.countDocuments({ ...articleFilter, status: 'APPROVED' }),
      Article.countDocuments({ ...articleFilter, status: 'PUBLISHED' }),
      Article.countDocuments({ ...articleFilter, status: 'REJECTED' }),
      req.user.role === 'reviewer' ? User.countDocuments() : 0,
      req.user.role === 'reviewer' ? User.countDocuments({ role: 'reviewer' }) : 0,
      req.user.role === 'reviewer' ? User.countDocuments({ role: 'writer' }) : 0,
      TaskCategory.countDocuments(categoryFilter),
      TaskCategory.countDocuments({ ...categoryFilter, status: 'PENDING_APPROVAL' }),
      TaskCategory.countDocuments({ ...categoryFilter, status: 'APPROVED' }),
      TaskCategory.countDocuments({ ...categoryFilter, status: 'PUBLISHED' }),
      TaskCategory.countDocuments({ ...categoryFilter, status: 'REJECTED' }),
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

// GET - Recent activity (Reviewer)
router.get('/dashboard/activity', authenticate, allowRoles('reviewer'), async (req, res) => {
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

// ============================================
// CATEGORY APPROVAL SYSTEM (Reviewer only)
// ============================================

// GET - Get all pending categories
router.get('/categories/pending', authenticate, allowRoles('reviewer'), async (req, res) => {
  try {
    // Only show PENDING_APPROVAL categories for Reviewer review
    // Drafts should not be visible until submitted
    const categories = await TaskCategory.find({ status: 'PENDING_APPROVAL' })
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 });
    
    return res.status(200).json(categories);
  } catch (error) {
    console.error('Error fetching pending categories:', error);
    return res.status(500).json({ error: 'Failed to fetch pending categories' });
  }
});

// GET - Get all categories
router.get('/categories/all', authenticate, allowRoles('reviewer'), async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    
    if (status) {
      filter.status = status;
    }

    const categories = await TaskCategory.find(filter)
      .populate('createdBy', 'name email role')
      .populate('reviewedBy', 'name email')
      .populate('publishedBy', 'name email')
      .sort({ createdAt: -1 });
    
    return res.status(200).json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST - Approve category
router.post('/categories/:id/approve', authenticate, allowRoles('reviewer'), async (req, res) => {
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

    // Handle Edit Workflow: If this is an update to an existing category
    if (category.originalCategoryId) {
      const originalCategory = await TaskCategory.findById(category.originalCategoryId);
      
      if (originalCategory) {
        // If original was valid, we replace it with this new approved version
        // We delete the old one permanently as requested
        await TaskCategory.findByIdAndDelete(category.originalCategoryId);
        
        // If the original was PUBLISHED, we want to maintain continuity? 
        // The user request says "old category will be removed permanently".
        // It's safer to leave this one as APPROVED and let Reviewer Publish it explicitly, 
        // UNLESS the user implies auto-replace. 
        // Given "approve the edited category... old... removed", I will separate the concerns slightly 
        // but ensure this one becomes the "Main" copy.
        
        category.originalCategoryId = null; // No longer a child
        category.isCurrentVersion = true;
      }
    }

    category.status = 'APPROVED';
    category.reviewedBy = req.user._id;
    category.reviewedAt = new Date();
    category.reviewNotes = reviewNotes || '';
    
    await category.save();

    return res.status(200).json({
      message: 'Category approved successfully. Old version removed if applicable.',
      category,
    });
  } catch (error) {
    console.error('Error approving category:', error);
    return res.status(500).json({ error: 'Failed to approve category' });
  }
});
// POST - Reject category
router.post('/categories/:id/reject', authenticate, allowRoles('reviewer'), async (req, res) => {
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
router.post('/categories/:id/publish', authenticate, allowRoles('reviewer'), async (req, res) => {
  try {
    const { id } = req.params;

    const category = await TaskCategory.findById(id);
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    if (category.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Category must be approved before publishing' });
    }

    // If this is a new version (has originalCategoryId), replace the old published version
    if (category.originalCategoryId) {
      const originalCategory = await TaskCategory.findById(category.originalCategoryId);
      
      if (originalCategory && originalCategory.status === 'PUBLISHED') {
        // Mark old version as not current and unpublish it
        originalCategory.isCurrentVersion = false;
        originalCategory.isPublished = false;
        originalCategory.status = 'DRAFT'; // Archive the old version
        await originalCategory.save();
      }
    }

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
router.post('/categories/:id/unpublish', authenticate, allowRoles('reviewer'), async (req, res) => {
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

// ============================================
// SUBCATEGORY APPROVAL SYSTEM (Reviewer only)
// ============================================

// POST - Approve subcategory
router.post('/subcategories/:id/approve', authenticate, allowRoles('reviewer'), async (req, res) => {
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

    // Handle Edit Workflow: If this is an update to an existing subcategory
    if (subcategory.originalSubcategoryId) {
      const originalSubcategory = await TaskSubcategory.findById(subcategory.originalSubcategoryId);
      
      if (originalSubcategory) {
        // Delete the old one permanently as requested
        await TaskSubcategory.findByIdAndDelete(subcategory.originalSubcategoryId);
        
        subcategory.originalSubcategoryId = null; // No longer a child
        subcategory.isCurrentVersion = true;
      }
    }

    subcategory.status = 'APPROVED';
    subcategory.reviewedBy = req.user._id;
    subcategory.reviewedAt = new Date();
    subcategory.reviewNotes = reviewNotes || '';
    
    await subcategory.save();

    return res.status(200).json({
      message: 'Subcategory approved successfully. Old version removed if applicable.',
      subcategory,
    });
  } catch (error) {
    console.error('Error approving subcategory:', error);
    return res.status(500).json({ error: 'Failed to approve subcategory' });
  }
});

// POST - Reject subcategory
router.post('/subcategories/:id/reject', authenticate, allowRoles('reviewer'), async (req, res) => {
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
router.post('/subcategories/:id/publish', authenticate, allowRoles('reviewer'), async (req, res) => {
  try {
    const { id } = req.params;

    const subcategory = await TaskSubcategory.findById(id);
    
    if (!subcategory) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }

    if (subcategory.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Subcategory must be approved before publishing' });
    }

    // If this is a new version (has originalSubcategoryId), replace the old published version
    if (subcategory.originalSubcategoryId) {
      const originalSubcategory = await TaskSubcategory.findById(subcategory.originalSubcategoryId);
      
      if (originalSubcategory && originalSubcategory.status === 'PUBLISHED') {
        // Mark old version as not current and unpublish it
        originalSubcategory.isCurrentVersion = false;
        originalSubcategory.isPublished = false;
        originalSubcategory.status = 'DRAFT'; // Archive the old version
        await originalSubcategory.save();
      }
    }

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
router.post('/subcategories/:id/unpublish', authenticate, allowRoles('reviewer'), async (req, res) => {
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

module.exports = router;

