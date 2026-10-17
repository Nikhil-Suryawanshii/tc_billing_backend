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
    logoPath: '/uploads/forged.png',
  });

  assert.deepEqual(updates, {});
  assert.deepEqual(Object.keys(errors).sort(), [
    'defaultCurrency',
    'email',
    'logoPath',
    'nextQuotationNumber',
    'phone',
  ]);
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
