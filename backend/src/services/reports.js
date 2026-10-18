import Quotation from '../models/Quotation.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Client from '../models/Client.js';
import Product from '../models/Product.js';
import Company from '../models/Company.js';
import { d, money } from '../lib/money.js';
import { endOfDay, parseDate } from '../lib/dates.js';
import { refreshStatuses } from './status.js';
import { HttpError } from '../lib/http.js';

function inRange(filter, field, from, to) {
  if (!from && !to) return;
  filter[field] = {};
  if (from) filter[field].$gte = parseDate(from, 'from');
  if (to) filter[field].$lte = endOfDay(parseDate(to, 'to'));
}

function sumBy(rows, pick) {
  return money(rows.reduce((sum, row) => sum.plus(pick(row)), d(0)));
}

export async function dashboard() {
  const company = await Company.current();
  await refreshStatuses(company._id);
  const companyId = company._id;
  const [clients, products, quotations, invoices, payments] = await Promise.all([
    Client.countDocuments({ companyId }),
    Product.countDocuments({ companyId }),
    Quotation.find({ companyId, archivedAt: null }),
    Invoice.find({ companyId }),
    Payment.find({ companyId }),
  ]);

  const countStatus = (rows, status) => rows.filter((row) => row.status === status).length;
  const openInvoices = invoices.filter((invoice) => !['Draft', 'Cancelled'].includes(invoice.status));
  const recentQuotations = quotations
    .slice()
    .sort((a, b) => new Date(b.quotationDate) - new Date(a.quotationDate))
    .slice(0, 5)
    .map(brief);
  const recentInvoices = invoices
    .slice()
    .sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate))
    .slice(0, 5)
    .map(brief);

  return {
    clients,
    products,
    quotations: quotations.length,
    quotationsAccepted: countStatus(quotations, 'Accepted'),
    quotationsPending: countStatus(quotations, 'Draft') + countStatus(quotations, 'Sent'),
    quotationsRejected: countStatus(quotations, 'Rejected'),
    quotationsExpired: countStatus(quotations, 'Expired'),
    invoices: invoices.length,
    invoicesPaid: countStatus(invoices, 'Paid'),
    invoicesUnpaid: invoices.filter((invoice) => ['Issued', 'Overdue'].includes(invoice.status)).length,
    invoicesPartial: countStatus(invoices, 'Partially Paid'),
    outstandingAmount: sumBy(openInvoices, (invoice) => invoice.balanceDue),
    revenueReceived: sumBy(payments, (payment) => payment.amount),
    recentQuotations,
    recentInvoices,
    monthlyRevenue: monthlyRevenue(payments),
    conversion: {
      accepted: countStatus(quotations, 'Accepted'),
      rejected: countStatus(quotations, 'Rejected'),
      converted: countStatus(quotations, 'Converted'),
    },
    outstandingSummary: openInvoices
      .filter((invoice) => d(invoice.balanceDue).gt(0))
      .sort((a, b) => d(b.balanceDue).minus(d(a.balanceDue)).toNumber())
      .slice(0, 5)
      .map(brief),
  };
}

function brief(doc) {
  const json = doc.toJSON();
  return {
    id: json.id,
    number: json.number,
    clientName: json.clientSnapshot?.name || '',
    date: json.quotationDate || json.invoiceDate || json.dueDate,
    status: json.status,
    total: json.grandTotal,
    balanceDue: json.balanceDue,
  };
}

function monthlyRevenue(payments) {
  const months = [];
  const now = new Date();
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const amount = payments
      .filter((payment) => {
        const paid = new Date(payment.paymentDate);
        return paid.getFullYear() === date.getFullYear() && paid.getMonth() === date.getMonth();
      })
      .reduce((sum, payment) => sum.plus(payment.amount), d(0));
    months.push({ month: key, amount: money(amount) });
  }
  return months;
}

export async function report(slug, query) {
  const company = await Company.current();
  await refreshStatuses(company._id);
  const companyId = company._id;
  const quotationFilter = { companyId, archivedAt: null };
  const invoiceFilter = { companyId };
  const paymentFilter = { companyId };
  inRange(quotationFilter, 'quotationDate', query.from, query.to);
  inRange(invoiceFilter, 'invoiceDate', query.from, query.to);
  inRange(paymentFilter, 'paymentDate', query.from, query.to);

  const [quotations, invoices, payments] = await Promise.all([
    Quotation.find(quotationFilter),
    Invoice.find(invoiceFilter),
    Payment.find(paymentFilter),
  ]);
  const issued = invoices.filter((invoice) => !['Draft', 'Cancelled'].includes(invoice.status));
  const issuedSales = sumBy(issued, (invoice) => invoice.grandTotal);
  const paidAmount = sumBy(payments, (payment) => payment.amount);
  const outstanding = sumBy(issued, (invoice) => invoice.balanceDue);

  if (slug === 'quotations') {
    return groupCount(quotations, issuedSales, paidAmount, outstanding);
  }
  if (slug === 'quotation-outcomes') {
    return {
      accepted: quotations.filter((row) => row.status === 'Accepted').length,
      rejected: quotations.filter((row) => row.status === 'Rejected').length,
      converted: quotations.filter((row) => row.status === 'Converted').length,
      issuedSales,
      paidAmount,
      outstanding,
    };
  }
  if (slug === 'conversion') {
    const accepted = quotations.filter((row) => ['Accepted', 'Converted'].includes(row.status)).length;
    return { accepted, converted: quotations.filter((row) => row.status === 'Converted').length, issuedSales, paidAmount, outstanding };
  }
  if (slug === 'sales') return { rows: issued.map(briefInvoice), issuedSales, paidAmount, outstanding };
  if (slug === 'payments') return { rows: payments.map((payment) => payment.toJSON()), issuedSales, paidAmount, outstanding };
  if (slug === 'outstanding') {
    const rows = issued.filter((invoice) => d(invoice.balanceDue).gt(0)).map(briefInvoice);
    return { rows, issuedSales, paidAmount, outstanding };
  }
  if (slug === 'overdue') {
    const rows = invoices.filter((invoice) => invoice.status === 'Overdue').map(briefInvoice);
    return { rows, issuedSales, paidAmount, outstanding: sumBy(invoices.filter((invoice) => invoice.status === 'Overdue'), (invoice) => invoice.balanceDue) };
  }
  if (slug === 'clients') return { rows: clientRows(issued, payments), issuedSales, paidAmount, outstanding };
  if (slug === 'products') return { rows: productRows(issued), issuedSales, paidAmount, outstanding };
  if (slug === 'revenue') {
    const months = monthlyRevenue(payments).filter((month) => {
      if (!query.from && !query.to) return true;
      return true;
    });
    return { rows: months, yearlyTotal: paidAmount, issuedSales, paidAmount, outstanding };
  }
  throw new HttpError(404, 'Report not found');
}

function groupCount(quotations, issuedSales, paidAmount, outstanding) {
  const statuses = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted'];
  return {
    rows: statuses.map((status) => ({
      status,
      count: quotations.filter((row) => row.status === status).length,
      total: sumBy(quotations.filter((row) => row.status === status), (row) => row.grandTotal),
    })),
    issuedSales,
    paidAmount,
    outstanding,
  };
}

function briefInvoice(invoice) {
  return {
    id: invoice.id,
    number: invoice.number,
    clientName: invoice.clientSnapshot?.name || '',
    date: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    status: invoice.status,
    total: invoice.grandTotal,
    amountPaid: invoice.amountPaid,
    balanceDue: invoice.balanceDue,
  };
}

function clientRows(invoices, payments) {
  const groups = new Map();
  invoices.forEach((invoice) => {
    const key = String(invoice.clientId);
    const current = groups.get(key) || { clientName: invoice.clientSnapshot?.name || 'Client', issuedSales: d(0), paidAmount: d(0), outstanding: d(0) };
    current.issuedSales = current.issuedSales.plus(invoice.grandTotal);
    current.outstanding = current.outstanding.plus(invoice.balanceDue);
    groups.set(key, current);
  });
  payments.forEach((payment) => {
    const invoice = invoices.find((row) => String(row._id) === String(payment.invoiceId));
    if (!invoice) return;
    const current = groups.get(String(invoice.clientId));
    if (current) current.paidAmount = current.paidAmount.plus(payment.amount);
  });
  return [...groups.values()].map((row) => ({
    clientName: row.clientName,
    issuedSales: money(row.issuedSales),
    paidAmount: money(row.paidAmount),
    outstanding: money(row.outstanding),
  }));
}

function productRows(invoices) {
  const groups = new Map();
  invoices.forEach((invoice) => {
    invoice.items.forEach((item) => {
      const key = item.name;
      const current = groups.get(key) || { name: item.name, quantity: d(0), total: d(0) };
      current.quantity = current.quantity.plus(item.quantity);
      current.total = current.total.plus(item.lineTotal);
      groups.set(key, current);
    });
  });
  return [...groups.values()].map((row) => ({
    name: row.name,
    quantity: money(row.quantity),
    total: money(row.total),
  }));
}

export function toCsv(slug, data) {
  const rows = data.rows || [];
  if (!rows.length) return 'message\nNo rows\n';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((header) => csvCell(row[header])).join(','));
  });
  lines.push(`issuedSales,${data.issuedSales || ''}`);
  lines.push(`paidAmount,${data.paidAmount || ''}`);
  lines.push(`outstanding,${data.outstanding || ''}`);
  return `${lines.join('\n')}\n`;
}

function csvCell(value) {
  const text = value instanceof Date ? value.toISOString() : value ?? '';
  return `"${String(text).replaceAll('"', '""')}"`;
}
