const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeRegex, validateClientInput } = require('../src/utils/clientValidation');

test('client input requires a name and ignores any submitted company id', () => {
  const { updates, errors } = validateClientInput({
    name: '  Acme Interiors  ',
    companyId: 'attacker-controlled-id',
    phone: '+1 212-555-0100',
  });

  assert.deepEqual(errors, {});
  assert.deepEqual(updates, {
    name: 'Acme Interiors',
    phone: '+1 212-555-0100',
  });
  assert.equal(Object.hasOwn(updates, 'companyId'), false);
});

test('client update accepts partial fields but rejects an empty or missing name', () => {
  assert.deepEqual(validateClientInput({ city: ' Nashik ' }, { partial: true }), {
    updates: { city: 'Nashik' },
    errors: {},
  });
  assert.equal(validateClientInput({ name: ' ' }, { partial: true }).errors.name, 'Name is required.');
  assert.equal(validateClientInput({}, { partial: true }).updates.name, undefined);
});

test('client update ignores metadata returned with a full client record', () => {
  const result = validateClientInput({
    _id: '0123456789abcdef01234567',
    id: '0123456789abcdef01234567',
    companyId: 'ignored',
    createdAt: '2026-10-14T06:08:05.963Z',
    updatedAt: '2026-10-14T06:08:06.021Z',
    __v: 0,
    name: 'Updated client',
    email: '',
  }, { partial: true });
  assert.deepEqual(result, {
    updates: { name: 'Updated client', email: '' },
    errors: {},
  });
});

test('invalid client fields and types produce field errors without passing invalid updates', () => {
  const { updates, errors } = validateClientInput({
    name: 'Valid name',
    email: 'not-an-email',
    phone: 'not-a-phone',
    isAdmin: true,
  });

  assert.deepEqual(updates, { name: 'Valid name' });
  assert.deepEqual(Object.keys(errors).sort(), ['email', 'isAdmin', 'phone']);
});

test('search terms are escaped before being used in a regular expression', () => {
  assert.equal(escapeRegex('a.*(b)'), 'a\\.\\*\\(b\\)');
  const expression = new RegExp(escapeRegex('a.*(b)'), 'i');
  assert.equal(expression.test('a.*(b)'), true);
  assert.equal(expression.test('axxxb'), false);
});
