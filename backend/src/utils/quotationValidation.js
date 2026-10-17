const mongoose = require('mongoose');
const Decimal = require('decimal.js');
const validator = require('validator');
const { normalizeNonNegativeDecimal } = require('./catalogValidation');
const { clientFields } = require('./clientValidation');

const quotationTextFields = [
  'poSoNumber',
  'header',
  'currency',
  'salutation',
  'message',
  'closing',
  'signatory',
  'terms',
  'notes',
  'validityText',
];
const statusValues = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted'];
const defaultSorts = ['newest', 'oldest', 'amountAsc', 'amountDesc', 'numberAsc', 'numberDesc'];

function validateQuotationInput(body, { partial = false } = {}) {
  const errors = {};
  const updates = {};
  const allowedFields = new Set([
    'clientId',
    ...clientFields,
    ...quotationTextFields,
    'quotationDate',
    'validUntil',
    'additionalCharges',
    'items',
  ]);

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { updates, errors: { body: 'Request body must be a JSON object.' } };
  }
  for (const field of Object.keys(body)) {
    if (!allowedFields.has(field)) errors[field] = 'This field cannot be updated.';
  }

  if (!partial && !body.clientId && !body.name) {
    errors.clientId = 'Provide a clientId or inline client fields including name.';
  }
  if (Object.hasOwn(body, 'clientId')) {
    if (typeof body.clientId !== 'string' || !mongoose.isValidObjectId(body.clientId)) {
      errors.clientId = 'Must be a valid client id.';
    } else {
      updates.clientId = body.clientId;
    }
  }

  for (const field of clientFields) {
    if (!Object.hasOwn(body, field)) continue;
    if (typeof body[field] !== 'string') {
      errors[field] = 'Must be a string.';
      continue;
    }
    updates[field] = body[field].trim();
  }
  if (Object.hasOwn(body, 'name') && !updates.name) errors.name = 'Client name cannot be empty.';
  if (Object.hasOwn(body, 'email') && updates.email && !validator.isEmail(updates.email)) {
    errors.email = 'Must be a valid email address.';
  }
  if (Object.hasOwn(body, 'phone') && updates.phone && !validator.isMobilePhone(updates.phone, 'any')) {
    errors.phone = 'Must be a valid phone number.';
  }

  for (const field of quotationTextFields) {
    if (!Object.hasOwn(body, field)) continue;
    if (typeof body[field] !== 'string') errors[field] = 'Must be a string.';
    else updates[field] = body[field].trim();
  }
  if (Object.hasOwn(body, 'currency')) {
    if (typeof body.currency !== 'string' || !validator.isISO4217(body.currency.trim().toUpperCase())) {
      errors.currency = 'Must be a valid ISO 4217 currency code.';
    } else {
      updates.currency = body.currency.trim().toUpperCase();
    }
  }

  for (const field of ['quotationDate', 'validUntil']) {
    if (!Object.hasOwn(body, field)) continue;
    if (body[field] === null && field === 'validUntil') {
      updates.validUntil = null;
      continue;
    }
    const date = typeof body[field] === 'string' || body[field] instanceof Date
      ? new Date(body[field])
      : null;
    if (!date || Number.isNaN(date.getTime())) {
      errors[field] = 'Must be a valid date.';
    } else {
      updates[field] = date;
    }
  }

  if (Object.hasOwn(body, 'additionalCharges')) {
    try {
      updates.additionalCharges = normalizeNonNegativeDecimal(body.additionalCharges, 'additionalCharges', 2);
    } catch (error) {
      errors.additionalCharges = error.message;
    }
  }

  if (Object.hasOwn(body, 'items')) {
    if (!Array.isArray(body.items)) {
      errors.items = 'Must be an array.';
    } else {
      updates.items = body.items.map((item, index) => {
        const itemErrors = {};
        const itemUpdates = {};
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors[`items.${index}`] = 'Must be an object.';
          return null;
        }
        const allowedItemFields = [
          'name', 'description', 'sectionHeading', 'productId', 'categoryId',
          'quantity', 'unit', 'unitPrice', 'discountAmount', 'taxRate', 'sortOrder',
        ];
        for (const field of Object.keys(item)) {
          if (!allowedItemFields.includes(field)) itemErrors[field] = 'This field cannot be updated.';
        }
        if (typeof item.name !== 'string' || !item.name.trim()) {
          itemErrors.name = 'Name is required.';
        } else itemUpdates.name = item.name.trim();
        for (const field of ['description', 'sectionHeading', 'unit']) {
          if (item[field] === undefined) continue;
          if (typeof item[field] !== 'string') itemErrors[field] = 'Must be a string.';
          else itemUpdates[field] = item[field];
        }
        for (const field of ['productId', 'categoryId']) {
          if (item[field] === undefined || item[field] === null || item[field] === '') {
            itemUpdates[field] = null;
          } else if (typeof item[field] !== 'string' || !mongoose.isValidObjectId(item[field])) {
            itemErrors[field] = 'Must be a valid id or null.';
          } else itemUpdates[field] = item[field];
        }
        for (const field of ['quantity', 'unitPrice', 'discountAmount', 'taxRate']) {
          if (item[field] === undefined && field === 'discountAmount') {
            itemUpdates.discountAmount = '0.00';
            continue;
          }
          if (item[field] === undefined && field === 'taxRate') {
            itemUpdates.taxRate = '0';
            continue;
          }
          try {
            itemUpdates[field] = normalizeNonNegativeDecimal(item[field], field, field === 'unitPrice' || field === 'discountAmount' ? 2 : null);
            if (field === 'quantity' && new Decimal(itemUpdates.quantity).lte(0)) {
              itemErrors.quantity = 'Must be greater than zero.';
            }
          } catch (error) {
            itemErrors[field] = error.message;
          }
        }
        if (Object.hasOwn(item, 'sortOrder')) {
          if (!Number.isInteger(item.sortOrder) || item.sortOrder < 0) {
            itemErrors.sortOrder = 'Must be a non-negative integer.';
          } else itemUpdates.sortOrder = item.sortOrder;
        }
        for (const [field, message] of Object.entries(itemErrors)) {
          errors[`items.${index}.${field}`] = message;
        }
        return Object.keys(itemErrors).length ? null : itemUpdates;
      });
    }
  } else if (!partial) {
    errors.items = 'Items are required and must be an array.';
  }

  if (Object.hasOwn(body, 'status')) {
    if (!statusValues.includes(body.status)) {
      errors.status = `Must be one of: ${statusValues.join(', ')}.`;
    } else if (body.status === 'Converted') {
      errors.status = 'Converted status is set only when an invoice is created.';
    } else {
      updates.status = body.status;
    }
  }

  for (const field of Object.keys(errors)) {
    if (!field.startsWith('items.')) delete updates[field];
  }
  if (Object.keys(errors).some((field) => field.startsWith('items.'))) {
    delete updates.items;
  }
  return { updates, errors };
}

function parseQuotationFilters(query) {
  const errors = {};
  const allowedQueryFields = new Set([
    'search', 'status', 'clientId', 'dateFrom', 'dateTo', 'amountMin', 'amountMax',
    'sort', 'page', 'perPage', 'archived',
  ]);
  for (const field of Object.keys(query)) {
    if (!allowedQueryFields.has(field)) errors[field] = 'Unsupported query parameter.';
  }
  const parseInteger = (field, fallback, max = 1000000) => {
    if (query[field] === undefined) return fallback;
    if (typeof query[field] !== 'string' || !/^[1-9]\d*$/.test(query[field]) || Number(query[field]) > max) {
      errors[field] = `Must be an integer between 1 and ${max}.`;
      return fallback;
    }
    return Number(query[field]);
  };
  const page = parseInteger('page', 1);
  const perPage = parseInteger('perPage', 20, 100);
  if (query.search !== undefined && typeof query.search !== 'string') errors.search = 'Must be a string.';
  if (query.status !== undefined && !statusValues.includes(query.status)) {
    errors.status = `Must be one of: ${statusValues.join(', ')}.`;
  }
  if (query.clientId !== undefined
    && (typeof query.clientId !== 'string' || !mongoose.isValidObjectId(query.clientId))) {
    errors.clientId = 'Must be a valid client id.';
  }
  const dates = {};
  for (const field of ['dateFrom', 'dateTo']) {
    if (query[field] === undefined) continue;
    const value = typeof query[field] === 'string' ? new Date(query[field]) : null;
    if (!value || Number.isNaN(value.getTime())) errors[field] = 'Must be a valid date.';
    else dates[field] = value;
  }
  if (dates.dateFrom && dates.dateTo && dates.dateFrom > dates.dateTo) {
    errors.dateTo = 'Must be on or after dateFrom.';
  }
  for (const field of ['amountMin', 'amountMax']) {
    if (query[field] === undefined) continue;
    try {
      dates[field] = normalizeNonNegativeDecimal(query[field], field, 2);
    } catch (error) {
      errors[field] = error.message;
    }
  }
  if (dates.amountMin && dates.amountMax
    && Number(dates.amountMin) > Number(dates.amountMax)) {
    errors.amountMax = 'Must be greater than or equal to amountMin.';
  }
  if (query.sort !== undefined && !defaultSorts.includes(query.sort)) {
    errors.sort = `Must be one of: ${defaultSorts.join(', ')}.`;
  }
  if (query.archived !== undefined && !['1', '0'].includes(query.archived)) {
    errors.archived = 'Must be 1 or 0.';
  }
  return {
    errors,
    filters: {
      page,
      perPage,
      sort: query.sort || 'newest',
      archived: query.archived === '1',
      search: typeof query.search === 'string' ? query.search.trim() : '',
      status: query.status,
      clientId: query.clientId,
      ...dates,
    },
  };
}

module.exports = { validateQuotationInput, parseQuotationFilters, statusValues };
