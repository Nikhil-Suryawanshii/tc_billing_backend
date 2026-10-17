const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  logoPath: { type: String, default: '' },
  signaturePath: { type: String, default: '' },
  gstNumber: { type: String, default: '' },
  addressLine1: { type: String, default: '' },
  addressLine2: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  postalCode: { type: String, default: '' },
  country: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  website: { type: String, default: '' },
  defaultCurrency: { type: String, default: 'INR' },
  defaultHeader: { type: String, default: 'Quotation' },
  defaultValidityDays: { type: Number, default: 7, min: 0 },
  defaultSalutation: { type: String, default: '' },
  defaultMessage: { type: String, default: '' },
  defaultClosing: { type: String, default: '' },
  defaultSignatory: { type: String, default: '' },
  pdfClosingMessage: { type: String, default: '' },
  quotationTerms: { type: String, default: '' },
  invoicePaymentTerms: { type: String, default: '' },
  quotationPrefix: { type: String, default: 'QUO' },
  invoicePrefix: { type: String, default: 'INV' },
  nextQuotationNumber: { type: Number, default: 372, min: 1 },
  nextInvoiceNumber: { type: Number, default: 1, min: 1 },
}, { timestamps: true, collection: 'companies' });

companySchema.statics.current = function current() {
  return this.findOne().sort({ createdAt: 1 });
};

module.exports = mongoose.models.Company || mongoose.model('Company', companySchema);
