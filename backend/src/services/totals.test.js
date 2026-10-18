import test from 'node:test';
import assert from 'node:assert/strict';
import { priceDocument } from './totals.js';

test('prices one taxed line and one untaxed line with decimal-safe totals', () => {
  const result = priceDocument(
    [
      {
        name: 'Living Room',
        description: 'Entrance décor\nShoe rack\nTV setup',
        sectionHeading: 'Living Room',
        quantity: 2,
        unit: 'job',
        unitPrice: '1000.00',
        discountAmount: '100',
        taxRate: '18',
      },
      {
        name: 'Site visit',
        quantity: '1',
        unitPrice: '500',
        discountAmount: '0',
        taxRate: '0',
      },
    ],
    '50'
  );

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].lineSubtotal, '1900.00');
  assert.equal(result.items[0].lineTotal, '2242.00');
  assert.equal(result.items[0].description.includes('Shoe rack'), true);
  assert.equal(result.subtotal, '2400.00');
  assert.equal(result.discountTotal, '100.00');
  assert.equal(result.taxableAmount, '1900.00');
  assert.equal(result.taxTotal, '342.00');
  assert.equal(result.additionalCharges, '50.00');
  assert.equal(result.grandTotal, '2792.00');
});

test('does not add tax when the rate is zero', () => {
  const result = priceDocument([{ name: 'Chair', quantity: 1, unitPrice: 100, taxRate: 0 }]);
  assert.equal(result.taxTotal, '0.00');
  assert.equal(result.taxableAmount, '0.00');
  assert.equal(result.grandTotal, '100.00');
});
