const mongoose = require('mongoose');
const validator = require('validator');
const { normalizeNonNegativeDecimal } = require('./catalogValidation');
const { clientFields } = require('./clientValidation');
const { validateQuotationInput } = require('./quotationValidation');

const invoiceTextFields = [
  'poSoNumber', 'header', 'currency', 'salutation', 'message', 'closing',
  'signatory', 'terms', 'notes', 'paymentTerms',
];
const readOnlyInvoiceFields = [
  'id', '_id', 'companyId', 'number', 'status', 'quotationId', 'quotationDate',
  'validUntil', 'companySnapshot', 'clientSnapshot', 'subtotal', 'discountTotal',
  'taxableAmount', 'taxTotal', 'grandTotal', 'amountPaid', 'balanceDue',
  'cancelledAt', 'payments', 'createdAt', 'updatedAt', '__v',
];

function validateInvoiceInput(body, { partial = false } = {}) {
  const errors = {};
  const updates = {};
  const allowed = new Set([
    'clientId', ...clientFields, ...invoiceTextFields, 'invoiceDate', 'dueDate',
    'additionalCharges', 'items',
  ]);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { updates, errors: { body: 'Request body must be a JSON object.' } };
  }
  for (const field of Object.keys(body)) {
    if (!allowed.has(field)
      && !(partial && readOnlyInvoiceFields.includes(field))) {
      errors[field] = 'This field cannot be updated.';
    }
  }

  if (Object.hasOwn(body, 'clientId')) {
    if (typeof body.clientId !== 'string' || !mongoose.isValidObjectId(body.clientId)) {
      errors.clientId = 'Must be a valid client id.';
    } else updates.clientId = body.clientId;
  } else if (!partial) {
    errors.clientId = 'A client is required.';
  }

  for (const field of clientFields) {
    if (!Object.hasOwn(body, field)) continue;
    if (typeof body[field] !== 'string') errors[field] = 'Must be a string.';
    else updates[field] = body[field].trim();
  }
  if (Object.hasOwn(body, 'email') && updates.email && !validator.isEmail(updates.email)) {
    errors.email = 'Must be a valid email address.';
  }
  if (Object.hasOwn(body, 'phone') && updates.phone && !validator.isMobilePhone(updates.phone, 'any')) {
    errors.phone = 'Must be a valid phone number.';
  }

  for (const field of invoiceTextFields) {
    if (!Object.hasOwn(body, field)) continue;
    if (typeof body[field] !== 'string') errors[field] = 'Must be a string.';
    else updates[field] = body[field].trim();
  }
  if (Object.hasOwn(body, 'currency')) {
    if (typeof body.currency !== 'string' || !validator.isISO4217(body.currency.trim().toUpperCase())) {
      errors.currency = 'Must be a valid ISO 4217 currency code.';
    } else updates.currency = body.currency.trim().toUpperCase();
  }

  for (const field of ['invoiceDate', 'dueDate']) {
    if (!Object.hasOwn(body, field)) continue;
    const value = body[field] === null && partial ? null
      : (typeof body[field] === 'string' || body[field] instanceof Date ? new Date(body[field]) : null);
    if (value === null && partial && body[field] === null) {
      updates[field] = null;
    } else if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      errors[field] = 'Must be a valid date.';
    } else updates[field] = value;
  }
  if (!partial) {
    if (!Object.hasOwn(body, 'invoiceDate')) errors.invoiceDate = 'Invoice date is required.';
    if (!Object.hasOwn(body, 'dueDate')) errors.dueDate = 'Due date is required.';
    if (!Array.isArray(body.items)) errors.items = 'Items are required and must be an array.';
  }

  if (Object.hasOwn(body, 'additionalCharges')) {
    try {
      updates.additionalCharges = normalizeNonNegativeDecimal(body.additionalCharges, 'additionalCharges', 2);
    } catch (error) {
      errors.additionalCharges = error.message;
    }
  }

  if (Object.hasOwn(body, 'items')) {
    const itemResult = validateQuotationInput({
      clientId: '0123456789abcdef01234567',
      items: body.items,
    }, { partial: true });
    for (const [field, message] of Object.entries(itemResult.errors)) {
      if (field.startsWith('items')) errors[field] = message;
    }
    if (!Object.keys(errors).some((field) => field.startsWith('items'))) {
      updates.items = itemResult.updates.items;
    }
  }

  for (const field of Object.keys(errors)) delete updates[field];
  return { updates, errors };
}

function validatePaymentInput(body) {
  const errors = {};
  const updates = {};
  const allowed = ['amount', 'paymentDate', 'method', 'reference', 'notes'];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { updates, errors: { body: 'Request body must be a JSON object.' } };
  }
  for (const field of Object.keys(body)) {
    if (!allowed.includes(field)) errors[field] = 'This field cannot be updated.';
  }
  try {
    updates.amount = normalizeNonNegativeDecimal(body.amount, 'amount', 2);
    if (updates.amount === '0.00') errors.amount = 'Amount must be greater than zero.';
  } catch (error) {
    errors.amount = error.message;
  }
  if (typeof body.paymentDate !== 'string' && !(body.paymentDate instanceof Date)) {
    errors.paymentDate = 'Payment date is required and must be a valid date.';
  } else {
    const date = new Date(body.paymentDate);
    if (Number.isNaN(date.getTime())) errors.paymentDate = 'Must be a valid date.';
    else updates.paymentDate = date;
  }
  for (const field of ['method', 'reference', 'notes']) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'string') errors[field] = 'Must be a string.';
    else updates[field] = body[field].trim();
  }
  for (const field of Object.keys(errors)) delete updates[field];
  return { updates, errors };
}

function normalizeInvoiceListQuery(query) {
  const normalized = { ...query };
  if (normalized.invoiceDateFrom === undefined && normalized.dateFrom !== undefined) {
    normalized.invoiceDateFrom = normalized.dateFrom;
  }
  if (normalized.invoiceDateTo === undefined && normalized.dateTo !== undefined) {
    normalized.invoiceDateTo = normalized.dateTo;
  }
  delete normalized.dateFrom;
  delete normalized.dateTo;
  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== ''));
}

module.exports = { validateInvoiceInput, validatePaymentInput, normalizeInvoiceListQuery };
