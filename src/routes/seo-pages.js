const express = require('express');
const router = express.Router();
const SeoPage = require('../models/SeoPage');
const City = require('../models/City');
const Area = require('../models/Area');
const authenticate = require('../middleware/auth');
const optionalAuth = require('../middleware/auth').optionalAuth;
const allowRoles = require('../middleware/roles');
const {
  generateSlug,
  generateCanonicalUrl,
  generateFaqSchema,
  generateBreadcrumbSchema,
  replaceLocationName,
} = require('../utils/seoPageUtils');

// Known city slugs from DEFAULT_CITIES in the frontend — used for auto-creation
const KNOWN_CITY_NAMES = {
  hyderabad: 'Hyderabad', bangalore: 'Bangalore', mumbai: 'Mumbai',
  delhi: 'Delhi', chennai: 'Chennai', pune: 'Pune', kolkata: 'Kolkata',
  ahmedabad: 'Ahmedabad', surat: 'Surat', jaipur: 'Jaipur',
  noida: 'Noida', gurugram: 'Gurugram',
};

// Known area slugs per city — used for auto-creation when slug-string IDs are passed
const KNOWN_AREA_NAMES = {
  // Hyderabad
  'ameerpet': { name: 'Ameerpet', citySlug: 'hyderabad' },
  'banjara-hills': { name: 'Banjara Hills', citySlug: 'hyderabad' },
  'begumpet': { name: 'Begumpet', citySlug: 'hyderabad' },
  'gachibowli': { name: 'Gachibowli', citySlug: 'hyderabad' },
  'hitec-city': { name: 'Hitec City', citySlug: 'hyderabad' },
  'jubilee-hills': { name: 'Jubilee Hills', citySlug: 'hyderabad' },
  'kondapur': { name: 'Kondapur', citySlug: 'hyderabad' },
  'kukatpally': { name: 'Kukatpally', citySlug: 'hyderabad' },
  'madhapur': { name: 'Madhapur', citySlug: 'hyderabad' },
  'miyapur': { name: 'Miyapur', citySlug: 'hyderabad' },
  'secunderabad': { name: 'Secunderabad', citySlug: 'hyderabad' },
  'uppal': { name: 'Uppal', citySlug: 'hyderabad' },
};

/**
 * Returns true if value is a valid 24-character hex MongoDB ObjectId.
 * Uses a simple regex — never throws, unlike new mongoose.Types.ObjectId().
 */
function isMongoObjectId(value) {
  return /^[a-f\d]{24}$/i.test(value);
}

/**
 * Look up a city by MongoDB ObjectId OR by slug.
 * If the city doesn't exist but the value is a known city slug, auto-create it.
 * This supports the DEFAULT_CITIES fallback in the frontend where _id values
 * are slug strings (e.g. "hyderabad") rather than real MongoDB ObjectIds.
 */
async function findCityByIdOrSlug(value) {
  if (!value) return null;
  if (isMongoObjectId(value)) {
    const city = await City.findById(value);
    if (city) return city;
  }
  // Fallback: treat value as a slug
  let city = await City.findOne({ slug: value });
  if (!city && KNOWN_CITY_NAMES[value]) {
    // Auto-create the city so DEFAULT_CITIES work without pre-seeding
    city = await City.create({ name: KNOWN_CITY_NAMES[value], slug: value });
  }
  return city;
}

/**
 * Look up an area by MongoDB ObjectId OR by slug.
 * If the area doesn't exist but the slug is known, auto-create it (and its city if needed).
 */
async function findAreaByIdOrSlug(value, cityDoc) {
  if (!value) return null;
  if (isMongoObjectId(value)) {
    const area = await Area.findById(value);
    if (area) return area;
  }
  // Fallback: treat value as a slug
  let area = await Area.findOne({ slug: value });
  if (!area && KNOWN_AREA_NAMES[value]) {
    // Auto-create the area using known metadata
    const meta = KNOWN_AREA_NAMES[value];
    // Find or create the city this area belongs to
    let city = cityDoc;
    if (!city) {
      city = await City.findOne({ slug: meta.citySlug });
      if (!city) {
        city = await City.create({ name: KNOWN_CITY_NAMES[meta.citySlug] || meta.citySlug, slug: meta.citySlug });
      }
    }
    area = await Area.create({ name: meta.name, slug: value, cityId: city._id });
  }
  // For fully custom areas passed as a slug string not in KNOWN_AREA_NAMES,
  // auto-create them using the name derived from the slug
  if (!area && value && !isMongoObjectId(value)) {
    const cityRef = cityDoc;
    if (cityRef) {
      const derivedName = value.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      area = await Area.create({ name: derivedName, slug: value, cityId: cityRef._id });
    }
  }
  return area;
}

// GET - List SEO pages (authenticated, with filters and pagination)
router.get('/', authenticate, async (req, res) => {
  try {
    const { pageType, cityId, status, categorySlug, search, page, limit, slug } = req.query;
    const filter = {};
    if (req.user && req.user.role === 'writer') {
      filter.writtenBy = req.user._id;
    }
    if (pageType) filter.pageType = pageType;
    if (cityId) filter.cityId = cityId;
    if (slug) filter.slug = slug;
    if (status) {
      if (status.includes(',')) {
        filter.status = { $in: status.split(',') };
      } else {
        filter.status = status;
      }
    }
    if (categorySlug) filter.categorySlug = categorySlug;
    if (search) {
      filter.$or = [
        { categoryName: { $regex: search, $options: 'i' } },
        { cityName: { $regex: search, $options: 'i' } },
        { areaName: { $regex: search, $options: 'i' } },
        { metaTitle: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Table lists only need summary fields. Slug lookups (seo-preview) need the full doc.
    const SEO_LIST_FIELDS = [
      'pageType',
      'categoryName',
      'categorySlug',
      'cityId',
      'cityName',
      'citySlug',
      'areaId',
      'areaName',
      'areaSlug',
      'slug',
      'status',
      'isPublished',
      'isCurrentVersion',
      'originalPageId',
      'metaTitle',
      'metaDescription',
      'writtenBy',
      'rejectedReason',
      'createdAt',
      'updatedAt',
    ].join(' ');

    let listQuery = SeoPage.find(filter)
      .populate('writtenBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    if (!slug) {
      listQuery = listQuery.select(SEO_LIST_FIELDS);
    }

    const [pages, total] = await Promise.all([
      listQuery,
      SeoPage.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: pages,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('Error fetching SEO pages:', error);
    return res.status(500).json({ error: 'Failed to fetch SEO pages' });
  }
});

// GET - Get published page by slug (public, used by website)
// Only returns the current published version — never DRAFT, PENDING_APPROVAL, APPROVED, or UNPUBLISHED
router.get('/published', async (req, res) => {
  try {
    const { slug } = req.query;
    if (!slug) {
      return res.status(400).json({ error: 'Slug is required' });
    }
    const page = await SeoPage.findOne({
      slug,
      status: 'PUBLISHED',
      isPublished: true,
      isCurrentVersion: true,
    }).lean();
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    return res.status(200).json(page);
  } catch (error) {
    console.error('Error fetching published SEO page:', error);
    return res.status(500).json({ error: 'Failed to fetch page' });
  }
});

// GET - Get city template (published/approved city page for pre-filling area form)
router.get('/city-template', authenticate, async (req, res) => {
  try {
    const { categorySlug, cityId } = req.query;
    if (!categorySlug || !cityId) {
      return res.status(400).json({ error: 'categorySlug and cityId are required' });
    }
    const template = await SeoPage.findOne({
      pageType: 'city',
      categorySlug,
      cityId,
      status: { $in: ['PUBLISHED', 'APPROVED'] },
      isCurrentVersion: true,
    }).lean();
    if (!template) {
      return res.status(404).json({ error: 'City template not found' });
    }
    return res.status(200).json(template);
  } catch (error) {
    console.error('Error fetching city template:', error);
    return res.status(500).json({ error: 'Failed to fetch city template' });
  }
});

// GET - Get single SEO page by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const page = await SeoPage.findById(req.params.id).populate('writtenBy', 'name email').lean();
    if (!page) {
      return res.status(404).json({ error: 'SEO page not found' });
    }
    if (!['reviewer', 'content_access_manager'].includes(req.user.role)) {
      const writtenById = page.writtenBy?._id || page.writtenBy;
      if (writtenById && writtenById.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Not authorized to view this page' });
      }
    }
    return res.status(200).json(page);
  } catch (error) {
    console.error('Error fetching SEO page:', error);
    return res.status(500).json({ error: 'Failed to fetch SEO page' });
  }
});

// POST - Create SEO page
router.post('/', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const body = req.body;
    const { pageType, categoryName, categorySlug, cityId, areaId, heroHeading, heroHeading2, heroDescription, heroImage, metaTitle, metaDescription } = body;

    // Identify exactly which required fields are missing
    const missingFields = [];
    if (!pageType) missingFields.push('pageType');
    if (!categoryName) missingFields.push('categoryName');
    if (!categorySlug) missingFields.push('categorySlug');
    if (!cityId) missingFields.push('cityId');
    if (!heroHeading) missingFields.push('heroHeading');
    if (!heroDescription) missingFields.push('heroDescription');
    if (!metaTitle) missingFields.push('metaTitle');
    if (!metaDescription) missingFields.push('metaDescription');

    if (missingFields.length > 0) {
      console.log('Missing fields:', missingFields, '| Received keys:', Object.keys(body));
      return res.status(400).json({ error: `Required fields missing: ${missingFields.join(', ')}` });
    }

    if (pageType === 'area' && !areaId) {
      return res.status(400).json({ error: 'areaId is required for area pages' });
    }

    const city = await findCityByIdOrSlug(cityId);
    if (!city) {
      return res.status(404).json({ error: `City not found for identifier: ${cityId}. Please ensure cities are seeded in the database.` });
    }

    let area = null;
    if (areaId) {
      area = await findAreaByIdOrSlug(areaId, city);
      if (!area) {
        return res.status(404).json({ error: 'Area not found' });
      }
    }

    const slug = generateSlug(categorySlug, city.slug, area ? area.slug : null);
    const existing = await SeoPage.findOne({ slug });
    if (existing) {
      return res.status(409).json({ error: 'SEO page with this slug already exists' });
    }

    const canonicalUrl = generateCanonicalUrl(pageType, city.slug, area ? area.slug : null, slug);
    const faqSchema = generateFaqSchema(body.faqs || []);
    const breadcrumbSchema = generateBreadcrumbSchema(
      pageType, city.name, city.slug,
      area ? area.name : null, area ? area.slug : null,
      categoryName, slug
    );

    // Replace location name in content fields if area
    let contentData = { ...body };
    if (pageType === 'area' && area) {
      const fieldsToReplace = [
        'heroHeading', 'heroHeading2', 'heroDescription', 'metaTitle', 'metaDescription',
        'whyChooseHeading', 'whyChooseDescription', 'whyChoose', 'serviceSolutionsHeading', 'serviceSolutionsHeading2', 'serviceSolutions',
        'whyExtrahandHeading', 'whyExtrahandDescription', 'whyExtrahand', 'whyExtrahandDescription2', 'whyExtrahandBenefitsIncludedHeading', 'whyExtrahandBenefitsIncluded', 'whyExtrahandBenefitsIncludedDescription', 'howItWorks', 'faqs',
        'benefitsHeading', 'benefitsDescription', 'benefits', 'commonProblemsHeading', 'commonProblems',
        'benefitsIncludedHeading', 'benefitsIncluded', 'benefitsIncludedDescription',
      ];
      for (const field of fieldsToReplace) {
        if (contentData[field]) {
          contentData[field] = replaceLocationName(contentData[field], city.name, area.name);
        }
      }
    }

    const pageData = {
      pageType,
      categoryName,
      categorySlug,
      cityId: city._id,
      cityName: city.name,
      citySlug: city.slug,
      areaId: area ? area._id : null,
      areaName: area ? area.name : null,
      areaSlug: area ? area.slug : null,
      slug,
      canonicalUrl,
      metaTitle: contentData.metaTitle,
      metaDescription: contentData.metaDescription,
      heroHeading: contentData.heroHeading,
      heroHeading2: contentData.heroHeading2 || null,
      heroDescription: contentData.heroDescription,
      heroImage: contentData.heroImage || null,
      whyChooseHeading: contentData.whyChooseHeading || null,
      whyChooseDescription: contentData.whyChooseDescription || null,
      whyChoose: contentData.whyChoose || [],
      serviceSolutionsHeading: contentData.serviceSolutionsHeading || null,
      serviceSolutionsHeading2: contentData.serviceSolutionsHeading2 || null,
      serviceSolutions: contentData.serviceSolutions || [],
      whyExtrahandHeading: contentData.whyExtrahandHeading || null,
      whyExtrahandDescription: contentData.whyExtrahandDescription || null,
      whyExtrahand: contentData.whyExtrahand || [],
      whyExtrahandDescription2: contentData.whyExtrahandDescription2 || null,
      whyExtrahandBenefitsIncludedHeading: contentData.whyExtrahandBenefitsIncludedHeading || null,
      whyExtrahandBenefitsIncluded: contentData.whyExtrahandBenefitsIncluded || [],
      whyExtrahandBenefitsIncludedDescription: contentData.whyExtrahandBenefitsIncludedDescription || null,
      howItWorks: contentData.howItWorks || [],
      benefitsHeading: contentData.benefitsHeading || null,
      benefitsDescription: contentData.benefitsDescription || null,
      benefitsOnlyPoints: contentData.benefitsOnlyPoints === true || contentData.benefitsOnlyPoints === 'true',
      benefits: contentData.benefits || [],
      commonProblemsHeading: contentData.commonProblemsHeading || null,
      commonProblems: contentData.commonProblems || [],
      benefitsIncludedHeading: contentData.benefitsIncludedHeading || null,
      benefitsIncluded: contentData.benefitsIncluded || [],
      benefitsIncludedDescription: contentData.benefitsIncludedDescription || null,
      faqs: contentData.faqs || [],
      faqSchema,
      breadcrumbSchema,
      status: 'DRAFT',
      isPublished: false,
      writtenBy: req.user._id,
    };

    const page = await SeoPage.create(pageData);
    const saved = await SeoPage.findById(page._id).populate('writtenBy', 'name email').lean();

    return res.status(201).json({ message: 'SEO page created as draft', data: saved });
  } catch (error) {
    console.error('Error creating SEO page:', error);
    return res.status(500).json({ error: 'Failed to create SEO page', details: error.message });
  }
});

// PUT - Update SEO page
router.put('/:id', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const existing = await SeoPage.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'SEO page not found' });
    }
    if (!['reviewer', 'content_access_manager'].includes(req.user.role) && existing.writtenBy && existing.writtenBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to update this page' });
    }

    // Version control: if published, create new draft version
    if (existing.status === 'PUBLISHED') {
      const existingDraft = await SeoPage.findOne({
        originalPageId: existing._id,
        status: { $in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'] },
      });

      if (existingDraft) {
        Object.keys(req.body).forEach((key) => {
          if (key !== '_id' && key !== 'writtenBy' && key !== 'originalPageId' && key !== 'isCurrentVersion') {
            existingDraft[key] = req.body[key];
            existingDraft.markModified(key);
          }
        });
        existingDraft.status = 'DRAFT';
        existingDraft.rejectedReason = null;
        await existingDraft.save();
        return res.status(200).json({ message: 'Draft updated', data: existingDraft, isExistingDraft: true });
      }

      const city = await City.findById(existing.cityId);
      const area = existing.areaId ? await Area.findById(existing.areaId) : null;

      const slug = generateSlug(existing.categorySlug, city.slug, area ? area.slug : null);
      // Drafts need a unique slug to avoid E11000 duplicate key errors
      const draftSlug = `${slug}-draft-${Date.now()}`;
      const canonicalUrl = generateCanonicalUrl(existing.pageType, city.slug, area ? area.slug : null, slug);
      const faqSchema = generateFaqSchema(req.body.faqs || existing.faqs || []);
      const breadcrumbSchema = generateBreadcrumbSchema(
        existing.pageType, city.name, city.slug,
        area ? area.name : null, area ? area.slug : null,
        existing.categoryName, slug
      );

      const newVersion = new SeoPage({
        ...existing.toObject(),
        ...req.body,
        _id: undefined,
        slug: draftSlug,
        canonicalUrl,
        faqSchema,
        breadcrumbSchema,
        status: 'DRAFT',
        isPublished: false,
        writtenBy: req.user._id,
        originalPageId: existing._id,
        isCurrentVersion: false,
        reviewedBy: null,
        rejectedReason: null,
        createdAt: undefined,
        updatedAt: undefined,
      });
      await newVersion.save();

      return res.status(200).json({ message: 'New draft version created', data: newVersion, isNewVersion: true });
    }

    // Direct update for non-published pages
    let updateData = { ...req.body };

    // Re-generate slug and canonical on every update
    const city = await City.findById(existing.cityId);
    const area = existing.areaId ? await Area.findById(existing.areaId) : null;
    const slug = generateSlug(existing.categorySlug, city.slug, area ? area.slug : null);
    const canonicalUrl = generateCanonicalUrl(existing.pageType, city.slug, area ? area.slug : null, slug);
    const faqSchema = generateFaqSchema(updateData.faqs || existing.faqs || []);
    const breadcrumbSchema = generateBreadcrumbSchema(
      existing.pageType, city.name, city.slug,
      area ? area.name : null, area ? area.slug : null,
      existing.categoryName, slug
    );

    updateData.slug = slug;
    updateData.canonicalUrl = canonicalUrl;
    updateData.faqSchema = faqSchema;
    updateData.breadcrumbSchema = breadcrumbSchema;

    // If rejected or pending approval, move back to draft for re-submission
    if (['REJECTED', 'PENDING_APPROVAL'].includes(existing.status) && req.user.role === 'writer') {
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

    const saved = await SeoPage.findById(existing._id).populate('writtenBy', 'name email').lean();
    return res.status(200).json({ message: 'SEO page updated', data: saved });
  } catch (error) {
    console.error('Error updating SEO page:', error);
    return res.status(500).json({ error: 'Failed to update SEO page', details: error.message });
  }
});

// DELETE - Delete SEO page
router.delete('/:id', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const page = await SeoPage.findById(req.params.id);
    if (!page) {
      return res.status(404).json({ error: 'SEO page not found' });
    }
    if (!['reviewer', 'content_access_manager'].includes(req.user.role) && page.writtenBy && page.writtenBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this page' });
    }
    await SeoPage.findByIdAndDelete(req.params.id);
    return res.status(200).json({ message: 'SEO page deleted' });
  } catch (error) {
    console.error('Error deleting SEO page:', error);
    return res.status(500).json({ error: 'Failed to delete SEO page' });
  }
});

// POST - Submit SEO page for approval
router.post('/submit/:id', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const page = await SeoPage.findById(req.params.id);
    if (!page) {
      return res.status(404).json({ error: 'SEO page not found' });
    }
    if (req.user.role !== 'reviewer' && req.user.role !== 'content_access_manager' && page.writtenBy && page.writtenBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (!['DRAFT', 'REJECTED'].includes(page.status)) {
      return res.status(400).json({ error: 'SEO page cannot be submitted for approval' });
    }
    page.status = 'PENDING_APPROVAL';
    page.rejectedReason = null;
    await page.save();
    return res.status(200).json({ message: 'SEO page submitted for approval', data: page });
  } catch (error) {
    console.error('Error submitting SEO page:', error);
    return res.status(500).json({ error: 'Failed to submit SEO page' });
  }
});

module.exports = router;
