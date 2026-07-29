const express = require('express');
const router = express.Router();
const TaskSubSubcategory = require('../models/TaskSubSubcategory');
const TaskCategory = require('../models/TaskCategory');
const TaskSubcategory = require('../models/TaskSubcategory');
const authenticate = require('../middleware/auth');
const optionalAuth = require('../middleware/auth').optionalAuth;
const allowRoles = require('../middleware/roles');

// GET - Fetch all sub-subcategories or filter by parent category/subcategory
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { categorySlug, subcategorySlug, slug } = req.query;
    
    if (slug) {
      // If authenticated writer/reviewer/manager, allow viewing own or any item by slug
      if (req.user) {
        const allowedRoles = ['writer', 'reviewer', 'content_access_manager'];
        if (allowedRoles.includes(req.user.role)) {
          let item = await TaskSubSubcategory.findOne({ slug })
            .populate('createdBy', 'name email');
          if (item) {
            const isCreator = item.createdBy && item.createdBy._id && item.createdBy._id.toString() === req.user._id.toString();
            const isManager = ['reviewer', 'content_access_manager'].includes(req.user.role);
            if (isCreator || isManager) {
              let parentCategory = null;
              let parentSubcategory = null;
              if (item.categorySlug) {
                parentCategory = await TaskCategory.findOne({ slug: item.categorySlug });
              }
              if (item.subcategorySlug) {
                parentSubcategory = await TaskSubcategory.findOne({ slug: item.subcategorySlug });
              }
              const itemObj = item.toObject();
              itemObj.categoryName = parentCategory ? parentCategory.name : '';
              itemObj.subcategoryName = parentSubcategory ? parentSubcategory.name : '';
              return res.status(200).json(itemObj);
            }
          }
        }
      }

      // Public: published item only
      const item = await TaskSubSubcategory.findOne({ slug, isPublished: true })
        .populate('createdBy', 'name email');

      if (item) {
        let parentCategory = null;
        let parentSubcategory = null;
        if (item.categorySlug) {
          parentCategory = await TaskCategory.findOne({ slug: item.categorySlug, isPublished: true });
        }
        if (item.subcategorySlug) {
          parentSubcategory = await TaskSubcategory.findOne({ slug: item.subcategorySlug, isPublished: true });
        }
        const itemObj = item.toObject();
        itemObj.categoryName = parentCategory ? parentCategory.name : '';
        itemObj.subcategoryName = parentSubcategory ? parentSubcategory.name : '';
        return res.status(200).json(itemObj);
      }

      return res.status(404).json({ error: 'Sub-subcategory not found' });
    }

    // Filter by category and subcategory
    let filter = {};
    
    if (categorySlug) {
      filter.categorySlug = categorySlug;
    }
    
    if (subcategorySlug) {
      filter.subcategorySlug = subcategorySlug;
    }

    // If user is authenticated and has appropriate role, show all items including drafts
    if (req.user) {
      const allowedRoles = ['writer', 'reviewer', 'content_access_manager'];
      if (allowedRoles.includes(req.user.role)) {
        const items = await TaskSubSubcategory.find(filter)
          .populate('createdBy', 'name email')
          .sort({ createdAt: -1 });
        return res.status(200).json(items);
      }
    }

    // Public: only published items
    filter.isPublished = true;
    const items = await TaskSubSubcategory.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json(items);
  } catch (error) {
    console.error('Error fetching sub-subcategories:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST - Create a new sub-subcategory (requires authentication and appropriate role)
router.post('/', authenticate, allowRoles(['writer', 'reviewer', 'content_access_manager']), async (req, res) => {
  try {
    const { name, slug, categorySlug, subcategorySlug, description, status } = req.body;

    // Validate required fields
    if (!name || !slug || !categorySlug || !subcategorySlug) {
      return res.status(400).json({
        error: 'Missing required fields: name, slug, categorySlug, subcategorySlug',
      });
    }

    // Verify parent category and subcategory exist
    const parentCategory = await TaskCategory.findOne({ slug: categorySlug });
    const parentSubcategory = await TaskSubcategory.findOne({ 
      slug: subcategorySlug,
      categorySlug: categorySlug 
    });

    if (!parentCategory) {
      return res.status(404).json({ 
        error: 'Parent category not found',
        message: `The parent category with slug "${categorySlug}" does not exist in the database. Please create the main category first.`,
        categorySlug: categorySlug
      });
    }

    if (!parentSubcategory) {
      return res.status(404).json({ 
        error: 'Parent subcategory not found',
        message: `The parent subcategory with slug "${subcategorySlug}" does not exist in the database. Please create the subcategory first.`,
        subcategorySlug: subcategorySlug
      });
    }

    // Check if already exists
    const existing = await TaskSubSubcategory.findOne({
      slug: slug.toLowerCase(),
      categorySlug: categorySlug.toLowerCase(),
      subcategorySlug: subcategorySlug.toLowerCase()
    });

    if (existing) {
      return res.status(409).json({ error: 'Sub-subcategory with this slug already exists' });
    }

    // Create new sub-subcategory
    const newItem = new TaskSubSubcategory({
      name,
      slug: slug.toLowerCase(),
      categorySlug: categorySlug.toLowerCase(),
      subcategorySlug: subcategorySlug.toLowerCase(),
      description,
      status: status || 'DRAFT',
      createdBy: req.user._id,
    });

    await newItem.save();
    const populatedItem = await newItem.populate('createdBy', 'name email');

    res.status(201).json({
      message: 'Sub-subcategory created successfully',
      item: populatedItem,
    });
  } catch (error) {
    console.error('Error creating sub-subcategory:', error);
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Duplicate sub-subcategory' });
    }
    res.status(500).json({ error: error.message });
  }
});

// PATCH - Update a sub-subcategory
router.patch('/:id', authenticate, allowRoles(['writer', 'reviewer', 'content_access_manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const item = await TaskSubSubcategory.findById(id);
    if (!item) {
      return res.status(404).json({ error: 'Sub-subcategory not found' });
    }

    // Check authorization
    const isCreator = item.createdBy && item.createdBy.toString() === req.user._id.toString();
    const isManager = ['reviewer', 'content_access_manager'].includes(req.user.role);

    if (!isCreator && !isManager) {
      return res.status(403).json({ error: 'Not authorized to update this sub-subcategory' });
    }

    // Update allowed fields
    const allowedUpdates = ['name', 'description', 'status'];
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        item[key] = updates[key];
      }
    });

    await item.save();
    const populatedItem = await item.populate('createdBy', 'name email');

    res.status(200).json({
      message: 'Sub-subcategory updated successfully',
      item: populatedItem,
    });
  } catch (error) {
    console.error('Error updating sub-subcategory:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE - Delete a sub-subcategory
router.delete('/:id', authenticate, allowRoles(['reviewer', 'content_access_manager']), async (req, res) => {
  try {
    const { id } = req.params;

    const item = await TaskSubSubcategory.findByIdAndDelete(id);
    if (!item) {
      return res.status(404).json({ error: 'Sub-subcategory not found' });
    }

    res.status(200).json({
      message: 'Sub-subcategory deleted successfully',
      item,
    });
  } catch (error) {
    console.error('Error deleting sub-subcategory:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT - Publish/Unpublish a sub-subcategory
router.put('/:id/publish', authenticate, allowRoles(['reviewer', 'content_access_manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const { isPublished } = req.body;

    const item = await TaskSubSubcategory.findById(id);
    if (!item) {
      return res.status(404).json({ error: 'Sub-subcategory not found' });
    }

    item.isPublished = isPublished;
    if (isPublished) {
      item.publishedBy = req.user._id;
      item.publishedAt = new Date();
      item.status = 'PUBLISHED';
    }

    await item.save();
    const populatedItem = await item.populate('createdBy', 'name email').populate('publishedBy', 'name email');

    res.status(200).json({
      message: isPublished ? 'Sub-subcategory published' : 'Sub-subcategory unpublished',
      item: populatedItem,
    });
  } catch (error) {
    console.error('Error publishing sub-subcategory:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
