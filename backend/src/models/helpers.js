const mongoose = require('mongoose');
const Decimal = require('decimal.js');

const { Schema } = mongoose;

const moneyField = (defaultValue = '0.00') => ({
  type: String,
  default: defaultValue,
  set(value) {
    if (value === undefined || value === null || value === '') {
      return value;
    }
    return new Decimal(String(value)).toFixed(2, Decimal.ROUND_HALF_UP);
  },
  validate: {
    validator: (value) => value === undefined || value === null || /^\d+\.\d{2}$/.test(value),
    message: 'Money values must be non-negative decimal strings with two decimal places.',
  },
});

const decimalStringField = (defaultValue) => ({
  type: String,
  default: defaultValue,
  set(value) {
    if (value === undefined || value === null || value === '') {
      return value;
    }
    return new Decimal(String(value)).toString();
  },
  validate: {
    validator: (value) => value === undefined || value === null || new Decimal(value).isFinite(),
    message: 'Value must be a finite decimal string.',
  },
});

const snapshotAddressFields = {
  addressLine1: String,
  addressLine2: String,
  billingAddress: String,
  shippingAddress: String,
  city: String,
  state: String,
  postalCode: String,
  country: String,
};

const companySnapshotSchema = new Schema({
  name: String,
  logoPath: String,
  signaturePath: String,
  gstNumber: String,
  ...snapshotAddressFields,
  phone: String,
  email: String,
  website: String,
  defaultCurrency: String,
}, { _id: false });

const clientSnapshotSchema = new Schema({
  name: String,
  gstNumber: String,
  phone: String,
  email: String,
  attentionName: String,
  ...snapshotAddressFields,
}, { _id: false });

const itemSchema = new Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  sectionHeading: { type: String, default: '' },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
  quantity: { ...decimalStringField('1'), required: true },
  unit: { type: String, default: '' },
  unitPrice: { ...moneyField(), required: true },
  discountAmount: moneyField(),
  taxRate: decimalStringField('0'),
  lineSubtotal: { ...moneyField(), required: true },
  lineTotal: { ...moneyField(), required: true },
  sortOrder: { type: Number, default: 0 },
}, { _id: false });

module.exports = {
  Schema,
  companySnapshotSchema,
  clientSnapshotSchema,
  itemSchema,
  moneyField,
  decimalStringField,
};
