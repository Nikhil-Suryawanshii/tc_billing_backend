const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateTotals } = require('../src/services/totals');
const { parseQuotationFilters, validateQuotationInput } = require('../src/utils/quotationValidation');

test('quotation totals use decimal arithmetic and the defined discounted subtotal meaning', () => {
  const description = 'Living room works.\n\nSecond paragraph with more detail.';
  const result = calculateTotals([{
    name: 'Living Room',
    description,
    quantity: '2',
    unitPrice: '100.00',
    discountAmount: '10.00',
    taxRate: '18',
    sortOrder: 0,
  }], '5.00');

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].description, description);
  assert.equal(result.items[0].lineSubtotal, '190.00');
  assert.equal(result.items[0].lineTotal, '224.20');
  assert.equal(result.discountTotal, '10.00');
  assert.equal(result.subtotal, '190.00');
  assert.equal(result.taxableAmount, '190.00');
  assert.equal(result.taxTotal, '34.20');
  assert.equal(result.additionalCharges, '5.00');
  assert.equal(result.grandTotal, '229.20');
});

test('quotation totals round line values without JavaScript floating-point math', () => {
  const result = calculateTotals([{
    name: 'Decimal item',
    quantity: '0.1',
    unitPrice: '0.10',
    discountAmount: '0',
    taxRate: '0',
  }]);
  assert.equal(result.items[0].lineSubtotal, '0.01');
  assert.equal(result.subtotal, '0.01');
  assert.equal(result.grandTotal, '0.01');
});

test('quotation input requires a saved or inline client and item array', () => {
  assert.deepEqual(validateQuotationInput({}).errors, {
    clientId: 'Provide a clientId or inline client fields including name.',
    items: 'Items are required and must be an array.',
  });
  const result = validateQuotationInput({
    name: 'Walk-in customer',
    quotationDate: '2026-10-18',
    items: [{
      name: 'Living Room',
      description: 'Part one.\n\nPart two.',
      quantity: '1',
      unitPrice: '1999.50',
    }],
  });
  assert.deepEqual(result.errors, {});
  assert.equal(result.updates.items.length, 1);
  assert.equal(result.updates.items[0].description, 'Part one.\n\nPart two.');
  assert.equal(result.updates.items[0].unitPrice, '1999.50');
});

test('quotation input rejects client-supplied totals, numbers, and Converted status', () => {
  const result = validateQuotationInput({
    clientId: '0123456789abcdef01234567',
    items: [{ name: 'Item', quantity: '1', unitPrice: '100' }],
    grandTotal: '1.00',
    number: 'QUO 1',
    status: 'Converted',
  });
  assert.deepEqual(Object.keys(result.errors).sort(), ['grandTotal', 'number', 'status']);
});

test('quotation filter parser validates ranges and exposes supported sort modes', () => {
  const valid = parseQuotationFilters({
    search: 'QUO',
    amountMin: '10.00',
    amountMax: '20.00',
    page: '2',
    perPage: '25',
    sort: 'amountDesc',
    archived: '1',
  });
  assert.deepEqual(valid.errors, {});
  assert.equal(valid.filters.sort, 'amountDesc');
  assert.equal(valid.filters.archived, true);
  assert.equal(valid.filters.page, 2);

  const invalid = parseQuotationFilters({ amountMin: '21', amountMax: '20', perPage: '101' });
  assert.deepEqual(Object.keys(invalid.errors).sort(), ['amountMax', 'perPage']);
});
