import Company from '../models/Company.js';
import Client from '../models/Client.js';
import { HttpError } from '../lib/http.js';

export function companySnapshot(company) {
  return {
    name: company.name,
    gstNumber: company.gstNumber,
    addressLine1: company.addressLine1,
    addressLine2: company.addressLine2,
    phone: company.phone,
    email: company.email,
    website: company.website,
    logoPath: company.logoPath,
    bankName: company.bankName,
    bankAccountName: company.bankAccountName,
    bankAccountNumber: company.bankAccountNumber,
    bankIfsc: company.bankIfsc,
    bankBranch: company.bankBranch,
    bankUpi: company.bankUpi,
  };
}

export function clientSnapshot(client) {
  return {
    name: client.name,
    gstNumber: client.gstNumber,
    phone: client.phone,
    email: client.email,
    attentionName: client.attentionName,
    billingAddress: client.billingAddress,
    addressLine1: client.billingAddress,
    addressLine2: [client.city, client.state, client.postalCode, client.country].filter(Boolean).join(', '),
    city: client.city,
    state: client.state,
    postalCode: client.postalCode,
    country: client.country,
  };
}

export function presentDocument(doc) {
  const json = doc.toJSON();
  json.clientName = json.clientSnapshot?.name || '';
  return json;
}

export async function resolveClient(company, body, session) {
  if (body.clientId) {
    const query = Client.findOne({ _id: body.clientId, companyId: company._id });
    const client = session ? await query.session(session) : await query;
    if (!client) throw new HttpError(422, 'Validation failed', { clientId: 'Choose a valid client' });
    return client;
  }

  const name = String(body.clientName || body.client?.name || '').trim();
  if (!name) throw new HttpError(422, 'Validation failed', { clientId: 'Choose or enter a client' });

  const source = body.client || body;
  const [created] = await Client.create(
    [
      {
        companyId: company._id,
        name,
        gstNumber: source.gstNumber || source.clientGstNumber || '',
        phone: source.phone || source.clientPhone || '',
        email: source.email || source.clientEmail || '',
        attentionName: source.attentionName || '',
        billingAddress: source.billingAddress || source.address || '',
        shippingAddress: source.shippingAddress || '',
        city: source.city || '',
        state: source.state || '',
        postalCode: source.postalCode || '',
        country: source.country || 'India',
        notes: source.notes || '',
      },
    ],
    { session }
  );
  return created;
}

export function messageFields(company, body, kind) {
  return {
    salutation: body.salutation ?? company.defaultSalutation,
    message: body.message ?? company.defaultMessage,
    closing: body.closing ?? company.defaultClosing,
    signatory: body.signatory ?? company.defaultSignatory,
    terms: body.terms ?? company.pdfClosingMessage,
    notes: body.notes ?? '',
    validityText: body.validityText ?? company.quotationTerms,
    paymentTerms: kind === 'invoice' ? body.paymentTerms ?? company.invoicePaymentTerms : undefined,
  };
}

export async function loadCompany() {
  return Company.current();
}
