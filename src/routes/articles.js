const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/roles');

// GET - Fetch all articles or a single article by ID (Public for published, authenticated for others)
router.get('/', async (req, res) => {
  try {
    const { id, category, published } = req.query;

    // Fetch single article by ID
    if (id) {
      const article = await Article.findById(id)
        .populate('createdBy', 'name email')
        .populate('reviewedBy', 'name email')
        .populate('publishedBy', 'name email');
      
      if (!article) {
        return res.status(404).json({ error: 'Article not found' });
      }

      // Only show published articles to public, or any status to authenticated users
      if (!article.isPublished && !req.user) {
        return res.status(403).json({ error: 'Article not accessible' });
      }

      // Increment view count for published articles
      if (article.isPublished) {
        article.views += 1;
        await article.save();
      }
      
      return res.status(200).json(article);
    }

    // Build filter - only show published articles to public
    const filter = {};
    
    // If not authenticated, only show published articles
    if (!req.user) {
      filter.isPublished = true;
      filter.status = 'PUBLISHED';
    }
    
    if (category) {
      filter.category = category;
    }
    if (published !== undefined) {
      filter.isPublished = published === 'true';
    }

    // Fetch all articles with filter
    const articles = await Article.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    return res.status(200).json(articles);
  } catch (error) {
    console.error('Error fetching articles:', error);
    return res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// GET - Get articles created by the authenticated user (Admin/User)
router.get('/my-articles', authenticate, async (req, res) => {
  try {
    const articles = await Article.find({ createdBy: req.user._id })
      .populate('reviewedBy', 'name email')
      .populate('publishedBy', 'name email')
      .sort({ createdAt: -1 });
    
    return res.status(200).json(articles);
  } catch (error) {
    console.error('Error fetching user articles:', error);
    return res.status(500).json({ error: 'Failed to fetch your articles' });
  }
});

// POST - Create a new article (Writer and Manager only)
router.post('/', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { title, description, category, content, author, imageUrl } = req.body;

    // Validation
    if (!title || !description || !category || !content) {
      return res.status(400).json({
        error: 'Title, description, category, and content are required',
      });
    }

    // Create article
    // Writer articles start as DRAFT (they need to manually submit for approval)
    // Manager articles start as APPROVED (ready to publish)
    const status = req.user.role === 'reviewer' || req.user.role === 'content_access_manager' ? 'APPROVED' : 'DRAFT';
    const isPublished = false; // All articles start unpublished
    
    const article = new Article({
      title,
      description,
      category,
      content,
      imageUrl,
      author: author || req.user.name || 'ExtraHand Team',
      status,
      isPublished,
      createdBy: req.user._id,
      views: 0,
    });

    await article.save();

    return res.status(201).json({
      message: (req.user.role === 'reviewer' || req.user.role === 'content_access_manager') 
        ? 'Article created and approved. You can now publish it.' 
        : 'Article saved as draft. Submit for approval when ready.',
      article,
    });
  } catch (error) {
    console.error('Error creating article:', error);
    return res.status(500).json({ error: 'Failed to create article' });
  }
});

// PUT - Update an existing article (Creator or Manager)
router.put('/:id', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, content, author, imageUrl } = req.body;

    // Find article
    const article = await Article.findById(id);

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Check permissions: only creator or manager can edit
    if (article.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'reviewer' && req.user.role !== 'content_access_manager') {
      return res.status(403).json({ error: 'Not authorized to edit this article' });
    }

    // If article is PUBLISHED or APPROVED, check if a draft version already exists
    if ((article.status === 'PUBLISHED' || article.status === 'APPROVED') && req.user.role === 'writer') {
      // Check if there's already a draft version of this article
      const existingDraft = await Article.findOne({
        originalArticleId: article._id,
        status: { $in: ['DRAFT', 'PENDING_APPROVAL', 'REJECTED'] }
      });

      if (existingDraft) {
        // Update the existing draft instead of creating a new one
        existingDraft.title = title || existingDraft.title;
        existingDraft.description = description || existingDraft.description;
        existingDraft.category = category || existingDraft.category;
        existingDraft.content = content || existingDraft.content;
        existingDraft.imageUrl = imageUrl !== undefined ? imageUrl : existingDraft.imageUrl;
        existingDraft.author = author || existingDraft.author;
        
        // If it was rejected, move back to draft
        if (existingDraft.status === 'REJECTED') {
          existingDraft.status = 'DRAFT';
          existingDraft.reviewNotes = '';
        }

        await existingDraft.save();

        return res.status(200).json({
          message: 'Draft version updated. Original article remains published.',
          article: existingDraft,
          isExistingDraft: true,
        });
      }

      // No existing draft found, create a new draft version
      const newVersion = new Article({
        title: title || article.title,
        description: description || article.description,
        category: category || article.category,
        content: content || article.content,
        imageUrl: imageUrl !== undefined ? imageUrl : article.imageUrl,
        author: author || article.author,
        status: 'DRAFT',
        isPublished: false,
        createdBy: req.user._id,
        originalArticleId: article._id,
        isCurrentVersion: false,
      });

      await newVersion.save();

      return res.status(200).json({
        message: 'New draft version created for approval. Original article remains published.',
        article: newVersion,
        isNewVersion: true,
      });
    }

    // For DRAFT, PENDING, or REJECTED status - direct edit is allowed
    // Update fields
    if (title) article.title = title;
    if (description) article.description = description;
    if (category) article.category = category;
    if (content) article.content = content;
    if (imageUrl !== undefined) article.imageUrl = imageUrl;
    if (author) article.author = author;

    // If article was rejected, move back to draft on edit
    if (article.status === 'REJECTED' && req.user.role === 'writer') {
      article.status = 'DRAFT';
      article.reviewNotes = '';
    }

    await article.save();

    return res.status(200).json({
      message: 'Article updated successfully',
      article,
    });
  } catch (error) {
    console.error('Error updating article:', error);
    return res.status(500).json({ error: 'Failed to update article' });
  }
});

// DELETE - Delete an article (Creator or Manager)
router.delete('/:id', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params;

    const article = await Article.findById(id);

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Check permissions: only creator or manager can delete
    if (article.createdBy.toString() !== req.user._id.toString() && (req.user.role !== 'reviewer' && req.user.role !== 'content_access_manager')) {
      return res.status(403).json({ error: 'Not authorized to delete this article' });
    }

    // Prevent deletion of published articles by non-managers
    if (article.status === 'PUBLISHED' && (req.user.role !== 'reviewer' && req.user.role !== 'content_access_manager')) {
      return res.status(403).json({ error: 'Cannot delete published articles. Contact manager.' });
    }

    await Article.findByIdAndDelete(id);

    return res.status(200).json({
      message: 'Article deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting article:', error);
    return res.status(500).json({ error: 'Failed to delete article' });
  }
});

// POST - Submit article for approval (Writer only, for draft articles)
router.post('/:id/submit', authenticate, allowRoles('writer'), async (req, res) => {
  try {
    const { id } = req.params;

    const article = await Article.findById(id);

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Check ownership
    if (article.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Only draft or rejected articles can be submitted
    if (!['DRAFT', 'REJECTED'].includes(article.status)) {
      return res.status(400).json({ error: 'Article cannot be submitted for approval' });
    }

    article.status = 'PENDING_APPROVAL';
    article.reviewNotes = '';
    await article.save();

    return res.status(200).json({
      message: 'Article submitted for approval',
      article,
    });
  } catch (error) {
    console.error('Error submitting article:', error);
    return res.status(500).json({ error: 'Failed to submit article' });
  }
});

// GET - Get article categories (distinct)
router.get('/categories/list', async (req, res) => {
  try {
    const categories = await Article.distinct('category');
    return res.status(200).json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

module.exports = router;
