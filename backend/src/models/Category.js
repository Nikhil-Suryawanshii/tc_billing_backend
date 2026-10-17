const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true, collection: 'categories' });

categorySchema.index({ companyId: 1, name: 1 }, { unique: true });

module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);
