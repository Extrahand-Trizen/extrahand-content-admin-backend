const mongoose = require('mongoose');

const blogFaqSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
}, { _id: false });

const blogSchema = new mongoose.Schema({
  pageType: { type: String, default: 'blog' },

  title: { type: String, required: true, trim: true }, // On-page H1
  metaTitle: { type: String, required: true, trim: true },
  metaDescription: { type: String, required: true, trim: true },

  slug: { type: String, required: true, unique: true, trim: true },
  canonicalUrl: { type: String, trim: true },

  category: { type: String, required: true, trim: true },
  categorySlug: { type: String, required: true, trim: true },

  cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', default: null },
  cityName: { type: String, default: null },
  citySlug: { type: String, default: null },

  areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', default: null },
  areaName: { type: String, default: null },
  areaSlug: { type: String, default: null },

  heroImage: { type: String, default: null },
  bodyHtml: { type: String, required: true },

  faqs: [blogFaqSchema],
  faqSchema: { type: Object, default: null },

  status: {
    type: String,
    enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'UNPUBLISHED', 'REJECTED', 'ARCHIVED'],
    default: 'DRAFT',
  },
  isPublished: { type: Boolean, default: false },

  writtenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedReason: { type: String, default: null },

  publishedAt: { type: Date, default: null },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

// Slug is already unique-indexed via `unique: true` in the field definition
blogSchema.index({ createdAt: -1 });
blogSchema.index({ status: 1, createdAt: -1 });
blogSchema.index({ categorySlug: 1, createdAt: -1 });
blogSchema.index({ categorySlug: 1, status: 1, createdAt: -1 });
blogSchema.index({ cityId: 1, createdAt: -1 });
blogSchema.index({ cityId: 1, status: 1, createdAt: -1 });
blogSchema.index({ citySlug: 1, createdAt: -1 });
blogSchema.index({ citySlug: 1, status: 1, createdAt: -1 });
blogSchema.index({ writtenBy: 1, createdAt: -1 });
blogSchema.index({ writtenBy: 1, status: 1, createdAt: -1 });
blogSchema.index({ isPublished: 1, status: 1, publishedAt: -1, createdAt: -1 });
blogSchema.index({ isPublished: 1, status: 1, categorySlug: 1, publishedAt: -1 });
blogSchema.index({ isPublished: 1, status: 1, citySlug: 1, publishedAt: -1 });

module.exports = mongoose.model('Blog', blogSchema);

