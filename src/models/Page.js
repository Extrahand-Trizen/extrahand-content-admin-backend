const mongoose = require('mongoose');

const PageSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Page title is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Page slug is required'],
      trim: true,
      lowercase: true,
    },
    content: {
      type: String,
      required: [true, 'Page content is required'],
    },
    description: {
      type: String,
      trim: true,
    },
    metaTitle: {
      type: String,
      trim: true,
    },
    metaDescription: {
      type: String,
      trim: true,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    publishedAt: {
      type: Date,
    },
    author: {
      type: String,
      trim: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    category: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for faster queries
PageSchema.index({ slug: 1 }, { unique: true });
PageSchema.index({ isPublished: 1 });

module.exports = mongoose.model('Page', PageSchema);

