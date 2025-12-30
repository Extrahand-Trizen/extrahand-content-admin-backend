const mongoose = require('mongoose');

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
    isPublished: {
      type: Boolean,
      default: true,
    },
    author: {
      type: String,
      default: 'ExtraHand Team',
    },
  },
  {
    timestamps: true,
  }
);

// Index for better search performance
ArticleSchema.index({ title: 'text', description: 'text', content: 'text' });
ArticleSchema.index({ category: 1 });
ArticleSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Article', ArticleSchema);
