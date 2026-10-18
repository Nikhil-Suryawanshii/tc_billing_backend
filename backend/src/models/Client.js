import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true, trim: true },
    gstNumber: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    attentionName: { type: String, default: '' },
    billingAddress: { type: String, default: '' },
    shippingAddress: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    postalCode: { type: String, default: '' },
    country: { type: String, default: 'India' },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

clientSchema.index({ companyId: 1, name: 1 });

clientSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

const Client = mongoose.model('Client', clientSchema);
export default Client;
