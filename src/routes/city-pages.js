const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const CityPage = require('../models/CityPage');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/roles');
const { sanitizeHtml } = require('../utils/htmlSanitizer');

const router = express.Router();
const adminRouter = express.Router();
const REVIEWER_ROLES = ['reviewer', 'content_access_manager'];
const CITY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value) => typeof value === 'string';
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CITY_PAGE_LIST_FIELDS = 'pageType citySlug cityName status isPublished isCurrentPublished version versionGroupId originalPageId previousVersionId writtenBy reviewedBy rejectedReason publishedAt createdAt updatedAt';
const DEFAULT_WEBSITE_URL = process.env.NODE_ENV === 'development'
  ? 'http://localhost:4000'
  : 'https://extrahand.in';

async function revalidatePublishedCityPage(citySlug) {
  const secret = process.env.CITY_PAGE_REVALIDATION_SECRET;
  if (!secret) {
    return {
      success: false,
      message: 'CITY_PAGE_REVALIDATION_SECRET is not configured on the backend',
    };
  }

  const websiteUrl = (process.env.WEBSITE_URL || DEFAULT_WEBSITE_URL).replace(/\/+$/, '');
  const endpoint = process.env.CITY_PAGE_REVALIDATION_URL
    || `${websiteUrl}/api/city-pages/revalidate`;

  try {
    const response = await axios.post(
      endpoint,
      { citySlug },
      {
        headers: { Authorization: `Bearer ${secret}` },
        timeout: 10000,
      },
    );
    if (response.data?.revalidated !== true) {
      throw new Error('Website did not confirm City Page cache revalidation');
    }
    return { success: true };
  } catch (error) {
    const message = error.response?.data?.error || error.message || 'Unknown revalidation error';
    console.error(`Failed to revalidate published City Page "${citySlug}":`, message);
    return {
      success: false,
      message,
    };
  }
}

function normalizeContent(content) {
  if (!isRecord(content)) return { error: 'content must be an object' };

  const errors = [];
  const section = (value, name, fields) => {
    if (!isRecord(value)) {
      errors.push(`${name} must be an object`);
      return {};
    }
    const result = {};
    for (const field of fields) {
      if (!isString(value[field])) errors.push(`${name}.${field} must be a string`);
      else result[field] = value[field];
    }
    return result;
  };
  const list = (value, name, fields, htmlField, allowEmptyFields = []) => {
    if (!Array.isArray(value)) {
      errors.push(`${name} must be an array`);
      return [];
    }
    return value.map((item, index) => {
      if (!isRecord(item)) {
        errors.push(`${name}[${index}] must be an object`);
        return {};
      }
      const result = {};
      for (const field of fields) {
        if (!isString(item[field]) || (!allowEmptyFields.includes(field) && !item[field].trim())) {
          errors.push(`${name}[${index}].${field} must be a${allowEmptyFields.includes(field) ? '' : ' non-empty'} string`);
        }
        else result[field] = item[field];
      }
      if (htmlField) {
        if (!isString(item[htmlField])) errors.push(`${name}[${index}].${htmlField} must be a string`);
        else result[htmlField] = sanitizeHtml(item[htmlField]);
      }
      return result;
    });
  };

  const result = {
    hero: section(content.hero, 'hero', ['title', 'heading', 'description', 'image']),
    popularServices: section(content.popularServices, 'popularServices', ['title', 'subtitle']),
    howItWorks: section(content.howItWorks, 'howItWorks', ['title', 'description']),
    stats: section(content.stats, 'stats', ['title']),
    neighborhoods: section(content.neighborhoods, 'neighborhoods', [
      'title',
      'description',
      'popularAreasHeading',
      'otherAreasHeading',
    ]),
    exploreServices: section(content.exploreServices, 'exploreServices', ['title', 'subtitle']),
    seo: section(content.seo, 'seo', ['metaTitle', 'metaDescription', 'canonicalUrl', 'ogTitle', 'ogDescription']),
    seoContentBlocks: list(content.seoContentBlocks, 'seoContentBlocks', ['id', 'title'], 'html', ['title']),
  };
  result.popularServices.items = list(content.popularServices?.items, 'popularServices.items', ['id', 'name', 'description']);
  result.howItWorks.steps = list(content.howItWorks?.steps, 'howItWorks.steps', ['id', 'title', 'description']);
  result.neighborhoods.areas = list(content.neighborhoods?.areas, 'neighborhoods.areas', ['id', 'name']);
  result.exploreServices.items = list(content.exploreServices?.items, 'exploreServices.items', ['id', 'title', 'description']);
  result.seoContentBlocks = result.seoContentBlocks.map((block, index) => {
    const source = content.seoContentBlocks[index];
    if (!isRecord(source)) return block;
    const type = source.type === undefined ? 'content' : source.type;
    if (!['content', 'faq'].includes(type)) errors.push(`seoContentBlocks[${index}].type must be content or faq`);
    if (type !== 'faq') return { ...block, type: 'content' };

    if (!Array.isArray(source.faqs)) {
      errors.push(`seoContentBlocks[${index}].faqs must be an array`);
      return { ...block, type: 'faq', faqs: [] };
    }
    if (source.faqs.length === 0) {
      errors.push(`seoContentBlocks[${index}].faqs must contain at least one question`);
    }
    const faqs = source.faqs.map((faq, faqIndex) => {
      if (!isRecord(faq)) {
        errors.push(`seoContentBlocks[${index}].faqs[${faqIndex}] must be an object`);
        return {};
      }
      const resultFaq = {};
      for (const field of ['id', 'question', 'answer']) {
        if (!isString(faq[field]) || !faq[field].trim()) {
          errors.push(`seoContentBlocks[${index}].faqs[${faqIndex}].${field} must be a non-empty string`);
        } else {
          resultFaq[field] = faq[field];
        }
      }
      return resultFaq;
    });
    return { ...block, type: 'faq', faqs };
  });

  const expectedSectionOrder = [
    'hero',
    'popularServices',
    'howItWorks',
    'stats',
    'neighborhoods',
    ...result.seoContentBlocks.map((block) => `seo:${block.id}`),
    'exploreServices',
  ];
  const sectionOrder = content.sectionOrder === undefined
    ? expectedSectionOrder
    : content.sectionOrder;
  if (!Array.isArray(sectionOrder) || !sectionOrder.every(isString)) {
    errors.push('sectionOrder must be an array of section keys');
  } else {
    const expectedKeys = new Set(expectedSectionOrder);
    if (
      sectionOrder.length !== expectedSectionOrder.length
      || new Set(sectionOrder).size !== sectionOrder.length
      || sectionOrder.some((key) => !expectedKeys.has(key))
    ) {
      errors.push('sectionOrder must contain each supported section exactly once');
    } else {
      result.sectionOrder = sectionOrder;
    }
  }

  return errors.length ? { error: errors.join('; ') } : { content: result };
}

function validateCityPayload(body) {
  if (!isRecord(body)) return { error: 'Request body must be an object' };
  if (!isString(body.citySlug) || !CITY_SLUG_PATTERN.test(body.citySlug)) {
    return { error: 'citySlug must be a safe lowercase slug (letters, numbers, and single hyphens)' };
  }
  if (!isString(body.cityName) || !body.cityName.trim()) return { error: 'cityName is required' };
  const normalized = normalizeContent(body.content);
  if (normalized.error) return normalized;
  return { citySlug: body.citySlug, cityName: body.cityName.trim(), content: normalized.content };
}

function hasWriterAccess(page, req, res) {
  if (req.user.role === 'writer' && String(page.writtenBy) !== String(req.user._id)) {
    res.status(403).json({ error: 'Not authorized to access this city page' });
    return false;
  }
  return true;
}

async function getPage(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return CityPage.findById(id);
}

router.get('/published', async (req, res) => {
  try {
    const citySlug = req.query.citySlug;
    if (!isString(citySlug) || !CITY_SLUG_PATTERN.test(citySlug)) {
      return res.status(400).json({ error: 'A valid citySlug is required' });
    }
    const page = await CityPage.findOne({
      citySlug,
      status: 'PUBLISHED',
      isPublished: true,
      isCurrentPublished: true,
    }).sort({ publishedAt: -1, version: -1 }).lean();
    if (!page) return res.status(404).json({ error: 'Published city page not found' });
    return res.status(200).json(page);
  } catch (error) {
    console.error('Error fetching published city page:', error);
    return res.status(500).json({ error: 'Failed to fetch published city page' });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const { search, status, page, limit, groupByCitySlug } = req.query;
    const filter = {};
    if (req.user.role === 'writer') filter.writtenBy = req.user._id;
    if (status && status !== 'all') {
      filter.status = String(status).includes(',')
        ? { $in: String(status).split(',').map((value) => value.trim()).filter(Boolean) }
        : status;
    }
    if (search && String(search).trim()) {
      const term = escapeRegex(String(search).trim());
      filter.$or = [
        { cityName: { $regex: term, $options: 'i' } },
        { citySlug: { $regex: term, $options: 'i' } },
        { 'content.seo.metaTitle': { $regex: term, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;
    const grouped = groupByCitySlug === 'true' || groupByCitySlug === '1';
    const sort = { citySlug: 1, version: -1, createdAt: -1 };
    let data;
    let total;
    if (grouped) {
      const citySlugs = (await CityPage.distinct('citySlug', filter)).sort();
      total = citySlugs.length;
      const pageSlugs = citySlugs.slice(skip, skip + limitNum);
      const pages = pageSlugs.length
        ? await CityPage.find({ ...filter, citySlug: { $in: pageSlugs } })
          .select(CITY_PAGE_LIST_FIELDS)
          .populate('writtenBy', 'name email role')
          .populate('reviewedBy', 'name email role')
          .sort(sort)
          .lean()
        : [];
      const groups = new Map();
      for (const cityPage of pages) {
        if (!groups.has(cityPage.citySlug)) {
          groups.set(cityPage.citySlug, { citySlug: cityPage.citySlug, cityName: cityPage.cityName, versions: [] });
        }
        groups.get(cityPage.citySlug).versions.push(cityPage);
      }
      data = Array.from(groups.values()).map((group) => {
        const selectedVersion = group.versions.find((version) => ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'].includes(version.status))
          || group.versions.find((version) => version.status === 'PUBLISHED' && version.isCurrentPublished)
          || null;
        return { ...group, selectedVersion };
      });
    } else {
      const result = await Promise.all([
        CityPage.find(filter)
          .select(CITY_PAGE_LIST_FIELDS)
          .populate('writtenBy', 'name email role')
          .populate('reviewedBy', 'name email role')
          .sort(sort)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        CityPage.countDocuments(filter),
      ]);
      data = result[0];
      total = result[1];
    }
    return res.status(200).json({
      data,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) || 1 },
    });
  } catch (error) {
    console.error('Error fetching city pages:', error);
    return res.status(500).json({ error: 'Failed to fetch city pages' });
  }
});

router.post('/', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const validated = validateCityPayload(req.body);
    if (validated.error) return res.status(400).json({ error: validated.error });
    let source = null;
    if (req.body.originalPageId !== undefined && req.body.originalPageId !== null && req.body.originalPageId !== '') {
      source = await getPage(String(req.body.originalPageId));
      if (!source) return res.status(404).json({ error: 'Original city page not found' });
      if (!['PUBLISHED', 'APPROVED'].includes(source.status)) {
        return res.status(400).json({ error: 'originalPageId must refer to a published or approved city page' });
      }
      if (!hasWriterAccess(source, req, res)) return;
      if (source.citySlug !== validated.citySlug) {
        return res.status(400).json({ error: 'Edited city page must retain the original citySlug' });
      }
    }
    const versionGroupId = source ? (source.versionGroupId || source._id) : new mongoose.Types.ObjectId();
    const latest = source
      ? await CityPage.findOne({ versionGroupId }).sort({ version: -1 }).select('version')
      : null;
    const page = await CityPage.create({
      ...validated,
      pageType: 'city-page',
      status: 'DRAFT',
      isPublished: false,
      isCurrentPublished: false,
      version: source ? (latest?.version || source.version || 1) + 1 : 1,
      versionGroupId,
      originalPageId: source ? source._id : null,
      previousVersionId: source ? source._id : null,
      writtenBy: req.user._id,
    });
    return res.status(201).json({ message: 'City page saved as draft', data: page });
  } catch (error) {
    console.error('Error creating city page:', error);
    return res.status(500).json({ error: 'Failed to create city page' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const page = await getPage(req.params.id);
    if (!page) return res.status(404).json({ error: 'City page not found' });
    if (!hasWriterAccess(page, req, res)) return;
    return res.status(200).json({ data: page });
  } catch (error) {
    console.error('Error fetching city page:', error);
    return res.status(500).json({ error: 'Failed to fetch city page' });
  }
});

router.put('/:id', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const existing = await getPage(req.params.id);
    if (!existing) return res.status(404).json({ error: 'City page not found' });
    if (!hasWriterAccess(existing, req, res)) return;
    const validated = validateCityPayload(req.body);
    if (validated.error) return res.status(400).json({ error: validated.error });
    if (!['DRAFT', 'PENDING_APPROVAL', 'REJECTED'].includes(existing.status)) {
      return res.status(400).json({ error: `City page cannot be edited in current status: ${existing.status}` });
    }

    let page = existing;
    page.citySlug = validated.citySlug;
    page.cityName = validated.cityName;
    page.content = validated.content;
    page.status = 'DRAFT';
    page.isPublished = false;
    page.isCurrentPublished = false;
    page.reviewedBy = null;
    page.reviewedAt = null;
    page.rejectedReason = null;
    await page.save();
    return res.status(200).json({ message: 'City page saved as draft', data: page });
  } catch (error) {
    console.error('Error updating city page:', error);
    return res.status(500).json({ error: 'Failed to update city page' });
  }
});

router.post('/submit/:id', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const page = await getPage(req.params.id);
    if (!page) return res.status(404).json({ error: 'City page not found' });
    if (!hasWriterAccess(page, req, res)) return;
    if (!['DRAFT', 'REJECTED'].includes(page.status)) {
      return res.status(400).json({ error: `City page cannot be submitted in current status: ${page.status}` });
    }
    page.status = 'PENDING_APPROVAL';
    page.rejectedReason = null;
    await page.save();
    return res.status(200).json({ message: 'City page submitted for approval', data: page });
  } catch (error) {
    console.error('Error submitting city page:', error);
    return res.status(500).json({ error: 'Failed to submit city page' });
  }
});

adminRouter.use(authenticate, allowRoles(...REVIEWER_ROLES));

adminRouter.post('/:id/approve', async (req, res) => {
  try {
    const page = await getPage(req.params.id);
    if (!page) return res.status(404).json({ error: 'City page not found' });
    if (page.status !== 'PENDING_APPROVAL') return res.status(400).json({ error: `City page cannot be approved in current status: ${page.status}` });
    page.status = 'APPROVED';
    page.reviewedBy = req.user._id;
    page.reviewedAt = new Date();
    page.rejectedReason = null;
    await page.save();
    return res.status(200).json({ message: 'City page approved successfully', data: page });
  } catch (error) {
    console.error('Error approving city page:', error);
    return res.status(500).json({ error: 'Failed to approve city page' });
  }
});

adminRouter.post('/:id/reject', async (req, res) => {
  try {
    const reason = req.body?.reason;
    if (!isString(reason) || !reason.trim()) return res.status(400).json({ error: 'reason is required' });
    const page = await getPage(req.params.id);
    if (!page) return res.status(404).json({ error: 'City page not found' });
    if (page.status !== 'PENDING_APPROVAL') return res.status(400).json({ error: `City page cannot be rejected in current status: ${page.status}` });
    page.status = 'REJECTED';
    page.reviewedBy = req.user._id;
    page.reviewedAt = new Date();
    page.rejectedReason = reason.trim();
    await page.save();
    return res.status(200).json({ message: 'City page rejected successfully', data: page });
  } catch (error) {
    console.error('Error rejecting city page:', error);
    return res.status(500).json({ error: 'Failed to reject city page' });
  }
});

adminRouter.post('/:id/publish', async (req, res) => {
  try {
    const page = await getPage(req.params.id);
    if (!page) return res.status(404).json({ error: 'City page not found' });
    if (!['APPROVED', 'UNPUBLISHED'].includes(page.status)) {
      return res.status(400).json({ error: `City page cannot be published in current status: ${page.status}` });
    }
    const now = new Date();
    page.status = 'PUBLISHED';
    page.isPublished = true;
    page.isCurrentPublished = true;
    page.publishedAt = now;
    page.publishedBy = req.user._id;
    await page.save();
    await CityPage.updateMany(
      { citySlug: page.citySlug, _id: { $ne: page._id }, isCurrentPublished: true },
      { $set: { status: 'ARCHIVED', isPublished: false, isCurrentPublished: false } }
    );
    const revalidation = await revalidatePublishedCityPage(page.citySlug);
    return res.status(200).json({
      message: 'City page published successfully',
      data: page,
      revalidation,
    });
  } catch (error) {
    console.error('Error publishing city page:', error);
    return res.status(500).json({ error: 'Failed to publish city page' });
  }
});

adminRouter.post('/:id/unpublish', async (req, res) => {
  try {
    const page = await getPage(req.params.id);
    if (!page) return res.status(404).json({ error: 'City page not found' });
    if (page.status !== 'PUBLISHED' || !page.isCurrentPublished) {
      return res.status(400).json({ error: `City page cannot be unpublished in current status: ${page.status}` });
    }
    page.status = 'UNPUBLISHED';
    page.isPublished = false;
    page.isCurrentPublished = false;
    await page.save();
    return res.status(200).json({ message: 'City page unpublished successfully', data: page });
  } catch (error) {
    console.error('Error unpublishing city page:', error);
    return res.status(500).json({ error: 'Failed to unpublish city page' });
  }
});

adminRouter.post('/:id/unapprove', async (req, res) => {
  try {
    const page = await getPage(req.params.id);
    if (!page) return res.status(404).json({ error: 'City page not found' });
    if (!['APPROVED', 'UNPUBLISHED'].includes(page.status)) {
      return res.status(400).json({ error: `City page cannot be unapproved in current status: ${page.status}` });
    }
    page.status = 'DRAFT';
    page.isPublished = false;
    page.isCurrentPublished = false;
    page.reviewedBy = null;
    page.reviewedAt = null;
    await page.save();
    return res.status(200).json({ message: 'City page unapproved successfully', data: page });
  } catch (error) {
    console.error('Error unapproving city page:', error);
    return res.status(500).json({ error: 'Failed to unapprove city page' });
  }
});

router.adminRouter = adminRouter;
module.exports = router;
