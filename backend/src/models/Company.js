import mongoose from 'mongoose';

const companySchema = new mongoose.Schema(
  {
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
    bankName: { type: String, default: '' },
    bankAccountName: { type: String, default: '' },
    bankAccountNumber: { type: String, default: '' },
    bankIfsc: { type: String, default: '' },
    bankBranch: { type: String, default: '' },
    bankUpi: { type: String, default: '' },
    defaultCurrency: { type: String, default: 'INR' },
    defaultHeader: { type: String, default: 'Quotation' },
    defaultValidityDays: { type: Number, default: 7 },
    defaultSalutation: { type: String, default: 'Dear Client,' },
    defaultMessage: { type: String, default: '' },
    defaultClosing: { type: String, default: 'Many thanks,' },
    defaultSignatory: { type: String, default: '' },
    pdfClosingMessage: { type: String, default: '' },
    quotationTerms: { type: String, default: '' },
    invoicePaymentTerms: { type: String, default: '' },
    quotationPrefix: { type: String, default: 'QUO' },
    invoicePrefix: { type: String, default: 'INV' },
    nextQuotationNumber: { type: Number, default: 372 },
    nextInvoiceNumber: { type: Number, default: 1 },
  },
  { timestamps: true }
);

companySchema.statics.current = async function current() {
  const company = await this.findOne();
  if (!company) {
    const error = new Error('Company is not seeded. Run npm run seed.');
    error.status = 500;
    throw error;
  }
  return company;
};

companySchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

const Company = mongoose.model('Company', companySchema);
export default Company;
