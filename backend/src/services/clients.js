import Client from '../models/Client.js';
import Quotation from '../models/Quotation.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Company from '../models/Company.js';
import { HttpError, escapeRegex, pageQuery } from '../lib/http.js';
import { presentDocument } from './documents.js';

const fields = [
  'name',
  'gstNumber',
  'phone',
  'email',
  'attentionName',
  'billingAddress',
  'shippingAddress',
  'city',
  'state',
  'postalCode',
  'country',
  'notes',
];

function assign(client, body) {
  const errors = {};
  if (!String(body.name || client.name || '').trim()) errors.name = 'Name is required';
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) errors.email = 'Enter a valid email';
  if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
  for (const field of fields) {
    if (body[field] !== undefined) client[field] = body[field];
  }
}

export async function listClients(query) {
  const company = await Company.current();
  const { page, perPage, skip } = pageQuery(query);
  const filter = { companyId: company._id };
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: pattern }, { phone: pattern }, { email: pattern }];
  }
  const [rows, total] = await Promise.all([
    Client.find(filter).sort({ name: 1, createdAt: -1 }).skip(skip).limit(perPage),
    Client.countDocuments(filter),
  ]);
  return { rows, meta: { currentPage: page, perPage, total } };
}

export async function getClient(id) {
  const company = await Company.current();
  const client = await Client.findOne({ _id: id, companyId: company._id });
  if (!client) throw new HttpError(404, 'Client not found');
  return client;
}

export async function createClient(body) {
  const company = await Company.current();
  const client = new Client({ companyId: company._id, country: 'India' });
  assign(client, body);
  await client.save();
  return client;
}

export async function updateClient(id, body) {
  const client = await getClient(id);
  assign(client, body);
  await client.save();
  return client;
}

export async function deleteClient(id) {
  const client = await getClient(id);
  const [quotations, invoices] = await Promise.all([
    Quotation.countDocuments({ clientId: client._id }),
    Invoice.countDocuments({ clientId: client._id }),
  ]);
  if (quotations || invoices) {
    throw new HttpError(422, 'This client is used on a quotation or invoice');
  }
  await client.deleteOne();
}

export async function clientHistory(id) {
  const client = await getClient(id);
  const [quotations, invoices] = await Promise.all([
    Quotation.find({ companyId: client.companyId, clientId: client._id, archivedAt: null }).sort({ quotationDate: -1 }),
    Invoice.find({ companyId: client.companyId, clientId: client._id }).sort({ invoiceDate: -1 }),
  ]);
  const payments = await Payment.find({
    companyId: client.companyId,
    invoiceId: { $in: invoices.map((invoice) => invoice._id) },
  }).sort({ paymentDate: -1 });
  const invoiceNumbers = new Map(invoices.map((invoice) => [String(invoice._id), invoice.number]));

  return {
    quotations: quotations.map(presentDocument),
    invoices: invoices.map(presentDocument),
    payments: payments.map((payment) => ({
      ...payment.toJSON(),
      invoiceNumber: invoiceNumbers.get(String(payment.invoiceId)) || '',
    })),
  };
}
