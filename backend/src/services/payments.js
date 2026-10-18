import Payment from '../models/Payment.js';
import Invoice from '../models/Invoice.js';
import Company from '../models/Company.js';
import { HttpError, pageQuery } from '../lib/http.js';
import { d, money } from '../lib/money.js';
import { endOfDay, parseDate } from '../lib/dates.js';
import { recalculateInvoice } from './invoices.js';

export async function listPayments(query) {
  const company = await Company.current();
  const { page, perPage, skip } = pageQuery(query);
  const filter = { companyId: company._id };
  if (query.invoiceId) filter.invoiceId = query.invoiceId;
  if (query.dateFrom || query.dateTo) {
    filter.paymentDate = {};
    if (query.dateFrom) filter.paymentDate.$gte = parseDate(query.dateFrom, 'dateFrom');
    if (query.dateTo) filter.paymentDate.$lte = endOfDay(parseDate(query.dateTo, 'dateTo'));
  }
  if (query.clientId) {
    const invoices = await Invoice.find({ companyId: company._id, clientId: query.clientId }).select('_id');
    filter.invoiceId = { $in: invoices.map((invoice) => invoice._id) };
  }
  const [rows, total] = await Promise.all([
    Payment.find(filter).sort({ paymentDate: -1 }).skip(skip).limit(perPage),
    Payment.countDocuments(filter),
  ]);
  const invoices = await Invoice.find({ _id: { $in: rows.map((row) => row.invoiceId) } });
  const names = new Map(invoices.map((invoice) => [String(invoice._id), invoice]));
  return {
    rows: rows.map((payment) => {
      const invoice = names.get(String(payment.invoiceId));
      return {
        ...payment.toJSON(),
        invoiceNumber: invoice?.number || '',
        clientName: invoice?.clientSnapshot?.name || '',
      };
    }),
    meta: { currentPage: page, perPage, total },
  };
}

export async function invoicePayments(invoiceId) {
  const company = await Company.current();
  const invoice = await Invoice.findOne({ _id: invoiceId, companyId: company._id });
  if (!invoice) throw new HttpError(404, 'Invoice not found');
  return Payment.find({ invoiceId: invoice._id }).sort({ paymentDate: -1 });
}

export async function addPayment(invoiceId, body) {
  const company = await Company.current();
  const invoice = await Invoice.findOne({ _id: invoiceId, companyId: company._id });
  if (!invoice) throw new HttpError(404, 'Invoice not found');
  if (invoice.status === 'Draft') throw new HttpError(422, 'Issue the invoice before recording a payment');
  if (invoice.status === 'Cancelled') throw new HttpError(422, 'A cancelled invoice cannot take a payment');

  const amount = d(body.amount);
  if (!amount.isFinite() || amount.lte(0)) {
    throw new HttpError(422, 'Validation failed', { amount: 'Enter an amount greater than zero' });
  }
  if (amount.gt(d(invoice.balanceDue))) {
    throw new HttpError(422, 'Validation failed', { amount: 'Amount cannot exceed the balance due' });
  }

  const payment = await Payment.create({
    companyId: company._id,
    invoiceId: invoice._id,
    amount: money(amount),
    paymentDate: parseDate(body.paymentDate, 'paymentDate', true),
    method: body.method || '',
    reference: body.reference || '',
    notes: body.notes || '',
  });
  const updated = await recalculateInvoice(invoice);
  return { payment, invoice: updated };
}

export async function deletePayment(id) {
  const company = await Company.current();
  const payment = await Payment.findOne({ _id: id, companyId: company._id });
  if (!payment) throw new HttpError(404, 'Payment not found');
  const invoice = await Invoice.findOne({ _id: payment.invoiceId, companyId: company._id });
  if (invoice?.status === 'Cancelled') throw new HttpError(422, 'Payments on a cancelled invoice stay on record');
  await payment.deleteOne();
  if (invoice) await recalculateInvoice(invoice);
}
