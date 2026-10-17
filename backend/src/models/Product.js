const mongoose = require('mongoose');
const { moneyField, decimalStringField } = require('./helpers');

const productSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  name: { type: String, required: true, trim: true },
  sku: { type: String, default: '', trim: true },
  description: { type: String, default: '' },
  unit: { type: String, default: '' },
  sellingPrice: moneyField(),
  costPrice: moneyField(),
  taxRate: decimalStringField('0'),
  imagePath: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, collection: 'products' });

productSchema.index(
  { companyId: 1, sku: 1 },
  {
    unique: true,
    partialFilterExpression: { sku: { $type: 'string', $gt: '' } },
  },
);

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
