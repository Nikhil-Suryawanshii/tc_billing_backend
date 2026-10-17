const Decimal = require('decimal.js');
const validator = require('validator');

const categoryFields = ['parentId', 'name', 'description', 'defaultPrice', 'isActive', 'sortOrder'];
const productFields = [
  'name',
  'sku',
  'description',
  'categoryId',
  'unit',
  'sellingPrice',
  'costPrice',
  'taxRate',
  'isActive',
];
const readOnlyFields = ['id', '_id', 'companyId', 'createdAt', 'updatedAt', '__v', 'imagePath'];

function validateFields(body, allowedFields, partial) {
  const errors = {};
  for (const field of Object.keys(body)) {
    if (field !== 'companyId'
      && !(partial && readOnlyFields.includes(field))
      && !allowedFields.includes(field)) {
      errors[field] = 'This field cannot be updated.';
    }
  }
  return errors;
}

function validateCategoryInput(body, { partial = false } = {}) {
  const errors = {};
  const updates = {};

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { updates, errors: { body: 'Request body must be a JSON object.' } };
  }

  Object.assign(errors, validateFields(body, categoryFields, partial));
  if (!partial && !Object.hasOwn(body, 'name')) errors.name = 'Name is required.';

  if (Object.hasOwn(body, 'name')) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      errors.name = 'Name is required.';
    } else {
      updates.name = body.name.trim();
    }
  }

  if (Object.hasOwn(body, 'parentId')) {
    if (body.parentId === null || body.parentId === '') {
      updates.parentId = null;
    } else if (typeof body.parentId !== 'string' || !validator.isMongoId(body.parentId)) {
      errors.parentId = 'Must be a valid parent category id or null.';
    } else {
      updates.parentId = body.parentId;
    }
  }

  if (Object.hasOwn(body, 'description')) {
    if (typeof body.description !== 'string') errors.description = 'Must be a string.';
    else updates.description = body.description.trim();
  }

  if (Object.hasOwn(body, 'defaultPrice')) {
    try {
      updates.defaultPrice = normalizeNonNegativeDecimal(body.defaultPrice, 'defaultPrice', 2);
    } catch (error) {
      errors.defaultPrice = error.message;
    }
  }

  if (Object.hasOwn(body, 'isActive')) {
    if (typeof body.isActive === 'boolean') {
      updates.isActive = body.isActive;
    } else if (body.isActive === 'true' || body.isActive === 'false') {
      updates.isActive = body.isActive === 'true';
    } else {
      errors.isActive = 'Must be a boolean.';
    }
  }

  if (Object.hasOwn(body, 'sortOrder')) {
    const value = typeof body.sortOrder === 'number' ? String(body.sortOrder) : body.sortOrder;
    if ((typeof body.sortOrder !== 'number' && typeof body.sortOrder !== 'string')
      || !validator.isInt(value, { min: 0, max: 2147483647 })) {
      errors.sortOrder = 'Must be a non-negative integer.';
    } else {
      updates.sortOrder = Number(value);
    }
  }

  for (const field of Object.keys(errors)) delete updates[field];
  return { updates, errors };
}

function normalizeNonNegativeDecimal(value, field, places = null) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new TypeError(`${field} must be a non-negative decimal value.`);
  }
  let decimal;
  try {
    decimal = new Decimal(String(value));
  } catch {
    throw new TypeError(`${field} must be a non-negative decimal value.`);
  }
  if (!decimal.isFinite() || decimal.isNegative()) {
    throw new TypeError(`${field} must be a non-negative decimal value.`);
  }
  return places === null ? decimal.toString() : decimal.toFixed(places, Decimal.ROUND_HALF_UP);
}

function validateProductInput(body, { partial = false } = {}) {
  const errors = {};
  const updates = {};

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { updates, errors: { body: 'Request body must be a JSON object.' } };
  }

  Object.assign(errors, validateFields(body, productFields, partial));
  if (!partial && !Object.hasOwn(body, 'name')) errors.name = 'Name is required.';

  for (const field of ['name', 'sku', 'description', 'unit']) {
    if (!Object.hasOwn(body, field)) continue;
    if (typeof body[field] !== 'string') {
      errors[field] = 'Must be a string.';
      continue;
    }
    updates[field] = body[field].trim();
  }
  if (Object.hasOwn(body, 'name') && !updates.name) errors.name = 'Name is required.';

  if (Object.hasOwn(body, 'categoryId')) {
    if (body.categoryId === null || body.categoryId === '') {
      updates.categoryId = null;
    } else if (typeof body.categoryId !== 'string' || !validator.isMongoId(body.categoryId)) {
      errors.categoryId = 'Must be a valid category id or null.';
    } else {
      updates.categoryId = body.categoryId;
    }
  }

  for (const field of ['sellingPrice', 'costPrice']) {
    if (!Object.hasOwn(body, field)) continue;
    try {
      updates[field] = normalizeNonNegativeDecimal(body[field], field, 2);
    } catch (error) {
      errors[field] = error.message;
    }
  }

  if (Object.hasOwn(body, 'taxRate')) {
    try {
      updates.taxRate = normalizeNonNegativeDecimal(body.taxRate, 'taxRate');
    } catch (error) {
      errors.taxRate = error.message;
    }
  }

  if (Object.hasOwn(body, 'isActive')) {
    if (typeof body.isActive === 'boolean') {
      updates.isActive = body.isActive;
    } else if (body.isActive === 'true' || body.isActive === 'false') {
      updates.isActive = body.isActive === 'true';
    } else {
      errors.isActive = 'Must be a boolean.';
    }
  }

  for (const field of Object.keys(errors)) delete updates[field];
  return { updates, errors };
}

function normalizeProductListQuery(query) {
  const normalized = { ...query };
  if (normalized.categoryId === '' || normalized.categoryId === 'all') delete normalized.categoryId;
  if (normalized.isActive === '') delete normalized.isActive;
  return normalized;
}

module.exports = {
  categoryFields,
  productFields,
  validateCategoryInput,
  validateProductInput,
  normalizeNonNegativeDecimal,
  normalizeProductListQuery,
};
