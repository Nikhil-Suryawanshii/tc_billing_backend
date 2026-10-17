const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCompanyUpdate, defaultsFields } = require('../src/utils/companyValidation');
const { imageExtension } = require('../src/middleware/companyUpload');

test('valid company updates are normalized and accepted', () => {
  const { updates, errors } = validateCompanyUpdate({
    phone: '9860416153',
    email: 'office@example.com',
    defaultCurrency: 'inr',
    nextQuotationNumber: '372',
    nextInvoiceNumber: 5,
    defaultValidityDays: '7',
  });

  assert.deepEqual(errors, {});
  assert.deepEqual(updates, {
    phone: '9860416153',
    email: 'office@example.com',
    defaultCurrency: 'INR',
    nextQuotationNumber: 372,
    nextInvoiceNumber: 5,
    defaultValidityDays: 7,
  });
});

test('invalid fields and attempts to update protected fields return field errors', () => {
  const { updates, errors } = validateCompanyUpdate({
    phone: 'not-a-phone',
    email: 'not-an-email',
    defaultCurrency: 'XYZ',
    nextQuotationNumber: 0,
    unexpected: '/uploads/forged.png',
  });

  assert.deepEqual(updates, {});
  assert.deepEqual(Object.keys(errors).sort(), [
    'defaultCurrency',
    'email',
    'nextQuotationNumber',
    'phone',
    'unexpected',
  ]);
});

test('company update ignores server-managed fields in a full company response', () => {
  const { updates, errors } = validateCompanyUpdate({
    _id: '0123456789abcdef01234567',
    id: '0123456789abcdef01234567',
    __v: 0,
    createdAt: '2026-10-14T06:08:05.963Z',
    updatedAt: '2026-10-14T06:08:06.021Z',
    logoPath: '/uploads/company/logo.png',
    signaturePath: '/uploads/company/signature.png',
    logoUrl: '/uploads/company/logo.png',
    signatureUrl: '/uploads/company/signature.png',
    name: 'Updated company',
  });
  assert.deepEqual(updates, { name: 'Updated company' });
  assert.deepEqual(errors, {});
});

test('company defaults projection includes the documented form defaults', () => {
  assert.deepEqual(defaultsFields, [
    'defaultHeader',
    'defaultCurrency',
    'defaultValidityDays',
    'defaultSalutation',
    'defaultMessage',
    'defaultClosing',
    'defaultSignatory',
    'pdfClosingMessage',
    'quotationTerms',
    'invoicePaymentTerms',
  ]);
});

test('upload content detection accepts JPEG, PNG, and WebP signatures only', () => {
  assert.equal(imageExtension(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'jpg');
  assert.equal(
    imageExtension(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'png',
  );
  assert.equal(imageExtension(Buffer.from('RIFF0000WEBP')), 'webp');
  assert.equal(imageExtension(Buffer.from('<svg></svg>')), null);
});
