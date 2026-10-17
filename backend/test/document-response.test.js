const test = require('node:test');
const assert = require('node:assert/strict');
const documentResponse = require('../src/utils/documentResponse');

test('document response includes a string id when serializing a lean MongoDB document', () => {
  const response = documentResponse({
    _id: { toString: () => 'quotation-123' },
    number: 'QUO 372',
  });
  assert.equal(response.id, 'quotation-123');
  assert.equal(String(response._id), 'quotation-123');
  assert.equal(response.number, 'QUO 372');
});

test('document response retains model serialization while exposing a string id', () => {
  const response = documentResponse({
    toObject: () => ({ _id: 'invoice-123', number: 'INV 1' }),
  });
  assert.deepEqual(response, { _id: 'invoice-123', id: 'invoice-123', number: 'INV 1' });
});
