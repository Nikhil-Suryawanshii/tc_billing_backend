import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Quotation from '../models/Quotation.js';
import Company from '../models/Company.js';
import Client from '../models/Client.js';
import { HttpError, escapeRegex, pageQuery } from '../lib/http.js';
import { d, money } from '../lib/money.js';
import { endOfDay, parseDate, startOfToday } from '../lib/dates.js';
import { priceDocument } from './totals.js';
import { takeNumber, withTransaction } from './numbering.js';
import { clientSnapshot, companySnapshot, messageFields, presentDocument, resolveClient } from './documents.js';
import { refreshStatuses } from './status.js';

function paymentStatus(invoice, amountPaid) {
  const balance = d(invoice.grandTotal).minus(amountPaid);
  if (invoice.status === 'Cancelled') return { status: 'Cancelled', amountPaid: money(amountPaid), balanceDue: money(balance) };
  if (invoice.status === 'Draft') return { status: 'Draft', amountPaid: money(amountPaid), balanceDue: money(d(invoice.grandTotal).minus(amountPaid)) };
  if (balance.lte(0)) return { status: 'Paid', amountPaid: money(amountPaid), balanceDue: '0.00' };
  if (amountPaid.gt(0)) return { status: 'Partially Paid', amountPaid: money(amountPaid), balanceDue: money(balance) };
  if (invoice.dueDate < startOfToday()) return { status: 'Overdue', amountPaid: money(amountPaid), balanceDue: money(balance) };
  return { status: 'Issued', amountPaid: money(amountPaid), balanceDue: money(balance) };
}

export async function recalculateInvoice(invoice) {
  const payments = await Payment.find({ invoiceId: invoice._id });
  const amountPaid = payments.reduce((sum, payment) => sum.plus(payment.amount), d(0));
  const next = paymentStatus(invoice, amountPaid);
  invoice.amountPaid = next.amountPaid;
  invoice.balanceDue = next.balanceDue;
  if (invoice.status !== 'Draft' && invoice.status !== 'Cancelled') invoice.status = next.status;
  await invoice.save();
  return invoice;
}

function buildPayload(company, client, body) {
  const priced = priceDocument(body.items, body.additionalCharges || 0);
  const messages = messageFields(company, body, 'invoice');
  return {
    clientId: client._id,
    poSoNumber: body.poSoNumber || '',
    header: body.header || 'Invoice',
    currency: body.currency || company.defaultCurrency || 'INR',
    invoiceDate: parseDate(body.invoiceDate, 'invoiceDate', true),
    dueDate: parseDate(body.dueDate, 'dueDate', true),
    companySnapshot: companySnapshot(company),
    clientSnapshot: clientSnapshot(client),
    salutation: messages.salutation,
    message: messages.message,
    closing: messages.closing,
    signatory: messages.signatory,
    terms: messages.terms,
    notes: messages.notes,
    paymentTerms: messages.paymentTerms,
    ...priced,
  };
}

async function findOwned(id) {
  const company = await Company.current();
  await refreshStatuses(company._id);
  const invoice = await Invoice.findOne({ _id: id, companyId: company._id });
  if (!invoice) throw new HttpError(404, 'Invoice not found');
  return { company, invoice };
}

export async function listInvoices(query) {
  const company = await Company.current();
  await refreshStatuses(company._id);
  const { page, perPage, skip } = pageQuery(query);
  const filter = { companyId: company._id };
  if (query.status) filter.status = query.status;
  if (query.clientId) filter.clientId = query.clientId;
  if (query.dateFrom || query.dateTo) {
    filter.invoiceDate = {};
    if (query.dateFrom) filter.invoiceDate.$gte = parseDate(query.dateFrom, 'dateFrom');
    if (query.dateTo) filter.invoiceDate.$lte = endOfDay(parseDate(query.dateTo, 'dateTo'));
  }
  if (query.dueFrom || query.dueTo) {
    filter.dueDate = {};
    if (query.dueFrom) filter.dueDate.$gte = parseDate(query.dueFrom, 'dueFrom');
    if (query.dueTo) filter.dueDate.$lte = endOfDay(parseDate(query.dueTo, 'dueTo'));
  }
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    const clients = await Client.find({ companyId: company._id, name: pattern }).select('_id');
    filter.$or = [{ number: pattern }, { clientId: { $in: clients.map((client) => client._id) } }];
  }
  const [rows, total] = await Promise.all([
    Invoice.find(filter).sort({ invoiceDate: -1, createdAt: -1 }).skip(skip).limit(perPage),
    Invoice.countDocuments(filter),
  ]);
  return { rows: rows.map(presentDocument), meta: { currentPage: page, perPage, total } };
}

export async function getInvoice(id) {
  const { invoice } = await findOwned(id);
  const payments = await Payment.find({ invoiceId: invoice._id }).sort({ paymentDate: -1 });
  return { ...presentDocument(invoice), payments };
}

export async function createInvoice(body) {
  const company = await Company.current();
  return withTransaction(async (session) => {
    const client = await resolveClient(company, body, session);
    const number = await takeNumber(company._id, 'invoice', session);
    const payload = buildPayload(company, client, body);
    const [invoice] = await Invoice.create(
      [
        {
          companyId: company._id,
          number,
          status: 'Draft',
          amountPaid: '0.00',
          balanceDue: payload.grandTotal,
          quotationId: body.quotationId || null,
          ...payload,
        },
      ],
      { session }
    );
    return presentDocument(invoice);
  });
}

export async function updateInvoice(id, body) {
  const { company, invoice } = await findOwned(id);
  if (invoice.status !== 'Draft') throw new HttpError(422, 'Only a draft invoice can be edited');
  const client = await resolveClient(company, { ...body, clientId: body.clientId || invoice.clientId });
  const payload = buildPayload(company, client, body);
  payload.companySnapshot = invoice.companySnapshot;
  if (String(client._id) === String(invoice.clientId)) payload.clientSnapshot = invoice.clientSnapshot;
  Object.assign(invoice, payload);
  invoice.balanceDue = money(d(invoice.grandTotal).minus(invoice.amountPaid));
  await invoice.save();
  return presentDocument(invoice);
}

export async function issueInvoice(id) {
  const { invoice } = await findOwned(id);
  if (invoice.status !== 'Draft') throw new HttpError(422, 'Only a draft invoice can be issued');
  invoice.status = 'Issued';
  await recalculateInvoice(invoice);
  return presentDocument(invoice);
}

export async function cancelInvoice(id) {
  const { invoice } = await findOwned(id);
  if (invoice.status === 'Cancelled') return presentDocument(invoice);
  invoice.status = 'Cancelled';
  invoice.cancelledAt = new Date();
  await invoice.save();
  const payments = await Payment.find({ invoiceId: invoice._id }).sort({ paymentDate: -1 });
  return { ...presentDocument(invoice), payments };
}

export async function convertQuotation(quotationId) {
  const company = await Company.current();
  return withTransaction(async (session) => {
    const quotation = await Quotation.findOne({ _id: quotationId, companyId: company._id }).session(session);
    if (!quotation) throw new HttpError(404, 'Quotation not found');
    if (quotation.status !== 'Accepted') throw new HttpError(422, 'Only an accepted quotation can be converted');
    if (quotation.convertedInvoiceId) throw new HttpError(422, 'This quotation is already converted');

    const number = await takeNumber(company._id, 'invoice', session);
    const invoiceDate = new Date();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (company.defaultValidityDays || 7));
    const [invoice] = await Invoice.create(
      [
        {
          companyId: company._id,
          clientId: quotation.clientId,
          quotationId: quotation._id,
          number,
          poSoNumber: quotation.poSoNumber,
          header: 'Invoice',
          currency: quotation.currency,
          invoiceDate,
          dueDate,
          status: 'Issued',
          companySnapshot: quotation.companySnapshot,
          clientSnapshot: quotation.clientSnapshot,
          salutation: quotation.salutation,
          message: quotation.message,
          closing: quotation.closing,
          signatory: quotation.signatory,
          terms: quotation.terms,
          notes: quotation.notes,
          paymentTerms: company.invoicePaymentTerms,
          items: quotation.items.map((item) => {
            const json = item.toObject();
            delete json._id;
            return json;
          }),
          subtotal: quotation.subtotal,
          discountTotal: quotation.discountTotal,
          taxableAmount: quotation.taxableAmount,
          taxTotal: quotation.taxTotal,
          additionalCharges: quotation.additionalCharges,
          grandTotal: quotation.grandTotal,
          amountPaid: '0.00',
          balanceDue: quotation.grandTotal,
        },
      ],
      { session }
    );
    quotation.status = 'Converted';
    quotation.convertedInvoiceId = invoice._id;
    await quotation.save({ session });
    return presentDocument(invoice);
  });
}
