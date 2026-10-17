const express = require('express');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { Client, Company, Invoice, Payment } = require('../models');
const {
  InvoiceError,
  calculateInvoiceStatus,
  convertAcceptedQuotation,
  createInvoice,
  recordPayment,
  updateDraftInvoice,
} = require('../services/invoices');
const { escapeRegex } = require('../utils/clientValidation');
const { validateInvoiceInput, validatePaymentInput } = require('../utils/invoiceValidation');

const router = express.Router();
const invoiceStatuses = ['Draft', 'Issued', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'];

function sendValidationError(res, errors) {
  return res.status(422).json({ data: null, message: 'Validation failed.', errors });
}

function parseInteger(value, fallback, field, errors, max) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max) {
    errors[field] = `Must be an integer between 1 and ${max}.`;
    return fallback;
  }
  return Number(value);
}

function parseDateQuery(query, key, errors) {
  if (query[key] === undefined) return undefined;
  if (typeof query[key] !== 'string') {
    errors[key] = 'Must be a valid date.';
    return undefined;
  }
  const date = new Date(query[key]);
  if (Number.isNaN(date.getTime())) {
    errors[key] = 'Must be a valid date.';
    return undefined;
  }
  return date;
}

function displayInvoice(invoice) {
  const data = typeof invoice.toObject === 'function' ? invoice.toObject() : invoice;
  data.status = calculateInvoiceStatus(data);
  return data;
}

function handleInvoiceError(error, res, next) {
  if (error instanceof InvoiceError) {
    if (error.errors) return sendValidationError(res, error.errors);
    return res.status(error.status).json({ data: null, message: error.message });
  }
  if (error && error.name === 'TypeError') {
    return sendValidationError(res, { totals: error.message });
  }
  if (error && error.code === 11000) {
    return res.status(409).json({ data: null, message: 'Invoice number conflict; retry the request.' });
  }
  if (error && (error.code === 20 || /Transaction numbers are only allowed/.test(error.message))) {
    console.error('Invoice numbering requires MongoDB transaction support:', error);
    return res.status(503).json({
      data: null,
      message: 'Invoice operations require a MongoDB replica set or sharded cluster.',
    });
  }
  return next(error);
}

router.use(async (req, res, next) => {
  try {
    await connectDB();
    req.company = await Company.current();
    if (!req.company) return res.status(404).json({ data: null, message: 'Company is not seeded.' });
    return next();
  } catch (error) {
    console.error('Invoices API database connection failed:', error);
    return res.status(503).json({ data: null, message: 'Database connection unavailable.' });
  }
});

router.get('/', async (req, res, next) => {
  const errors = {};
  const page = parseInteger(req.query.page, 1, 'page', errors, 1000000);
  const perPage = parseInteger(req.query.perPage, 20, 'perPage', errors, 100);
  const allowed = ['invoiceDateFrom', 'invoiceDateTo', 'dueDateFrom', 'dueDateTo', 'clientId', 'status', 'search', 'page', 'perPage'];
  for (const key of Object.keys(req.query)) {
    if (!allowed.includes(key)) errors[key] = 'Unsupported query parameter.';
  }
  if (req.query.clientId !== undefined
    && (typeof req.query.clientId !== 'string' || !mongoose.isValidObjectId(req.query.clientId))) {
    errors.clientId = 'Must be a valid client id.';
  }
  if (req.query.status !== undefined && !invoiceStatuses.includes(req.query.status)) {
    errors.status = `Must be one of: ${invoiceStatuses.join(', ')}.`;
  }
  if (req.query.search !== undefined && typeof req.query.search !== 'string') {
    errors.search = 'Must be a string.';
  }
  const invoiceDateFrom = parseDateQuery(req.query, 'invoiceDateFrom', errors);
  const invoiceDateTo = parseDateQuery(req.query, 'invoiceDateTo', errors);
  const dueDateFrom = parseDateQuery(req.query, 'dueDateFrom', errors);
  const dueDateTo = parseDateQuery(req.query, 'dueDateTo', errors);
  if (invoiceDateFrom && invoiceDateTo && invoiceDateFrom > invoiceDateTo) {
    errors.invoiceDateTo = 'Must be on or after invoiceDateFrom.';
  }
  if (dueDateFrom && dueDateTo && dueDateFrom > dueDateTo) {
    errors.dueDateTo = 'Must be on or after dueDateFrom.';
  }
  if (Object.keys(errors).length) return sendValidationError(res, errors);

  const query = { companyId: req.company._id };
  if (req.query.clientId) query.clientId = req.query.clientId;
  if (req.query.status === 'Overdue') {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    query.status = { $in: ['Issued', 'Partially Paid', 'Overdue'] };
    query.dueDate = { $lt: today };
    query.balanceDue = { $gt: '0.00' };
  } else if (req.query.status) {
    query.status = req.query.status;
  }
  if (invoiceDateFrom || invoiceDateTo) {
    query.invoiceDate = {};
    if (invoiceDateFrom) query.invoiceDate.$gte = invoiceDateFrom;
    if (invoiceDateTo) {
      invoiceDateTo.setUTCHours(23, 59, 59, 999);
      query.invoiceDate.$lte = invoiceDateTo;
    }
  }
  if (dueDateFrom || dueDateTo) {
    query.dueDate = query.dueDate || {};
    if (dueDateFrom) query.dueDate.$gte = dueDateFrom;
    if (dueDateTo) {
      dueDateTo.setUTCHours(23, 59, 59, 999);
      query.dueDate.$lte = dueDateTo;
    }
  }

  try {
    if (req.query.search) {
      const expression = new RegExp(escapeRegex(req.query.search.trim()), 'i');
      const clients = await Client.find({ companyId: req.company._id, name: expression })
        .select('_id').lean();
      query.$or = [
        { number: expression },
        { clientId: { $in: clients.map((client) => client._id) } },
      ];
    }
    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .sort({ invoiceDate: -1, createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .lean(),
      Invoice.countDocuments(query),
    ]);
    return res.json({
      data: invoices.map(displayInvoice),
      message: 'Invoices retrieved.',
      meta: { currentPage: page, perPage, total },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  const { updates, errors } = validateInvoiceInput(req.body);
  if (Object.keys(errors).length) return sendValidationError(res, errors);
  try {
    const invoice = await createInvoice({ body: updates, companyId: req.company._id });
    return res.status(201).json({ data: displayInvoice(invoice), message: 'Invoice draft created.' });
  } catch (error) {
    return handleInvoiceError(error, res, next);
  }
});

router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ data: null, message: 'Invoice not found.' });
  }
  return next();
});

router.get('/:id', async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, companyId: req.company._id });
    if (!invoice) return res.status(404).json({ data: null, message: 'Invoice not found.' });
    const payments = await Payment.find({ companyId: req.company._id, invoiceId: invoice._id })
      .sort({ paymentDate: -1, createdAt: -1 }).lean();
    return res.json({
      data: { ...displayInvoice(invoice), payments },
      message: 'Invoice retrieved.',
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  const { updates, errors } = validateInvoiceInput(req.body, { partial: true });
  if (Object.keys(errors).length) return sendValidationError(res, errors);
  if (!Object.keys(updates).length) {
    return sendValidationError(res, { body: 'Provide at least one invoice field to update.' });
  }
  try {
    const invoice = await updateDraftInvoice({
      invoiceId: req.params.id,
      companyId: req.company._id,
      body: updates,
    });
    return res.json({ data: displayInvoice(invoice), message: 'Invoice updated.' });
  } catch (error) {
    return handleInvoiceError(error, res, next);
  }
});

router.post('/:id/issue', async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, companyId: req.company._id });
    if (!invoice) return res.status(404).json({ data: null, message: 'Invoice not found.' });
    if (invoice.status !== 'Draft') {
      return sendValidationError(res, { status: 'Only Draft invoices can be issued.' });
    }
    invoice.status = 'Issued';
    invoice.status = calculateInvoiceStatus(invoice);
    await invoice.save();
    return res.json({ data: displayInvoice(invoice), message: 'Invoice issued.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, companyId: req.company._id });
    if (!invoice) return res.status(404).json({ data: null, message: 'Invoice not found.' });
    if (invoice.status === 'Cancelled') {
      return res.json({ data: displayInvoice(invoice), message: 'Invoice is already cancelled.' });
    }
    invoice.status = 'Cancelled';
    invoice.cancelledAt = new Date();
    await invoice.save();
    return res.json({ data: displayInvoice(invoice), message: 'Invoice cancelled.' });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/payments', async (req, res, next) => {
  try {
    const invoice = await Invoice.exists({ _id: req.params.id, companyId: req.company._id });
    if (!invoice) return res.status(404).json({ data: null, message: 'Invoice not found.' });
    const payments = await Payment.find({ companyId: req.company._id, invoiceId: req.params.id })
      .sort({ paymentDate: -1, createdAt: -1 }).lean();
    return res.json({ data: payments, message: 'Invoice payments retrieved.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/payments', async (req, res, next) => {
  const { updates, errors } = validatePaymentInput(req.body);
  if (Object.keys(errors).length) return sendValidationError(res, errors);
  try {
    const result = await recordPayment({
      invoiceId: req.params.id,
      companyId: req.company._id,
      body: updates,
    });
    return res.status(201).json({
      data: { payment: result.payment, invoice: displayInvoice(result.invoice) },
      message: 'Payment recorded.',
    });
  } catch (error) {
    return handleInvoiceError(error, res, next);
  }
});

module.exports = router;
