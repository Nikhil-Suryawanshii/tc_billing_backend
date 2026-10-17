const mongoose = require('mongoose');
const {
  companySnapshotSchema,
  clientSnapshotSchema,
  itemSchema,
  moneyField,
} = require('./helpers');

const quotationSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  number: { type: String, required: true, trim: true },
  poSoNumber: { type: String, default: '' },
  header: { type: String, default: 'Quotation' },
  currency: { type: String, default: 'INR' },
  quotationDate: { type: Date, required: true },
  validUntil: { type: Date, default: null },
  status: {
    type: String,
    enum: ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted'],
    default: 'Draft',
  },
  companySnapshot: { type: companySnapshotSchema, default: () => ({}) },
  clientSnapshot: { type: clientSnapshotSchema, default: () => ({}) },
  salutation: { type: String, default: '' },
  message: { type: String, default: '' },
  closing: { type: String, default: '' },
  signatory: { type: String, default: '' },
  terms: { type: String, default: '' },
  notes: { type: String, default: '' },
  validityText: { type: String, default: '' },
  items: { type: [itemSchema], default: [] },
  subtotal: moneyField(),
  discountTotal: moneyField(),
  taxableAmount: moneyField(),
  taxTotal: moneyField(),
  additionalCharges: moneyField(),
  grandTotal: moneyField(),
  convertedInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
  archivedAt: { type: Date, default: null },
}, { timestamps: true, collection: 'quotations' });

quotationSchema.index({ companyId: 1, number: 1 }, { unique: true });

module.exports = mongoose.models.Quotation || mongoose.model('Quotation', quotationSchema);
