import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    amount: { type: String, required: true },
    paymentDate: { type: Date, required: true, index: true },
    method: { type: String, default: '' },
    reference: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

paymentSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
