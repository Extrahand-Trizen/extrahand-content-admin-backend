const mongoose = require('mongoose');

const seoPageSchema = new mongoose.Schema({
  pageType: { type: String, enum: ['city', 'area'], required: true },

  categoryName: { type: String, required: true },
  categorySlug: { type: String, required: true },

  cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
  cityName: { type: String, required: true },
  citySlug: { type: String, required: true },

  areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', default: null },
  areaName: { type: String, default: null },
  areaSlug: { type: String, default: null },

  slug: { type: String, required: true, unique: true },
  canonicalUrl: { type: String },

  metaTitle: { type: String, required: true },
  metaDescription: { type: String, required: true },

  heroHeading: { type: String, required: true },
  heroHeading2: { type: String, default: null },
  heroDescription: { type: String, required: true },
  heroImage: { type: String, default: null },

  whyChooseHeading: { type: String, default: null },
  whyChooseDescription: { type: String, default: null },
  whyChoose: [{ label: String, description: String }],
  serviceSolutionsHeading: { type: String, default: null },
  serviceSolutionsHeading2: { type: String, default: null },
  serviceSolutions: [{ title: String, description: String }],
  whyExtrahandHeading: { type: String, default: null },
  whyExtrahandDescription: { type: String, default: null },
  whyExtrahand: [String],
  whyExtrahandDescription2: { type: String, default: null },
  whyExtrahandBenefitsIncludedHeading: { type: String, default: null },
  whyExtrahandBenefitsIncluded: [String],
  whyExtrahandBenefitsIncludedDescription: { type: String, default: null },
  howItWorks: [{ step: Number, title: String, description: String }],
  benefitsHeading: { type: String, default: null },
  benefitsDescription: { type: String, default: null },
  benefitsOnlyPoints: { type: Boolean, default: false },
  benefits: [String],
  commonProblemsHeading: { type: String, default: null },
  commonProblems: [String],
  benefitsIncludedHeading: { type: String, default: null },
  benefitsIncluded: [String],
  benefitsIncludedDescription: { type: String, default: null },

  faqs: [{ question: String, answer: String }],

  faqSchema: { type: Object },
  breadcrumbSchema: { type: Object },

  status: {
    type: String,
    enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'UNPUBLISHED', 'REJECTED', 'ARCHIVED'],
    default: 'DRAFT',
  },
  isPublished: { type: Boolean, default: false },

  writtenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedReason: { type: String, default: null },

  originalPageId: { type: mongoose.Schema.Types.ObjectId, ref: 'SeoPage', default: null },
  isCurrentVersion: { type: Boolean, default: true },
}, { timestamps: true });

seoPageSchema.index({ createdAt: -1 });
seoPageSchema.index({ cityId: 1, areaId: 1, categorySlug: 1 });
seoPageSchema.index({ isPublished: 1 });
// Hot portal list / dashboard / writer filters
seoPageSchema.index({ status: 1, createdAt: -1 });
seoPageSchema.index({ writtenBy: 1, status: 1, createdAt: -1 });
seoPageSchema.index({ pageType: 1, status: 1, createdAt: -1 });
seoPageSchema.index({ categorySlug: 1, status: 1 });
seoPageSchema.index({ slug: 1, status: 1, isPublished: 1, isCurrentVersion: 1 });

module.exports = mongoose.model('SeoPage', seoPageSchema);
