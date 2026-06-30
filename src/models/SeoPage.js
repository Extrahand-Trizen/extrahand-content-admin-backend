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
  serviceSolutions: [{ title: String, description: String }],
  whyExtrahandHeading: { type: String, default: null },
  whyExtrahandDescription: { type: String, default: null },
  whyExtrahand: [String],
  whyExtrahandDescription2: { type: String, default: null },
  howItWorks: [{ step: Number, title: String, description: String }],
  benefitsHeading: { type: String, default: null },
  benefits: [String],
  commonProblemsHeading: { type: String, default: null },
  commonProblems: [String],

  faqs: [{ question: String, answer: String }],

  faqSchema: { type: Object },
  breadcrumbSchema: { type: Object },

  status: {
    type: String,
    enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REJECTED'],
    default: 'DRAFT',
  },
  isPublished: { type: Boolean, default: false },

  writtenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedReason: { type: String, default: null },

  originalPageId: { type: mongoose.Schema.Types.ObjectId, ref: 'SeoPage', default: null },
  isCurrentVersion: { type: Boolean, default: true },
}, { timestamps: true });

seoPageSchema.index({ cityId: 1, areaId: 1, categorySlug: 1 });
seoPageSchema.index({ isPublished: 1 });

module.exports = mongoose.model('SeoPage', seoPageSchema);
