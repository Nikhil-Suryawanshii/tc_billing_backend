const mongoose = require('mongoose');
const {
  companySnapshotSchema,
  clientSnapshotSchema,
  itemSchema,
  moneyField,
} = require('./helpers');

const invoiceSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  number: { type: String, required: true, trim: true },
  poSoNumber: { type: String, default: '' },
  header: { type: String, default: 'Invoice' },
  currency: { type: String, default: 'INR' },
  invoiceDate: { type: Date, required: true },
  dueDate: { type: Date, default: null },
  quotationDate: { type: Date, default: null },
  validUntil: { type: Date, default: null },
  quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', default: null },
  status: {
    type: String,
    enum: ['Draft', 'Issued', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'],
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
  paymentTerms: { type: String, default: '' },
  cancelledAt: { type: Date, default: null },
  items: { type: [itemSchema], default: [] },
  subtotal: moneyField(),
  discountTotal: moneyField(),
  taxableAmount: moneyField(),
  taxTotal: moneyField(),
  additionalCharges: moneyField(),
  grandTotal: moneyField(),
  amountPaid: moneyField(),
  balanceDue: moneyField(),
}, { timestamps: true, collection: 'invoices' });

invoiceSchema.index({ companyId: 1, number: 1 }, { unique: true });

module.exports = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
