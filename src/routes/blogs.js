const express = require('express');
const router = express.Router();
const Blog = require('../models/Blog');
const City = require('../models/City');
const Area = require('../models/Area');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/roles');
const { generateFaqSchema } = require('../utils/seoPageUtils');

/**
 * Basic HTML sanitizer to strip dangerous script tags and inline event handlers
 */
function sanitizeHtml(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^>\s]+/gi, '')
    .replace(/javascript:/gi, '');
}

/**
 * Helper to normalize slug
 */
function cleanSlug(slug) {
  if (!slug) return '';
  return slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function generateCanonicalUrl(slug) {
  return `https://extrahand.in/blogs/${slug}`;
}

// GET - List blogs (authenticated, with filters and pagination)
router.get('/', authenticate, async (req, res) => {
  try {
    const { categorySlug, cityId, status, search, page, limit, sort } = req.query;
    const filter = {};

    // Writers only see their own blogs unless reviewing
    if (req.user && req.user.role === 'writer') {
      filter.writtenBy = req.user._id;
    }

    if (categorySlug && categorySlug !== 'all') {
      filter.categorySlug = categorySlug;
    }

    if (cityId && cityId !== 'all') {
      filter.cityId = cityId;
    }

    if (status && status !== 'all') {
      if (status.includes(',')) {
        filter.status = { $in: status.split(',') };
      } else {
        filter.status = status;
      }
    }

    if (search) {
      const term = String(search).trim();
      if (term) {
        filter.$or = [
          { title: { $regex: term, $options: 'i' } },
          { slug: { $regex: term, $options: 'i' } },
          { category: { $regex: term, $options: 'i' } },
          { metaTitle: { $regex: term, $options: 'i' } },
        ];
      }
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const sortOption = sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

    const BLOG_LIST_FIELDS = [
      'pageType',
      'title',
      'slug',
      'canonicalUrl',
      'category',
      'categorySlug',
      'cityId',
      'cityName',
      'citySlug',
      'areaId',
      'areaName',
      'areaSlug',
      'heroImage',
      'status',
      'isPublished',
      'writtenBy',
      'reviewedBy',
      'rejectedReason',
      'publishedAt',
      'createdAt',
      'updatedAt',
    ].join(' ');

    const [blogs, total] = await Promise.all([
      Blog.find(filter)
        .select(BLOG_LIST_FIELDS)
        .populate('writtenBy', 'name email role')
        .populate('reviewedBy', 'name email')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Blog.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: blogs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('Error fetching blogs:', error);
    return res.status(500).json({ error: 'Failed to fetch blogs' });
  }
});

// GET - Public published blogs (used by extrahand.in website)
router.get('/published', async (req, res) => {
  try {
    const { slug, categorySlug, citySlug, page, limit } = req.query;

    // Single blog lookup by slug
    if (slug) {
      const blog = await Blog.findOne({
        slug: cleanSlug(slug),
        status: 'PUBLISHED',
        isPublished: true,
      })
        .populate('writtenBy', 'name email')
        .lean();

      if (!blog) {
        return res.status(404).json({ error: 'Blog not found' });
      }

      return res.status(200).json(blog);
    }

    // List of published blogs
    const filter = {
      status: 'PUBLISHED',
      isPublished: true,
    };

    if (categorySlug) {
      filter.categorySlug = categorySlug;
    }

    if (citySlug) {
      filter.citySlug = citySlug;
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 12));
    const skip = (pageNum - 1) * limitNum;

    const [blogs, total] = await Promise.all([
      Blog.find(filter)
        .select('title slug canonicalUrl category categorySlug cityName citySlug heroImage publishedAt createdAt writtenBy metaTitle metaDescription')
        .populate('writtenBy', 'name')
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Blog.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: blogs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('Error fetching published blogs:', error);
    return res.status(500).json({ error: 'Failed to fetch published blogs' });
  }
});

// GET - Get single blog by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id)
      .populate('writtenBy', 'name email role')
      .populate('reviewedBy', 'name email')
      .lean();

    if (!blog) {
      return res.status(404).json({ error: 'Blog not found' });
    }

    if (!['reviewer', 'content_access_manager'].includes(req.user.role)) {
      const writtenById = blog.writtenBy?._id || blog.writtenBy;
      if (writtenById && writtenById.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Not authorized to view this blog' });
      }
    }

    return res.status(200).json(blog);
  } catch (error) {
    console.error('Error fetching blog:', error);
    return res.status(500).json({ error: 'Failed to fetch blog' });
  }
});

// POST - Create blog
router.post('/', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const body = req.body;
    const {
      title,
      metaTitle,
      metaDescription,
      slug: customSlug,
      category,
      categorySlug,
      cityId,
      areaId,
      heroImage,
      bodyHtml,
      faqs,
      status: targetStatus,
    } = body;

    const missingFields = [];
    if (!title?.trim()) missingFields.push('title');
    if (!metaTitle?.trim()) missingFields.push('metaTitle');
    if (!metaDescription?.trim()) missingFields.push('metaDescription');
    if (!category?.trim()) missingFields.push('category');
    if (!categorySlug?.trim()) missingFields.push('categorySlug');
    if (!bodyHtml?.trim()) missingFields.push('bodyHtml');

    if (missingFields.length > 0) {
      return res.status(400).json({ error: `Required fields missing: ${missingFields.join(', ')}` });
    }

    const finalSlug = cleanSlug(customSlug || title);
    if (!finalSlug) {
      return res.status(400).json({ error: 'Valid slug or title is required' });
    }

    const existing = await Blog.findOne({ slug: finalSlug });
    if (existing) {
      return res.status(409).json({ error: 'A blog with this slug already exists. Please modify the slug.' });
    }

    let cityDoc = null;
    let areaDoc = null;

    if (cityId) {
      if (/^[a-f\d]{24}$/i.test(cityId)) {
        cityDoc = await City.findById(cityId);
      } else {
        cityDoc = await City.findOne({ slug: cityId });
      }
    }

    if (areaId) {
      if (/^[a-f\d]{24}$/i.test(areaId)) {
        areaDoc = await Area.findById(areaId);
      } else {
        areaDoc = await Area.findOne({ slug: areaId });
      }
    }

    const canonicalUrl = generateCanonicalUrl(finalSlug);
    const faqSchema = generateFaqSchema(faqs || []);
    const sanitizedBody = sanitizeHtml(bodyHtml);

    const initialStatus = ['PENDING_APPROVAL', 'DRAFT'].includes(targetStatus) ? targetStatus : 'DRAFT';

    const blogData = {
      pageType: 'blog',
      title: title.trim(),
      metaTitle: metaTitle.trim(),
      metaDescription: metaDescription.trim(),
      slug: finalSlug,
      canonicalUrl,
      category: category.trim(),
      categorySlug: categorySlug.trim(),
      cityId: cityDoc ? cityDoc._id : null,
      cityName: cityDoc ? cityDoc.name : (body.cityName || null),
      citySlug: cityDoc ? cityDoc.slug : (body.citySlug || null),
      areaId: areaDoc ? areaDoc._id : null,
      areaName: areaDoc ? areaDoc.name : (body.areaName || null),
      areaSlug: areaDoc ? areaDoc.slug : (body.areaSlug || null),
      heroImage: heroImage || null,
      bodyHtml: sanitizedBody,
      faqs: Array.isArray(faqs) ? faqs : [],
      faqSchema,
      status: initialStatus,
      isPublished: false,
      writtenBy: req.user._id,
    };

    const blog = await Blog.create(blogData);
    const saved = await Blog.findById(blog._id).populate('writtenBy', 'name email role').lean();

    return res.status(201).json({
      message: initialStatus === 'PENDING_APPROVAL' ? 'Blog submitted for approval' : 'Blog saved as draft',
      data: saved,
    });
  } catch (error) {
    console.error('Error creating blog:', error);
    return res.status(500).json({ error: 'Failed to create blog', details: error.message });
  }
});

// PUT - Update blog
router.put('/:id', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const existing = await Blog.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Blog not found' });
    }

    if (!['reviewer', 'content_access_manager'].includes(req.user.role) && existing.writtenBy && existing.writtenBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to update this blog' });
    }

    const body = req.body;
    const updateData = { ...body };

    if (updateData.slug) {
      updateData.slug = cleanSlug(updateData.slug);
      // Check slug collision
      const slugCollision = await Blog.findOne({ slug: updateData.slug, _id: { $ne: existing._id } });
      if (slugCollision) {
        return res.status(409).json({ error: 'A blog with this slug already exists' });
      }
      updateData.canonicalUrl = generateCanonicalUrl(updateData.slug);
    }

    if (updateData.bodyHtml) {
      updateData.bodyHtml = sanitizeHtml(updateData.bodyHtml);
    }

    if (updateData.faqs) {
      updateData.faqSchema = generateFaqSchema(updateData.faqs);
    }

    // Resolve city/area names if cityId / areaId changed
    if (updateData.cityId && updateData.cityId !== existing.cityId?.toString()) {
      if (/^[a-f\d]{24}$/i.test(updateData.cityId)) {
        const cityDoc = await City.findById(updateData.cityId);
        if (cityDoc) {
          updateData.cityName = cityDoc.name;
          updateData.citySlug = cityDoc.slug;
        }
      }
    } else if (updateData.cityId === null || updateData.cityId === '') {
      updateData.cityId = null;
      updateData.cityName = null;
      updateData.citySlug = null;
    }

    if (updateData.areaId && updateData.areaId !== existing.areaId?.toString()) {
      if (/^[a-f\d]{24}$/i.test(updateData.areaId)) {
        const areaDoc = await Area.findById(updateData.areaId);
        if (areaDoc) {
          updateData.areaName = areaDoc.name;
          updateData.areaSlug = areaDoc.slug;
        }
      }
    } else if (updateData.areaId === null || updateData.areaId === '') {
      updateData.areaId = null;
      updateData.areaName = null;
      updateData.areaSlug = null;
    }

    // If writer updates rejected or pending blog, return to draft (unless specifically submitting)
    if (['REJECTED', 'PENDING_APPROVAL'].includes(existing.status) && req.user.role === 'writer' && updateData.status !== 'PENDING_APPROVAL') {
      updateData.status = 'DRAFT';
      updateData.rejectedReason = null;
    }

    Object.keys(updateData).forEach((key) => {
      if (key !== '_id' && key !== 'writtenBy') {
        existing[key] = updateData[key];
        existing.markModified(key);
      }
    });

    await existing.save();

    const saved = await Blog.findById(existing._id).populate('writtenBy', 'name email role').populate('reviewedBy', 'name email').lean();
    return res.status(200).json({ message: 'Blog updated successfully', data: saved });
  } catch (error) {
    console.error('Error updating blog:', error);
    return res.status(500).json({ error: 'Failed to update blog', details: error.message });
  }
});

// DELETE - Delete blog
router.delete('/:id', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ error: 'Blog not found' });
    }

    if (!['reviewer', 'content_access_manager'].includes(req.user.role) && blog.writtenBy && blog.writtenBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this blog' });
    }

    await Blog.findByIdAndDelete(req.params.id);
    return res.status(200).json({ message: 'Blog deleted successfully' });
  } catch (error) {
    console.error('Error deleting blog:', error);
    return res.status(500).json({ error: 'Failed to delete blog' });
  }
});

// POST - Submit blog for approval
router.post('/submit/:id', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ error: 'Blog not found' });
    }

    if (req.user.role !== 'reviewer' && req.user.role !== 'content_access_manager' && blog.writtenBy && blog.writtenBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!['DRAFT', 'REJECTED'].includes(blog.status)) {
      return res.status(400).json({ error: 'Blog cannot be submitted for approval in current status: ' + blog.status });
    }

    blog.status = 'PENDING_APPROVAL';
    blog.rejectedReason = null;
    await blog.save();

    return res.status(200).json({ message: 'Blog submitted for approval', data: blog });
  } catch (error) {
    console.error('Error submitting blog:', error);
    return res.status(500).json({ error: 'Failed to submit blog' });
  }
});

module.exports = router;
