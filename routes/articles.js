const express = require('express');
const router = express.Router();
const Article = require('../models/Article');

// GET - Fetch all articles or a single article by ID
router.get('/', async (req, res) => {
  try {
    const { id, category, published } = req.query;

    // Fetch single article by ID
    if (id) {
      const article = await Article.findById(id);
      
      if (!article) {
        return res.status(404).json({ error: 'Article not found' });
      }

      // Increment view count
      article.views += 1;
      await article.save();
      
      return res.status(200).json(article);
    }

    // Build filter
    const filter = {};
    if (category) {
      filter.category = category;
    }
    if (published !== undefined) {
      filter.isPublished = published === 'true';
    }

    // Fetch all articles with filter
    const articles = await Article.find(filter).sort({ createdAt: -1 });
    return res.status(200).json(articles);
  } catch (error) {
    console.error('Error fetching articles:', error);
    return res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// POST - Create a new article
router.post('/', async (req, res) => {
  try {
    const { title, description, category, content, author, isPublished, imageUrl } = req.body;

    // Validation
    if (!title || !description || !category || !content) {
      return res.status(400).json({
        error: 'Title, description, category, and content are required',
      });
    }

    // Create article
    const article = new Article({
      title,
      description,
      category,
      content,
      imageUrl,
      author: author || 'ExtraHand Team',
      isPublished: isPublished !== undefined ? isPublished : true,
      views: 0,
    });

    await article.save();

    return res.status(201).json({
      message: 'Article created successfully',
      article,
    });
  } catch (error) {
    console.error('Error creating article:', error);
    return res.status(500).json({ error: 'Failed to create article' });
  }
});

// PUT - Update an existing article
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, content, author, isPublished, imageUrl } = req.body;

    // Find and update article
    const article = await Article.findById(id);

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Update fields
    if (title) article.title = title;
    if (description) article.description = description;
    if (category) article.category = category;
    if (content) article.content = content;
    if (imageUrl !== undefined) article.imageUrl = imageUrl;
    if (author) article.author = author;
    if (isPublished !== undefined) article.isPublished = isPublished;

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

// DELETE - Delete an article
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const article = await Article.findByIdAndDelete(id);

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    return res.status(200).json({
      message: 'Article deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting article:', error);
    return res.status(500).json({ error: 'Failed to delete article' });
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
