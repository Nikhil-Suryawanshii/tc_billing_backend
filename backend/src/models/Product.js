import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    name: { type: String, required: true, trim: true },
    sku: { type: String, default: '' },
    description: { type: String, default: '' },
    unit: { type: String, default: '' },
    sellingPrice: { type: String, default: '0.00' },
    costPrice: { type: String, default: '' },
    taxRate: { type: String, default: '0.00' },
    imagePath: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.index(
  { companyId: 1, sku: 1 },
  { unique: true, partialFilterExpression: { sku: { $gt: '' } } }
);

productSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

const Product = mongoose.model('Product', productSchema);
export default Product;
