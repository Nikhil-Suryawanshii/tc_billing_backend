const mongoose = require('mongoose');
const { moneyField } = require('./helpers');

const paymentSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
  amount: { ...moneyField(), required: true },
  paymentDate: { type: Date, required: true },
  method: { type: String, default: '' },
  reference: { type: String, default: '' },
  notes: { type: String, default: '' },
}, { timestamps: true, collection: 'payments' });

module.exports = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
