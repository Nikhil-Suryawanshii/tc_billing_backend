import Quotation from '../models/Quotation.js';
import Company from '../models/Company.js';
import { HttpError, escapeRegex, pageQuery } from '../lib/http.js';
import { d } from '../lib/money.js';
import { addDays, endOfDay, parseDate } from '../lib/dates.js';
import { priceDocument } from './totals.js';
import { takeNumber, withTransaction } from './numbering.js';
import { clientSnapshot, companySnapshot, messageFields, presentDocument, resolveClient } from './documents.js';
import { refreshStatuses } from './status.js';
import Client from '../models/Client.js';

const statusValues = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'];

function buildPayload(company, client, body) {
  const priced = priceDocument(body.items, body.additionalCharges || 0);
  const quotationDate = parseDate(body.quotationDate, 'quotationDate', true);
  const validUntil = body.validUntil
    ? parseDate(body.validUntil, 'validUntil')
    : addDays(quotationDate, company.defaultValidityDays || 7);
  const messages = messageFields(company, body, 'quotation');

  return {
    clientId: client._id,
    poSoNumber: body.poSoNumber || '',
    header: body.header || company.defaultHeader || 'Quotation',
    currency: body.currency || company.defaultCurrency || 'INR',
    quotationDate,
    validUntil,
    companySnapshot: companySnapshot(company),
    clientSnapshot: clientSnapshot(client),
    ...messages,
    ...priced,
  };
}

async function findOwned(id) {
  const company = await Company.current();
  await refreshStatuses(company._id);
  const quotation = await Quotation.findOne({ _id: id, companyId: company._id });
  if (!quotation) throw new HttpError(404, 'Quotation not found');
  return { company, quotation };
}

export async function listQuotations(query) {
  const company = await Company.current();
  await refreshStatuses(company._id);
  const { page, perPage, skip } = pageQuery(query);
  const filter = { companyId: company._id, archivedAt: query.archived === '1' ? { $ne: null } : null };
  if (query.status) filter.status = query.status;
  if (query.clientId) filter.clientId = query.clientId;
  if (query.dateFrom || query.dateTo) {
    filter.quotationDate = {};
    if (query.dateFrom) filter.quotationDate.$gte = parseDate(query.dateFrom, 'dateFrom');
    if (query.dateTo) filter.quotationDate.$lte = endOfDay(parseDate(query.dateTo, 'dateTo'));
  }
  if (query.amountMin || query.amountMax) {
    const rows = await Quotation.find(filter);
    const min = query.amountMin ? d(query.amountMin) : null;
    const max = query.amountMax ? d(query.amountMax) : null;
    const ids = rows
      .filter((row) => {
        const total = d(row.grandTotal);
        if (min && total.lt(min)) return false;
        if (max && total.gt(max)) return false;
        return true;
      })
      .map((row) => row._id);
    filter._id = { $in: ids };
  }
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    const clients = await Client.find({ companyId: company._id, name: pattern }).select('_id');
    filter.$or = [{ number: pattern }, { clientId: { $in: clients.map((client) => client._id) } }];
  }

  const sortField = ['quotationDate', 'number', 'status', 'createdAt'].includes(query.sort) ? query.sort : 'quotationDate';
  const direction = query.direction === 'asc' ? 1 : -1;
  const [rows, total] = await Promise.all([
    Quotation.find(filter).sort({ [sortField]: direction, createdAt: -1 }).skip(skip).limit(perPage),
    Quotation.countDocuments(filter),
  ]);
  return { rows: rows.map(presentDocument), meta: { currentPage: page, perPage, total } };
}

export async function getQuotation(id) {
  const { quotation } = await findOwned(id);
  return presentDocument(quotation);
}

export async function createQuotation(body) {
  const company = await Company.current();
  return withTransaction(async (session) => {
    const client = await resolveClient(company, body, session);
    const number = await takeNumber(company._id, 'quotation', session);
    const [quotation] = await Quotation.create(
      [
        {
          companyId: company._id,
          number,
          status: 'Draft',
          ...buildPayload(company, client, body),
        },
      ],
      { session }
    );
    return presentDocument(quotation);
  });
}

export async function updateQuotation(id, body) {
  const { company, quotation } = await findOwned(id);
  if (quotation.convertedInvoiceId) throw new HttpError(422, 'A converted quotation cannot be edited');
  const client = body.clientId || body.clientName || body.client ? await resolveClient(company, body) : null;
  const payload = buildPayload(company, client || { _id: quotation.clientId, ...quotation.clientSnapshot, billingAddress: quotation.clientSnapshot?.billingAddress }, body);
  payload.companySnapshot = quotation.companySnapshot;
  if (!client || String(client._id) === String(quotation.clientId)) {
    payload.clientId = quotation.clientId;
    payload.clientSnapshot = quotation.clientSnapshot;
  }
  Object.assign(quotation, payload);
  await quotation.save();
  return presentDocument(quotation);
}

export async function duplicateQuotation(id) {
  const { company, quotation } = await findOwned(id);
  return withTransaction(async (session) => {
    const number = await takeNumber(company._id, 'quotation', session);
    const [copy] = await Quotation.create(
      [
        {
          companyId: company._id,
          clientId: quotation.clientId,
          number,
          poSoNumber: quotation.poSoNumber,
          header: quotation.header,
          currency: quotation.currency,
          quotationDate: quotation.quotationDate,
          validUntil: quotation.validUntil,
          status: 'Draft',
          companySnapshot: quotation.companySnapshot,
          clientSnapshot: quotation.clientSnapshot,
          salutation: quotation.salutation,
          message: quotation.message,
          closing: quotation.closing,
          signatory: quotation.signatory,
          terms: quotation.terms,
          notes: quotation.notes,
          validityText: quotation.validityText,
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
          convertedInvoiceId: null,
          archivedAt: null,
        },
      ],
      { session }
    );
    return presentDocument(copy);
  });
}

export async function changeStatus(id, status) {
  if (!statusValues.includes(status)) {
    throw new HttpError(422, 'Validation failed', { status: 'Choose a valid status' });
  }
  const { quotation } = await findOwned(id);
  if (quotation.status === 'Converted' || quotation.convertedInvoiceId) {
    throw new HttpError(422, 'A converted quotation cannot change status here');
  }
  quotation.status = status;
  await quotation.save();
  return presentDocument(quotation);
}

export async function archiveQuotation(id) {
  const { quotation } = await findOwned(id);
  quotation.archivedAt = new Date();
  await quotation.save();
  return presentDocument(quotation);
}
