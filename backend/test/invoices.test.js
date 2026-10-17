const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateInvoiceStatus } = require('../src/services/invoices');
const {
  validateInvoiceInput,
  validatePaymentInput,
  normalizeInvoiceListQuery,
} = require('../src/utils/invoiceValidation');

test('invoice create requires client, invoice date, due date, and items', () => {
  const result = validateInvoiceInput({});
  assert.deepEqual(Object.keys(result.errors).sort(), [
    'clientId',
    'dueDate',
    'invoiceDate',
    'items',
  ]);
});

test('invoice payload validates dates and keeps exact decimal strings', () => {
  const result = validateInvoiceInput({
    clientId: '0123456789abcdef01234567',
    invoiceDate: '2026-10-18',
    dueDate: '2026-11-18',
    items: [{
      name: 'Cabinet',
      description: 'One long description.',
      quantity: '1.5',
      unitPrice: '1999.50',
      taxRate: '18',
    }],
  });
  assert.deepEqual(result.errors, {});
  assert.equal(result.updates.items[0].unitPrice, '1999.50');
  assert.equal(result.updates.items[0].quantity, '1.5');
  assert.equal(result.updates.dueDate.toISOString().slice(0, 10), '2026-11-18');
});

test('payment amount must be positive and date/metadata are validated', () => {
  assert.deepEqual(validatePaymentInput({
    amount: '0.00',
    paymentDate: 'bad-date',
    method: 2,
  }).errors, {
    amount: 'Amount must be greater than zero.',
    paymentDate: 'Must be a valid date.',
    method: 'Must be a string.',
  });
  const valid = validatePaymentInput({
    amount: '50.25',
    paymentDate: '2026-10-18',
    method: 'UPI',
  });
  assert.deepEqual(valid.errors, {});
  assert.equal(valid.updates.amount, '50.25');
});

test('invoice status follows payment totals, due date, and cancellation', () => {
  const today = new Date('2026-10-18T12:00:00.000Z');
  const base = {
    status: 'Issued',
    grandTotal: '100.00',
    amountPaid: '0.00',
    balanceDue: '100.00',
    dueDate: new Date('2026-10-17T00:00:00.000Z'),
  };
  assert.equal(calculateInvoiceStatus(base, today), 'Overdue');
  assert.equal(calculateInvoiceStatus({
    ...base,
    amountPaid: '50.00',
    balanceDue: '50.00',
  }, today), 'Overdue');
  assert.equal(calculateInvoiceStatus({
    ...base,
    dueDate: new Date('2026-10-19T00:00:00.000Z'),
    amountPaid: '50.00',
    balanceDue: '50.00',
  }, today), 'Partially Paid');
  assert.equal(calculateInvoiceStatus({
    ...base,
    amountPaid: '100.00',
    balanceDue: '0.00',
  }, today), 'Paid');
  assert.equal(calculateInvoiceStatus({ ...base, status: 'Cancelled' }, today), 'Cancelled');
});

test('invoice list accepts frontend dateFrom/dateTo names and ignores empty optional filters', () => {
  assert.deepEqual(normalizeInvoiceListQuery({
    search: '',
    status: '',
    page: '1',
    dateFrom: '',
    dateTo: '',
  }), { page: '1' });
  assert.deepEqual(normalizeInvoiceListQuery({
    dateFrom: '2026-10-01',
    dateTo: '2026-10-18',
  }), {
    invoiceDateFrom: '2026-10-01',
    invoiceDateTo: '2026-10-18',
  });
});
