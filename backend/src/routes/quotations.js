const express = require('express');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { Client, Company, Quotation } = require('../models');
const {
  QuotationError,
  convertAcceptedQuotation,
  createQuotation,
  duplicateQuotation,
  updateQuotation,
} = require('../services/quotations');
const { escapeRegex } = require('../utils/clientValidation');
const { parseQuotationFilters, statusValues, validateQuotationInput } = require('../utils/quotationValidation');
const createPdfHandler = require('./pdfHandler');

const router = express.Router();

function sendValidationError(res, errors) {
  return res.status(422).json({ data: null, message: 'Validation failed.', errors });
}

function displayQuotation(quotation) {
  const data = typeof quotation.toObject === 'function' ? quotation.toObject() : quotation;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const validUntil = data.validUntil ? new Date(data.validUntil) : null;
  if (data.status === 'Sent' && validUntil && validUntil < today) {
    data.status = 'Expired';
  }
  return data;
}

router.use(async (req, res, next) => {
  try {
    await connectDB();
    req.company = await Company.current();
    if (!req.company) {
      return res.status(404).json({ data: null, message: 'Company is not seeded.' });
    }
    return next();
  } catch (error) {
    console.error('Quotations API database connection failed:', error);
    return res.status(503).json({ data: null, message: 'Database connection unavailable.' });
  }
});

router.get('/', async (req, res, next) => {
  const { filters, errors } = parseQuotationFilters(req.query);
  if (Object.keys(errors).length) return sendValidationError(res, errors);

  const query = {
    companyId: req.company._id,
    archivedAt: filters.archived ? { $ne: null } : null,
  };
  if (filters.clientId) query.clientId = filters.clientId;
  if (filters.status === 'Expired') {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    query.$or = [
      { status: 'Expired' },
      { status: 'Sent', validUntil: { $lt: today } },
    ];
  } else if (filters.status === 'Sent') {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    query.status = 'Sent';
    query.$or = [
      { validUntil: null },
      { validUntil: { $gte: today } },
    ];
  } else if (filters.status) {
    query.status = filters.status;
  }
  if (filters.dateFrom || filters.dateTo) {
    query.quotationDate = {};
    if (filters.dateFrom) query.quotationDate.$gte = filters.dateFrom;
    if (filters.dateTo) {
      const dateTo = new Date(filters.dateTo);
      dateTo.setUTCHours(23, 59, 59, 999);
      query.quotationDate.$lte = dateTo;
    }
  }

  const amountExpression = [];
  if (filters.amountMin) {
    amountExpression.push({
      $gte: [{ $toDecimal: '$grandTotal' }, { $toDecimal: filters.amountMin }],
    });
  }
  if (filters.amountMax) {
    amountExpression.push({
      $lte: [{ $toDecimal: '$grandTotal' }, { $toDecimal: filters.amountMax }],
    });
  }
  if (amountExpression.length) query.$expr = { $and: amountExpression };

  try {
    if (filters.search) {
      const expression = new RegExp(escapeRegex(filters.search), 'i');
      const matchingClients = await Client.find({
        companyId: req.company._id,
        name: expression,
      }).select('_id').lean();
      const searchConditions = [
        { number: expression },
        { clientId: { $in: matchingClients.map((client) => client._id) } },
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchConditions }];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
    }

    const sortOptions = {
      newest: { quotationDate: -1, createdAt: -1 },
      oldest: { quotationDate: 1, createdAt: 1 },
      amountAsc: { grandTotal: 1, createdAt: -1 },
      amountDesc: { grandTotal: -1, createdAt: -1 },
      numberAsc: { number: 1 },
      numberDesc: { number: -1 },
    };
    const listQuery = Quotation.find(query);
    const [quotations, total] = await Promise.all([
      filters.sort === 'amountAsc' || filters.sort === 'amountDesc'
        ? Quotation.aggregate([
          { $match: query },
          { $addFields: { amountSort: { $toDecimal: '$grandTotal' } } },
          { $sort: { amountSort: filters.sort === 'amountAsc' ? 1 : -1, createdAt: -1 } },
          { $skip: (filters.page - 1) * filters.perPage },
          { $limit: filters.perPage },
          { $project: { amountSort: 0 } },
        ])
        : listQuery
          .sort(sortOptions[filters.sort])
          .skip((filters.page - 1) * filters.perPage)
          .limit(filters.perPage)
          .lean(),
      Quotation.countDocuments(query),
    ]);
    return res.json({
      data: quotations.map(displayQuotation),
      message: 'Quotations retrieved.',
      meta: { currentPage: filters.page, perPage: filters.perPage, total },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  const { updates, errors } = validateQuotationInput(req.body);
  if (Object.keys(errors).length) return sendValidationError(res, errors);
  try {
    const quotation = await createQuotation({ body: updates, companyId: req.company._id });
    return res.status(201).json({
      data: displayQuotation(quotation),
      message: 'Quotation created.',
    });
  } catch (error) {
    return handleQuotationError(error, res, next);
  }
});

router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ data: null, message: 'Quotation not found.' });
  }
  return next();
});

router.get('/:id', async (req, res, next) => {
  try {
    const quotation = await Quotation.findOne({
      _id: req.params.id,
      companyId: req.company._id,
      archivedAt: null,
    }).lean();
    if (!quotation) return res.status(404).json({ data: null, message: 'Quotation not found.' });
    return res.json({ data: displayQuotation(quotation), message: 'Quotation retrieved.' });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  const { updates, errors } = validateQuotationInput(req.body, { partial: true });
  if (Object.keys(errors).length) return sendValidationError(res, errors);
  if (!Object.keys(updates).length) {
    return sendValidationError(res, { body: 'Provide at least one quotation field to update.' });
  }
  try {
    const quotation = await updateQuotation({
      quotationId: req.params.id,
      companyId: req.company._id,
      body: updates,
    });
    return res.json({ data: displayQuotation(quotation), message: 'Quotation updated.' });
  } catch (error) {
    return handleQuotationError(error, res, next);
  }
});

router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const quotation = await duplicateQuotation({
      quotationId: req.params.id,
      companyId: req.company._id,
    });
    return res.status(201).json({
      data: displayQuotation(quotation),
      message: 'Quotation duplicated as a draft.',
    });
  } catch (error) {
    return handleQuotationError(error, res, next);
  }
});

router.post('/:id/convert', async (req, res, next) => {
  try {
    const invoice = await convertAcceptedQuotation({
      quotationId: req.params.id,
      companyId: req.company._id,
    });
    return res.status(201).json({ data: invoice, message: 'Quotation converted to an issued invoice.' });
  } catch (error) {
    return handleQuotationError(error, res, next);
  }
});

router.get('/:id/pdf', createPdfHandler({
  Model: Quotation,
  documentType: 'quotation',
}));

router.patch('/:id/status', async (req, res, next) => {
  const status = req.body && req.body.status;
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
    || Object.keys(req.body).some((field) => field !== 'status')) {
    return sendValidationError(res, { body: 'Provide only a status field.' });
  }
  if (!statusValues.includes(status) || status === 'Converted') {
    return sendValidationError(res, {
      status: status === 'Converted'
        ? 'Converted status is set only when an invoice is created.'
        : `Must be one of: ${statusValues.filter((value) => value !== 'Converted').join(', ')}.`,
    });
  }
  try {
    const quotation = await Quotation.findOne({
      _id: req.params.id,
      companyId: req.company._id,
      archivedAt: null,
    });
    if (!quotation) return res.status(404).json({ data: null, message: 'Quotation not found.' });
    if (quotation.convertedInvoiceId) {
      return sendValidationError(res, { status: 'A converted quotation status cannot be changed.' });
    }
    quotation.status = status;
    await quotation.save();
    return res.json({ data: displayQuotation(quotation), message: 'Quotation status updated.' });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const quotation = await Quotation.findOne({
      _id: req.params.id,
      companyId: req.company._id,
      archivedAt: null,
    });
    if (!quotation) return res.status(404).json({ data: null, message: 'Quotation not found.' });
    quotation.archivedAt = new Date();
    await quotation.save();
    return res.json({ data: displayQuotation(quotation), message: 'Quotation archived.' });
  } catch (error) {
    return next(error);
  }
});

function handleQuotationError(error, res, next) {
  if (error instanceof QuotationError || (error && error.name === 'InvoiceError')) {
    if (error.errors) return sendValidationError(res, error.errors);
    return res.status(error.status).json({ data: null, message: error.message });
  }
  if (error && error.name === 'TypeError') {
    return sendValidationError(res, { totals: error.message });
  }
  if (error && error.code === 11000) {
    return res.status(409).json({ data: null, message: 'Quotation number conflict; retry the request.' });
  }
  if (error && (error.code === 20 || /Transaction numbers are only allowed/.test(error.message))) {
    console.error('Quotation numbering requires MongoDB transaction support:', error);
    return res.status(503).json({
      data: null,
      message: 'Quotation creation requires a MongoDB replica set or sharded cluster.',
    });
  }
  return next(error);
}

module.exports = router;
