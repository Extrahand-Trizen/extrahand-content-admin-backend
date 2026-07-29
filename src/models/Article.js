const mongoose = require('mongoose');

const ARTICLE_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PUBLISHED'];

const ArticleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Article title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Article description is required'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Article category is required'],
      trim: true,
    },
    subcategory: {
      type: String,
      default: '',
      trim: true,
    },
    subSubcategory: {
      type: String,
      default: '',
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'Article content is required'],
    },
    imageUrl: {
      type: String,
      trim: true,
    },
    views: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ARTICLE_STATUSES,
      default: 'DRAFT',
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    author: {
      type: String,
      default: 'ExtraHand Team',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewNotes: {
      type: String,
      default: '',
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Version control for edits
    originalArticleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Article',
      default: null,
    },
    isCurrentVersion: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better search performance
ArticleSchema.index({ title: 'text', description: 'text', content: 'text' });
ArticleSchema.index({ category: 1 });
ArticleSchema.index({ subcategory: 1 });
ArticleSchema.index({ subSubcategory: 1 });
ArticleSchema.index({ createdAt: -1 });
ArticleSchema.index({ status: 1, createdAt: -1 });
ArticleSchema.index({ createdBy: 1, status: 1, createdAt: -1 });
ArticleSchema.index({ isPublished: 1, status: 1 });

module.exports = mongoose.model('Article', ArticleSchema);
