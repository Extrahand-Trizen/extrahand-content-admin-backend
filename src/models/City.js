const mongoose = require('mongoose');

const citySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

citySchema.index({ isActive: 1, name: 1 });

module.exports = mongoose.model('City', citySchema);
