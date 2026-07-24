const mongoose = require('mongoose');

const SUB_SUBCATEGORY_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PUBLISHED'];

const TaskSubSubcategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Sub-subcategory name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Sub-subcategory slug is required'],
      trim: true,
      lowercase: true,
    },
    categorySlug: {
      type: String,
      required: [true, 'Category slug is required'],
      trim: true,
      lowercase: true,
    },
    subcategorySlug: {
      type: String,
      required: [true, 'Subcategory slug is required'],
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: SUB_SUBCATEGORY_STATUSES,
      default: 'DRAFT',
    },
    isPublished: {
      type: Boolean,
      default: false,
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
    submissionNotes: {
      type: String,
      default: '',
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Composite unique index for slug combination
TaskSubSubcategorySchema.index({ slug: 1, categorySlug: 1, subcategorySlug: 1 }, { unique: true });
TaskSubSubcategorySchema.index({ categorySlug: 1 });
TaskSubSubcategorySchema.index({ subcategorySlug: 1 });
TaskSubSubcategorySchema.index({ isPublished: 1 });
TaskSubSubcategorySchema.index({ createdAt: -1 });

module.exports = mongoose.model('TaskSubSubcategory', TaskSubSubcategorySchema);
