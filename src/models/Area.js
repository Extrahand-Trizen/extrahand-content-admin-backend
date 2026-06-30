const mongoose = require('mongoose');

const areaSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Area', areaSchema);
