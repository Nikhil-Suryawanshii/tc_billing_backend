const express = require('express');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { Company, Invoice, Payment } = require('../models');
const { removePayment, InvoiceError, calculateInvoiceStatus } = require('../services/invoices');

const router = express.Router();

function sendValidationError(res, errors) {
  return res.status(422).json({ data: null, message: 'Validation failed.', errors });
}

router.use(async (req, res, next) => {
  try {
    await connectDB();
    req.company = await Company.current();
    if (!req.company) return res.status(404).json({ data: null, message: 'Company is not seeded.' });
    return next();
  } catch (error) {
    console.error('Payments API database connection failed:', error);
    return res.status(503).json({ data: null, message: 'Database connection unavailable.' });
  }
});

router.get('/', async (req, res, next) => {
  const errors = {};
  const allowed = ['clientId', 'invoiceId', 'dateFrom', 'dateTo', 'page', 'perPage'];
  for (const key of Object.keys(req.query)) {
    if (!allowed.includes(key)) errors[key] = 'Unsupported query parameter.';
  }
  for (const field of ['clientId', 'invoiceId']) {
    if (req.query[field] !== undefined
      && (typeof req.query[field] !== 'string' || !mongoose.isValidObjectId(req.query[field]))) {
      errors[field] = 'Must be a valid id.';
    }
  }
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const perPage = req.query.perPage === undefined ? 20 : Number(req.query.perPage);
  if (!Number.isInteger(page) || page < 1) errors.page = 'Must be a positive integer.';
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) {
    errors.perPage = 'Must be an integer from 1 to 100.';
  }
  const dates = {};
  for (const field of ['dateFrom', 'dateTo']) {
    if (req.query[field] === undefined) continue;
    if (typeof req.query[field] !== 'string') {
      errors[field] = 'Must be a valid date.';
    } else {
      dates[field] = new Date(req.query[field]);
      if (Number.isNaN(dates[field].getTime())) errors[field] = 'Must be a valid date.';
    }
  }
  if (Object.keys(errors).length) return sendValidationError(res, errors);

  try {
    const query = { companyId: req.company._id };
    if (req.query.invoiceId) query.invoiceId = req.query.invoiceId;
    if (req.query.clientId) {
      const invoices = await Invoice.find({
        companyId: req.company._id,
        clientId: req.query.clientId,
      }).select('_id').lean();
      const clientInvoiceIds = invoices.map((invoice) => invoice._id);
      query.invoiceId = req.query.invoiceId
        ? { $in: clientInvoiceIds, $eq: req.query.invoiceId }
        : { $in: clientInvoiceIds };
    }
    if (dates.dateFrom || dates.dateTo) {
      query.paymentDate = {};
      if (dates.dateFrom) query.paymentDate.$gte = dates.dateFrom;
      if (dates.dateTo) {
        dates.dateTo.setUTCHours(23, 59, 59, 999);
        query.paymentDate.$lte = dates.dateTo;
      }
    }
    const [payments, total] = await Promise.all([
      Payment.find(query)
        .sort({ paymentDate: -1, createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .lean(),
      Payment.countDocuments(query),
    ]);
    return res.json({
      data: payments,
      message: 'Payments retrieved.',
      meta: { currentPage: page, perPage, total },
    });
  } catch (error) {
    return next(error);
  }
});

router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ data: null, message: 'Payment not found.' });
  }
  return next();
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await removePayment({ paymentId: req.params.id, companyId: req.company._id });
    return res.json({
      data: {
        payment: { id: result.payment.id },
        invoice: {
          id: result.invoice.id,
          amountPaid: result.invoice.amountPaid,
          balanceDue: result.invoice.balanceDue,
          status: calculateInvoiceStatus(result.invoice),
        },
      },
      message: 'Payment deleted and invoice balance recalculated.',
    });
  } catch (error) {
    if (error instanceof InvoiceError) {
      return res.status(error.status).json({ data: null, message: error.message });
    }
    if (error && (error.code === 20 || /Transaction numbers are only allowed/.test(error.message))) {
      console.error('Payment deletion requires MongoDB transaction support:', error);
      return res.status(503).json({
        data: null,
        message: 'Payment operations require a MongoDB replica set or sharded cluster.',
      });
    }
    return next(error);
  }
});

module.exports = router;
