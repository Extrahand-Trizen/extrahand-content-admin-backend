const express = require('express');
const router = express.Router();
const Page = require('../models/Page');

// GET - Fetch all pages or a single page by slug
router.get('/', async (req, res) => {
  try {
    const { slug } = req.query;

    if (slug) {
      // Fetch single page by slug
      const page = await Page.findOne({ slug });
      if (!page) {
        return res.status(404).json({ error: 'Page not found' });
      }
      return res.status(200).json(page);
    }

    // Fetch all pages
    const pages = await Page.find({}).sort({ createdAt: -1 });
    return res.status(200).json(pages);
  } catch (error) {
    console.error('Error fetching pages:', error);
    return res.status(500).json({
      error: 'Failed to fetch pages',
      details: error.message,
    });
  }
});

// POST - Create a new page
router.post('/', async (req, res) => {
  try {
    const {
      title,
      slug,
      content,
      description,
      metaTitle,
      metaDescription,
      isPublished,
      author,
      tags,
      category,
    } = req.body;

    // Validate required fields
    if (!title || !slug || !content) {
      return res.status(400).json({
        error: 'Title, slug, and content are required',
      });
    }

    // Check if page with same slug already exists
    const existingPage = await Page.findOne({ slug });
    if (existingPage) {
      return res.status(409).json({
        error: 'A page with this slug already exists',
      });
    }

    // Create new page
    const pageData = {
      title,
      slug,
      content,
      description: description || '',
      metaTitle: metaTitle || title,
      metaDescription: metaDescription || description || '',
      isPublished: isPublished || false,
      publishedAt: isPublished ? new Date() : null,
      author: author || '',
      tags: tags || [],
      category: category || '',
    };

    const page = await Page.create(pageData);

    return res.status(201).json({
      message: 'Page created successfully',
      page,
    });
  } catch (error) {
    console.error('Error creating page:', error);
    return res.status(500).json({
      error: 'Failed to create page',
      details: error.message,
    });
  }
});

// PUT - Update an existing page
router.put('/', async (req, res) => {
  try {
    const { id, ...updateData } = req.body;

    if (!id) {
      return res.status(400).json({
        error: 'Page ID is required',
      });
    }

    // If slug is being updated, check for conflicts
    if (updateData.slug) {
      const existingPage = await Page.findOne({
        slug: updateData.slug,
        _id: { $ne: id },
      });
      if (existingPage) {
        return res.status(409).json({
          error: 'A page with this slug already exists',
        });
      }
    }

    // Update publishedAt if isPublished is being set to true
    if (updateData.isPublished === true) {
      const currentPage = await Page.findById(id);
      if (currentPage && !currentPage.publishedAt) {
        updateData.publishedAt = new Date();
      }
    }

    const page = await Page.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    return res.status(200).json({
      message: 'Page updated successfully',
      page,
    });
  } catch (error) {
    console.error('Error updating page:', error);
    return res.status(500).json({
      error: 'Failed to update page',
      details: error.message,
    });
  }
});

// DELETE - Delete a page
router.delete('/', async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Page ID is required' });
    }

    const page = await Page.findByIdAndDelete(id);

    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    return res.status(200).json({
      message: 'Page deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting page:', error);
    return res.status(500).json({
      error: 'Failed to delete page',
      details: error.message,
    });
  }
});

module.exports = router;

