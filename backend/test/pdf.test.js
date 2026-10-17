const test = require('node:test');
const assert = require('node:assert/strict');
const { createPdfBuffer, invoiceStatus, money } = require('../src/services/pdf');
const app = require('../src/app');

function quotation(description = 'A living room specification.') {
  return {
    _id: '0123456789abcdef01234567',
    number: 'QUO 372',
    header: 'Quotation',
    currency: 'INR',
    quotationDate: new Date('2026-10-18T00:00:00.000Z'),
    validUntil: new Date('2026-10-25T00:00:00.000Z'),
    companySnapshot: {
      name: 'THE CONCEPT DESIGNERS',
      addressLine1: 'Nashik',
      phone: '0000000000',
      email: 'office@example.test',
    },
    clientSnapshot: { name: 'Example Client', city: 'Nashik' },
    salutation: 'Dear Client,',
    message: 'Please find the quotation.',
    closing: 'Many thanks,',
    signatory: 'THE CONCEPT DESIGNERS',
    validityText: '7 days',
    subtotal: '1999.50',
    discountTotal: '0.00',
    taxTotal: '359.91',
    additionalCharges: '0.00',
    grandTotal: '2359.41',
    items: [{
      sectionHeading: 'Living Room',
      name: 'Custom furnishings',
      description,
      quantity: '1',
      unitPrice: '1999.50',
      lineTotal: '2359.41',
    }],
  };
}

test('quotation PDF is A4 and embeds a font supporting the rupee symbol', async () => {
  const buffer = await createPdfBuffer(quotation(), 'quotation');
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  const content = buffer.toString('latin1');
  assert.equal((content.match(/\/Type \/Page\b/g) || []).length, 1);
  assert.match(content, /\/MediaBox\s*\[\s*0\s+0\s+595\.28\s+841\.89\s*\]/);
  assert.equal(money('1999.50'), '₹ 1999.50');
});

test('a long item description paginates into multiple PDF pages', async () => {
  const description = Array.from({ length: 700 }, (_, index) => (
    `Living room specification paragraph ${index + 1}, custom furnishing details and measurements.`
  )).join('\n\n');
  const buffer = await createPdfBuffer(quotation(description), 'quotation');
  const pages = buffer.toString('latin1').match(/\/Type \/Page\b/g) || [];
  assert.ok(pages.length > 1);
});

test('invoice PDF includes payment details and calculates partial payment status', async () => {
  const invoice = {
    ...quotation('Invoice item.'),
    number: 'INV 1',
    header: 'Invoice',
    invoiceDate: new Date('2026-10-18T00:00:00.000Z'),
    dueDate: new Date('2026-11-18T00:00:00.000Z'),
    paymentTerms: 'Due in 30 days.',
    amountPaid: '1000.00',
    balanceDue: '1359.41',
    status: 'Partially Paid',
  };
  const buffer = await createPdfBuffer(invoice, 'invoice');
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  assert.equal(invoiceStatus(invoice, new Date('2026-10-20T00:00:00.000Z')), 'Partially Paid');
});

test('invoice status reflects full payment, overdue balances, and cancelled invoices', () => {
  const base = { grandTotal: '200.00', amountPaid: '0.00', balanceDue: '200.00', dueDate: '2026-10-17T00:00:00.000Z' };
  assert.equal(invoiceStatus(base, new Date('2026-10-18T00:00:00.000Z')), 'Overdue');
  assert.equal(invoiceStatus({ ...base, amountPaid: '200.00', balanceDue: '0.00' }), 'Paid');
  assert.equal(invoiceStatus({ ...base, status: 'Cancelled' }), 'Cancelled');
});

test('quotation and invoice PDF routes are registered and reject malformed IDs', async () => {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    for (const route of ['quotations', 'invoices']) {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/${route}/invalid-id/pdf`);
      assert.equal(response.status, 404);
      assert.match(response.headers.get('content-type'), /application\/json/);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
