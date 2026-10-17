const validator = require('validator');

const textFields = [
  'name',
  'gstNumber',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'country',
  'phone',
  'email',
  'website',
  'defaultHeader',
  'defaultSalutation',
  'defaultMessage',
  'defaultClosing',
  'defaultSignatory',
  'pdfClosingMessage',
  'quotationTerms',
  'invoicePaymentTerms',
  'quotationPrefix',
  'invoicePrefix',
];

const numberFields = ['defaultValidityDays', 'nextQuotationNumber', 'nextInvoiceNumber'];

const defaultsFields = [
  'defaultHeader',
  'defaultCurrency',
  'defaultValidityDays',
  'defaultSalutation',
  'defaultMessage',
  'defaultClosing',
  'defaultSignatory',
  'pdfClosingMessage',
  'quotationTerms',
  'invoicePaymentTerms',
];

function validateCompanyUpdate(body) {
  const errors = {};
  const updates = {};

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { updates, errors: { body: 'Request body must be a JSON object.' } };
  }

  const allowedFields = new Set([...textFields, ...numberFields, 'defaultCurrency']);
  for (const field of Object.keys(body)) {
    if (!allowedFields.has(field)) {
      errors[field] = 'This field cannot be updated.';
    }
  }

  for (const field of textFields) {
    if (!Object.hasOwn(body, field)) continue;
    if (typeof body[field] !== 'string') {
      errors[field] = 'Must be a string.';
      continue;
    }
    updates[field] = body[field].trim();
  }

  if (Object.hasOwn(body, 'name') && !updates.name) {
    errors.name = 'Name cannot be empty.';
  }
  if (Object.hasOwn(body, 'phone') && updates.phone
    && !validator.isMobilePhone(updates.phone, 'any')) {
    errors.phone = 'Must be a valid phone number.';
  }
  if (Object.hasOwn(body, 'email') && updates.email
    && !validator.isEmail(updates.email)) {
    errors.email = 'Must be a valid email address.';
  }
  if (Object.hasOwn(body, 'website') && updates.website
    && !validator.isURL(updates.website, { require_protocol: true })) {
    errors.website = 'Must be a valid URL including its protocol.';
  }

  if (Object.hasOwn(body, 'defaultCurrency')) {
    if (typeof body.defaultCurrency !== 'string') {
      errors.defaultCurrency = 'Must be a valid ISO 4217 currency code.';
    } else {
      updates.defaultCurrency = body.defaultCurrency.trim().toUpperCase();
      if (!validator.isISO4217(updates.defaultCurrency)) {
        errors.defaultCurrency = 'Must be a valid ISO 4217 currency code.';
      }
    }
  }

  for (const field of numberFields) {
    if (!Object.hasOwn(body, field)) continue;
    const value = body[field];
    const stringValue = typeof value === 'number' ? String(value) : value;
    const min = field === 'defaultValidityDays' ? 0 : 1;
    if (typeof value !== 'number' && typeof value !== 'string') {
      errors[field] = `Must be an integer greater than or equal to ${min}.`;
      continue;
    }
    if (!validator.isInt(stringValue, { min })) {
      errors[field] = `Must be an integer greater than or equal to ${min}.`;
      continue;
    }
    updates[field] = Number(stringValue);
  }

  for (const field of Object.keys(errors)) {
    delete updates[field];
  }

  return { updates, errors };
}

module.exports = { validateCompanyUpdate, defaultsFields };
