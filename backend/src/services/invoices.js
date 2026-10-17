const Decimal = require('decimal.js');
const mongoose = require('mongoose');
const { Client, Company, Invoice, Payment, Product, Category, Quotation } = require('../models');
const { calculateTotals } = require('./totals');

class InvoiceError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.name = 'InvoiceError';
    this.status = status;
    this.errors = errors;
  }
}

const invoiceEditableStatuses = ['Draft'];
const snapshotFields = {
  company: [
    'name', 'logoPath', 'signaturePath', 'gstNumber', 'addressLine1', 'addressLine2',
    'city', 'state', 'postalCode', 'country', 'phone', 'email', 'website', 'defaultCurrency',
  ],
  client: [
    'name', 'gstNumber', 'phone', 'email', 'attentionName', 'billingAddress',
    'shippingAddress', 'city', 'state', 'postalCode', 'country',
  ],
};

function snapshot(source, fields) {
  return Object.fromEntries(fields.map((field) => [field, source[field] ?? '']));
}

function dateOnlyUTC(date) {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function calculateInvoiceStatus(invoice, now = new Date()) {
  if (invoice.status === 'Cancelled' || invoice.status === 'Draft') return invoice.status;
  const paid = new Decimal(invoice.amountPaid || '0.00');
  const total = new Decimal(invoice.grandTotal || '0.00');
  const due = new Decimal(invoice.balanceDue || '0.00');
  if (paid.gte(total) && total.gt(0)) return 'Paid';
  if (invoice.dueDate && dateOnlyUTC(invoice.dueDate) < dateOnlyUTC(now) && due.gt(0)) {
    return 'Overdue';
  }
  if (paid.gt(0)) return 'Partially Paid';
  return 'Issued';
}

async function nextInvoiceNumber(companyId, session) {
  const company = await Company.findOneAndUpdate(
    { _id: companyId },
    { $inc: { nextInvoiceNumber: 1 } },
    { new: false, session, runValidators: true },
  );
  if (!company) throw new InvoiceError('Company is not seeded.', 404);
  return `${company.invoicePrefix || 'INV'} ${company.nextInvoiceNumber}`;
}

async function validateItemReferences(items, companyId, session) {
  for (const [index, item] of items.entries()) {
    if (item.categoryId) {
      const category = await Category.exists({ _id: item.categoryId, companyId }).session(session);
      if (!category) {
        throw new InvoiceError('Invoice item category was not found.', 422, {
          [`items.${index}.categoryId`]: 'Category not found for this company.',
        });
      }
    }
    if (item.productId) {
      const product = await Product.exists({ _id: item.productId, companyId }).session(session);
      if (!product) {
        throw new InvoiceError('Invoice item product was not found.', 422, {
          [`items.${index}.productId`]: 'Product not found for this company.',
        });
      }
    }
  }
}

async function resolveClient(body, companyId, session, currentClientId) {
  const clientId = body.clientId || currentClientId;
  const client = await Client.findOne({ _id: clientId, companyId }).session(session);
  if (!client) throw new InvoiceError('Client not found for this company.', 422, { clientId: 'Client not found for this company.' });
  return client;
}

function invoiceFields(body, company, client, totals) {
  const fields = [
    'poSoNumber', 'header', 'currency', 'invoiceDate', 'dueDate',
    'salutation', 'message', 'closing', 'signatory', 'terms', 'notes', 'paymentTerms',
  ];
  const defaults = {
    header: 'Invoice',
    currency: company.defaultCurrency,
    salutation: company.defaultSalutation,
    message: company.defaultMessage,
    closing: company.defaultClosing,
    signatory: company.defaultSignatory,
    terms: company.invoicePaymentTerms,
    paymentTerms: company.invoicePaymentTerms,
  };
  const provided = Object.fromEntries(fields
    .filter((field) => body[field] !== undefined)
    .map((field) => [field, body[field]]));
  return {
    ...defaults,
    ...provided,
    companySnapshot: snapshot(company, snapshotFields.company),
    clientSnapshot: snapshot(client, snapshotFields.client),
    ...totals,
  };
}

async function createInvoice({ body, companyId }) {
  const session = await mongoose.startSession();
  let created;
  try {
    await session.withTransaction(async () => {
      const company = await Company.findById(companyId).session(session);
      if (!company) throw new InvoiceError('Company is not seeded.', 404);
      const client = await resolveClient(body, companyId, session);
      await validateItemReferences(body.items, companyId, session);
      const totals = calculateTotals(body.items, body.additionalCharges ?? '0');
      const number = await nextInvoiceNumber(companyId, session);
      const invoice = new Invoice({
        companyId,
        clientId: client._id,
        number,
        status: 'Draft',
        ...invoiceFields(body, company, client, totals),
        amountPaid: '0.00',
        balanceDue: totals.grandTotal,
      });
      await invoice.save({ session });
      created = invoice;
    });
    return created;
  } finally {
    await session.endSession();
  }
}

async function updateDraftInvoice({ invoiceId, companyId, body }) {
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      const invoice = await Invoice.findOne({ _id: invoiceId, companyId }).session(session);
      if (!invoice) throw new InvoiceError('Invoice not found.', 404);
      if (!invoiceEditableStatuses.includes(invoice.status)) {
        throw new InvoiceError('Only Draft invoices can be edited.', 422);
      }
      const company = await Company.findById(companyId).session(session);
      const client = await resolveClient(body, companyId, session, invoice.clientId);
      const items = body.items === undefined ? invoice.items.map((item) => item.toObject()) : body.items;
      await validateItemReferences(items, companyId, session);
      const totals = calculateTotals(
        items,
        body.additionalCharges === undefined ? invoice.additionalCharges : body.additionalCharges,
      );
      const fields = [
        'poSoNumber', 'header', 'currency', 'invoiceDate', 'dueDate',
        'salutation', 'message', 'closing', 'signatory', 'terms', 'notes', 'paymentTerms',
      ];
      Object.assign(invoice, Object.fromEntries(fields
        .filter((field) => body[field] !== undefined)
        .map((field) => [field, body[field]])), {
        ...(body.items !== undefined ? { items: body.items } : {}),
        ...(body.additionalCharges !== undefined ? { additionalCharges: body.additionalCharges } : {}),
        clientId: client._id,
        companySnapshot: snapshot(company, snapshotFields.company),
        clientSnapshot: snapshot(client, snapshotFields.client),
        ...totals,
        balanceDue: totals.grandTotal,
      });
      await invoice.save({ session });
      updated = invoice;
    });
    return updated;
  } finally {
    await session.endSession();
  }
}

async function convertAcceptedQuotation({ quotationId, companyId }) {
  const session = await mongoose.startSession();
  let converted;
  try {
    await session.withTransaction(async () => {
      const quotation = await Quotation.findOne({
        _id: quotationId,
        companyId,
        archivedAt: null,
      }).session(session);
      if (!quotation) throw new InvoiceError('Quotation not found.', 404);
      if (quotation.convertedInvoiceId) {
        throw new InvoiceError('Quotation has already been converted.', 422);
      }
      if (quotation.status !== 'Accepted') {
        throw new InvoiceError('Only Accepted quotations can be converted.', 422);
      }
      const company = await Company.findById(companyId).session(session);
      const client = await Client.findOne({ _id: quotation.clientId, companyId }).session(session);
      if (!company || !client) throw new InvoiceError('Company or client record was not found.', 404);
      const number = await nextInvoiceNumber(companyId, session);
      const invoiceDate = new Date();
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + company.defaultValidityDays);
      const invoice = new Invoice({
        companyId,
        clientId: quotation.clientId,
        number,
        quotationId: quotation._id,
        status: 'Issued',
        poSoNumber: quotation.poSoNumber,
        header: 'Invoice',
        currency: quotation.currency,
        invoiceDate,
        dueDate,
        quotationDate: quotation.quotationDate,
        validUntil: quotation.validUntil,
        companySnapshot: quotation.companySnapshot.toObject(),
        clientSnapshot: quotation.clientSnapshot.toObject(),
        salutation: quotation.salutation,
        message: quotation.message,
        closing: quotation.closing,
        signatory: quotation.signatory,
        terms: quotation.terms,
        notes: quotation.notes,
        paymentTerms: company.invoicePaymentTerms,
        items: quotation.items.map((item) => item.toObject()),
        subtotal: quotation.subtotal,
        discountTotal: quotation.discountTotal,
        taxableAmount: quotation.taxableAmount,
        taxTotal: quotation.taxTotal,
        additionalCharges: quotation.additionalCharges,
        grandTotal: quotation.grandTotal,
        amountPaid: '0.00',
        balanceDue: quotation.grandTotal,
      });
      await invoice.save({ session });
      quotation.status = 'Converted';
      quotation.convertedInvoiceId = invoice._id;
      await quotation.save({ session });
      converted = invoice;
    });
    return converted;
  } finally {
    await session.endSession();
  }
}

async function recordPayment({ invoiceId, companyId, body }) {
  const session = await mongoose.startSession();
  let payment;
  let updatedInvoice;
  try {
    await session.withTransaction(async () => {
      const invoice = await Invoice.findOne({ _id: invoiceId, companyId }).session(session);
      if (!invoice) throw new InvoiceError('Invoice not found.', 404);
      if (invoice.status === 'Cancelled') {
        throw new InvoiceError('Cancelled invoices cannot receive payments.', 422);
      }
      if (!['Issued', 'Partially Paid', 'Overdue'].includes(invoice.status)) {
        throw new InvoiceError('Only issued invoices can receive payments.', 422);
      }
      const amount = new Decimal(body.amount);
      const balance = new Decimal(invoice.balanceDue);
      if (amount.lte(0)) throw new InvoiceError('Payment must be greater than zero.', 422, { amount: 'Must be greater than zero.' });
      if (amount.gt(balance)) throw new InvoiceError('Payment cannot exceed the current balance.', 422, { amount: 'Cannot exceed the current invoice balance.' });

      const [created] = await Payment.create([{
        companyId,
        invoiceId: invoice._id,
        ...body,
      }], { session });
      const payments = await Payment.find({ companyId, invoiceId: invoice._id }).session(session);
      const amountPaid = payments.reduce(
        (total, record) => total.plus(new Decimal(record.amount)),
        new Decimal(0),
      );
      invoice.amountPaid = amountPaid.toFixed(2, Decimal.ROUND_HALF_UP);
      invoice.balanceDue = new Decimal(invoice.grandTotal)
        .minus(amountPaid).toFixed(2, Decimal.ROUND_HALF_UP);
      invoice.status = calculateInvoiceStatus(invoice);
      await invoice.save({ session });
      payment = created;
      updatedInvoice = invoice;
    });
    return { payment, invoice: updatedInvoice };
  } finally {
    await session.endSession();
  }
}

async function removePayment({ paymentId, companyId }) {
  const session = await mongoose.startSession();
  let removed;
  let updatedInvoice;
  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOne({ _id: paymentId, companyId }).session(session);
      if (!payment) throw new InvoiceError('Payment not found.', 404);
      const invoice = await Invoice.findOne({ _id: payment.invoiceId, companyId }).session(session);
      if (!invoice) throw new InvoiceError('Invoice not found.', 404);

      await payment.deleteOne({ session });
      const payments = await Payment.find({ companyId, invoiceId: invoice._id }).session(session);
      const amountPaid = payments.reduce(
        (total, record) => total.plus(new Decimal(record.amount)),
        new Decimal(0),
      );
      invoice.amountPaid = amountPaid.toFixed(2, Decimal.ROUND_HALF_UP);
      invoice.balanceDue = new Decimal(invoice.grandTotal)
        .minus(amountPaid).toFixed(2, Decimal.ROUND_HALF_UP);
      if (invoice.status !== 'Cancelled') {
        invoice.status = calculateInvoiceStatus(invoice);
      }
      await invoice.save({ session });
      removed = payment;
      updatedInvoice = invoice;
    });
    return { payment: removed, invoice: updatedInvoice };
  } finally {
    await session.endSession();
  }
}

module.exports = {
  InvoiceError,
  calculateInvoiceStatus,
  createInvoice,
  updateDraftInvoice,
  convertAcceptedQuotation,
  recordPayment,
  removePayment,
};
