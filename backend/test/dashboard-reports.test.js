const test = require('node:test');
const assert = require('node:assert/strict');
const { Payment } = require('../src/models');
const { monthLabels } = require('../src/services/dashboard');
const { getReport } = require('../src/services/reports');
const { parseReportFilters, reportColumns, toCsv } = require('../src/utils/reportFilters');

test('dashboard month labels contain the latest twelve calendar months', () => {
  assert.deepEqual(monthLabels(new Date('2026-10-18T10:00:00.000Z')), [
    '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04',
    '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
  ]);
});

test('report filters default to twelve months and validate dates and range order', () => {
  const { errors, filters } = parseReportFilters({}, new Date('2026-10-18T10:00:00.000Z'));
  assert.deepEqual(errors, {});
  assert.equal(filters.fromLabel, '2025-11-01');
  assert.equal(filters.toLabel, '2026-10-18');
  assert.equal(filters.to.toISOString(), '2026-10-18T23:59:59.999Z');

  const invalidDate = parseReportFilters({ from: '2026-02-30' });
  assert.equal(invalidDate.errors.from, 'Must be a valid date in YYYY-MM-DD format.');
  const reversedRange = parseReportFilters({ from: '2026-02-02', to: '2026-02-01' });
  assert.equal(reversedRange.errors.to, 'Must be on or after from.');
});

test('CSV export includes payment amounts, quotes fields, and neutralizes formulas', () => {
  const rows = [{
    paymentId: 'payment-1',
    date: '2026-10-18',
    invoiceNumber: 'INV 1',
    clientName: '=HYPERLINK("https://example.test")',
    amount: '1234.56',
    method: 'Bank transfer',
    reference: 'REF-1',
  }];
  const csv = toCsv(rows, reportColumns.payments);
  assert.match(csv, /^"paymentId","date","invoiceNumber"/);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.test""\)"/);
  assert.match(csv, /"1234\.56"/);
  assert.equal(
    toCsv([], reportColumns.payments),
    '"paymentId","date","invoiceNumber","clientName","amount","method","reference"',
  );
});

test('payments report preserves exact decimal amounts for CSV export', async () => {
  const originalAggregate = Payment.aggregate;
  Payment.aggregate = async () => [{
    paymentId: '0123456789abcdef01234567',
    date: new Date('2026-10-18T00:00:00.000Z'),
    invoiceNumber: 'INV 1',
    clientName: 'Example Client',
    amount: '1234.56',
    method: 'Bank transfer',
    reference: 'REF-1',
  }];
  try {
    const report = await getReport(
      'payments',
      'company-id',
      new Date('2026-10-01T00:00:00.000Z'),
      new Date('2026-10-31T23:59:59.999Z'),
    );
    assert.equal(report.rows[0].amount, '1234.56');
    assert.match(toCsv(report.rows, reportColumns.payments), /"1234\.56"/);
  } finally {
    Payment.aggregate = originalAggregate;
  }
});
