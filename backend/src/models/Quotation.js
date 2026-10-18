import mongoose from 'mongoose';
import itemSchema from './itemSchema.js';

const snapshotSchema = new mongoose.Schema(
  {
    name: String,
    gstNumber: String,
    addressLine1: String,
    addressLine2: String,
    phone: String,
    email: String,
    website: String,
    logoPath: String,
    bankName: String,
    bankAccountName: String,
    bankAccountNumber: String,
    bankIfsc: String,
    bankBranch: String,
    bankUpi: String,
    attentionName: String,
    billingAddress: String,
    city: String,
    state: String,
    postalCode: String,
    country: String,
  },
  { _id: false }
);

const quotationSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    number: { type: String, required: true },
    poSoNumber: { type: String, default: '' },
    header: { type: String, default: 'Quotation' },
    currency: { type: String, default: 'INR' },
    quotationDate: { type: Date, required: true },
    validUntil: { type: Date, default: null },
    status: {
      type: String,
      enum: ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted'],
      default: 'Draft',
      index: true,
    },
    companySnapshot: { type: snapshotSchema, default: () => ({}) },
    clientSnapshot: { type: snapshotSchema, default: () => ({}) },
    salutation: { type: String, default: '' },
    message: { type: String, default: '' },
    closing: { type: String, default: '' },
    signatory: { type: String, default: '' },
    terms: { type: String, default: '' },
    notes: { type: String, default: '' },
    validityText: { type: String, default: '' },
    items: { type: [itemSchema], default: [] },
    subtotal: { type: String, default: '0.00' },
    discountTotal: { type: String, default: '0.00' },
    taxableAmount: { type: String, default: '0.00' },
    taxTotal: { type: String, default: '0.00' },
    additionalCharges: { type: String, default: '0.00' },
    grandTotal: { type: String, default: '0.00' },
    convertedInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

quotationSchema.index({ companyId: 1, number: 1 }, { unique: true });
quotationSchema.index({ companyId: 1, quotationDate: -1 });

quotationSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

const Quotation = mongoose.model('Quotation', quotationSchema);
export default Quotation;
