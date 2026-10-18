import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    defaultPrice: { type: String, default: '0.00' },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

categorySchema.index({ companyId: 1, parentId: 1, name: 1 }, { unique: true });

categorySchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

const Category = mongoose.model('Category', categorySchema);
export default Category;
