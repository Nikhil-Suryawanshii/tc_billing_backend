import Company from '../models/Company.js';
import { HttpError } from '../lib/http.js';
import { removeUpload } from './files.js';

const fields = [
  'name',
  'gstNumber',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'country',
  'phone',
  'email',
  'website',
  'bankName',
  'bankAccountName',
  'bankAccountNumber',
  'bankIfsc',
  'bankBranch',
  'bankUpi',
  'defaultCurrency',
  'defaultHeader',
  'defaultValidityDays',
  'defaultSalutation',
  'defaultMessage',
  'defaultClosing',
  'defaultSignatory',
  'pdfClosingMessage',
  'quotationTerms',
  'invoicePaymentTerms',
  'quotationPrefix',
  'invoicePrefix',
  'nextQuotationNumber',
  'nextInvoiceNumber',
];

function validate(body) {
  const errors = {};
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) errors.email = 'Enter a valid email';
  if (body.phone && !/^[0-9+\-\s]{7,20}$/.test(body.phone)) errors.phone = 'Enter a valid phone number';
  if (body.defaultCurrency !== undefined && !String(body.defaultCurrency).trim()) {
    errors.defaultCurrency = 'Currency is required';
  }
  for (const key of ['defaultValidityDays', 'nextQuotationNumber', 'nextInvoiceNumber']) {
    if (body[key] !== undefined && (!Number.isFinite(Number(body[key])) || Number(body[key]) < 0)) {
      errors[key] = 'Enter a valid number';
    }
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
}

export async function getCompany() {
  return Company.current();
}

export async function getDefaults() {
  const company = await Company.current();
  return {
    header: company.defaultHeader,
    currency: company.defaultCurrency,
    validityDays: company.defaultValidityDays,
    salutation: company.defaultSalutation,
    message: company.defaultMessage,
    closing: company.defaultClosing,
    signatory: company.defaultSignatory,
    pdfClosingMessage: company.pdfClosingMessage,
    quotationTerms: company.quotationTerms,
    invoicePaymentTerms: company.invoicePaymentTerms,
  };
}

export async function updateCompany(body) {
  validate(body);
  const company = await Company.current();
  for (const field of fields) {
    if (body[field] !== undefined) company[field] = body[field];
  }
  if (!String(company.name || '').trim()) {
    throw new HttpError(422, 'Validation failed', { name: 'Company name is required' });
  }
  await company.save();
  return company;
}

export async function saveImage(kind, publicPath) {
  const company = await Company.current();
  const field = kind === 'signature' ? 'signaturePath' : 'logoPath';
  const previous = company[field];
  company[field] = publicPath;
  await company.save();
  if (previous && previous !== publicPath) await removeUpload(previous);
  return company;
}
