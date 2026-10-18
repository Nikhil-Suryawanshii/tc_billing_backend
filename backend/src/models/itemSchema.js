import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    sectionHeading: { type: String, default: '' },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    quantity: { type: String, required: true },
    unit: { type: String, default: '' },
    unitPrice: { type: String, required: true },
    discountAmount: { type: String, default: '0.00' },
    taxRate: { type: String, default: '0.00' },
    lineSubtotal: { type: String, default: '0.00' },
    lineTotal: { type: String, default: '0.00' },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: true }
);

export default itemSchema;
