const validator = require('validator');

const clientFields = [
  'name',
  'gstNumber',
  'phone',
  'email',
  'attentionName',
  'billingAddress',
  'shippingAddress',
  'city',
  'state',
  'postalCode',
  'country',
  'notes',
];

function validateClientInput(body, { partial = false } = {}) {
  const errors = {};
  const updates = {};

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { updates, errors: { body: 'Request body must be a JSON object.' } };
  }

  for (const field of Object.keys(body)) {
    if (field === 'companyId') continue;
    if (!clientFields.includes(field)) {
      errors[field] = 'This field cannot be updated.';
    }
  }

  if (!partial && !Object.hasOwn(body, 'name')) {
    errors.name = 'Name is required.';
  }

  for (const field of clientFields) {
    if (!Object.hasOwn(body, field)) continue;
    if (typeof body[field] !== 'string') {
      errors[field] = 'Must be a string.';
      continue;
    }
    updates[field] = body[field].trim();
  }

  if (Object.hasOwn(body, 'name') && !updates.name) {
    errors.name = 'Name is required.';
  }
  if (Object.hasOwn(body, 'phone') && updates.phone
    && !validator.isMobilePhone(updates.phone, 'any')) {
    errors.phone = 'Must be a valid phone number.';
  }
  if (Object.hasOwn(body, 'email') && updates.email
    && !validator.isEmail(updates.email)) {
    errors.email = 'Must be a valid email address.';
  }

  for (const field of Object.keys(errors)) {
    delete updates[field];
  }

  return { updates, errors };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { validateClientInput, escapeRegex, clientFields };
