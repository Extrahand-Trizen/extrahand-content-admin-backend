const mongoose = require('mongoose');

const cityPageSchema = new mongoose.Schema({
  pageType: { type: String, enum: ['city-page'], default: 'city-page', required: true },
  citySlug: { type: String, required: true, trim: true, lowercase: true },
  cityName: { type: String, required: true, trim: true },
  content: { type: mongoose.Schema.Types.Mixed, required: true },
  status: {
    type: String,
    enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'UNPUBLISHED', 'REJECTED', 'ARCHIVED'],
    default: 'DRAFT',
  },
  isPublished: { type: Boolean, default: false },
  isCurrentPublished: { type: Boolean, default: false },
  version: { type: Number, default: 1 },
  versionGroupId: { type: mongoose.Schema.Types.ObjectId, default: null },
  originalPageId: { type: mongoose.Schema.Types.ObjectId, ref: 'CityPage', default: null },
  previousVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CityPage', default: null },
  writtenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  rejectedReason: { type: String, default: null },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  publishedAt: { type: Date, default: null },
}, { timestamps: true });

cityPageSchema.index({ citySlug:  1, isCurrentPublished: 1, publishedAt: -1 });
cityPageSchema.index({ writtenBy: 1, status: 1, createdAt: -1 });
cityPageSchema.index({ status: 1, createdAt: -1 });
cityPageSchema.index({ versionGroupId: 1, version: -1 });

module.exports = mongoose.model('CityPage', cityPageSchema);
