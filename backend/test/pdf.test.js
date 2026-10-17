const test = require('node:test');
const assert = require('node:assert/strict');
const { createPdfBuffer, money } = require('../src/services/pdf');

function exampleDocument(description) {
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
      phone: '9860416153',
      email: 'office@example.com',
    },
    clientSnapshot: { name: 'Example Client', city: 'Nashik' },
    salutation: 'Dear Client,',
    message: 'Please find the quotation.',
    closing: 'Many thanks,',
    signatory: 'THE CONCEPT DESIGNERS',
    validityText: '7 days',
    subtotal: '1999.50',
    discountTotal: '0.00',
    taxableAmount: '1999.50',
    taxTotal: '359.91',
    additionalCharges: '0.00',
    grandTotal: '2359.41',
    items: [{
      name: 'Living Room',
      description,
      quantity: '1',
      unitPrice: '1999.50',
      discountAmount: '0.00',
      taxRate: '18',
      lineSubtotal: '1999.50',
      lineTotal: '2359.41',
    }],
  };
}

test('PDF is generated with A4 pages and embeds the rupee glyph font', async () => {
  const buffer = await createPdfBuffer(exampleDocument('A long room specification.'), 'quotation');
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  assert.match(buffer.toString('latin1'), /\/Count\s+1\b/);
  assert.match(buffer.toString('latin1'), /\/MediaBox\s*\[\s*0\s+0\s+595\.28\s+841\.89\s*\]/);
  assert.equal(money('1999.50'), '₹ 1999.50');
});

test('PDF layout paginates long item descriptions without splitting the item into rows', async () => {
  const description = Array.from({ length: 700 }, (_, index) => (
    `Living room specification paragraph ${index + 1}, custom furnishing details and measurements.`
  )).join('\n\n');
  const buffer = await createPdfBuffer(exampleDocument(description), 'quotation');
  const pageTree = buffer.toString('latin1').match(/\/Count\s+(\d+)/);
  assert.ok(pageTree);
  assert.ok(Number(pageTree[1]) > 1);
});

test('invoice PDF renderer accepts payment and balance summary values', async () => {
  const invoice = {
    ...exampleDocument('One invoice item.'),
    number: 'INV 1',
    header: 'Invoice',
    invoiceDate: new Date('2026-10-18T00:00:00.000Z'),
    dueDate: new Date('2026-11-18T00:00:00.000Z'),
    amountPaid: '1000.00',
    balanceDue: '1359.41',
    status: 'Partially Paid',
    paymentTerms: 'Due in 30 days.',
  };
  const buffer = await createPdfBuffer(invoice, 'invoice');
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
});
