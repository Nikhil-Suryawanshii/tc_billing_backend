const express = require('express');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { Client, Company, Invoice, Payment, Quotation } = require('../models');
const { escapeRegex, validateClientInput } = require('../utils/clientValidation');

const router = express.Router();
const maxPerPage = 100;

function sendValidationError(res, errors) {
  return res.status(422).json({ data: null, message: 'Validation failed.', errors });
}

function parsePositiveInteger(value, fallback, field, errors, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > maximum) {
    errors[field] = `Must be an integer between 1 and ${maximum}.`;
    return fallback;
  }
  return Number(value);
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
    console.error('Clients API database connection failed:', error);
    return res.status(503).json({ data: null, message: 'Database connection unavailable.' });
  }
});

router.get('/', async (req, res, next) => {
  const errors = {};
  const page = parsePositiveInteger(req.query.page, 1, 'page', errors);
  const perPage = parsePositiveInteger(req.query.perPage, 20, 'perPage', errors, maxPerPage);
  if (req.query.search !== undefined && typeof req.query.search !== 'string') {
    errors.search = 'Must be a string.';
  }
  if (Object.keys(errors).length) return sendValidationError(res, errors);

  const filter = { companyId: req.company._id };
  const search = req.query.search.trim();
  if (search) {
    const expression = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: expression }, { phone: expression }, { email: expression }];
  }

  try {
    const [clients, total] = await Promise.all([
      Client.find(filter)
        .sort({ name: 1, createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .lean(),
      Client.countDocuments(filter),
    ]);
    return res.json({
      data: clients,
      message: 'Clients retrieved.',
      meta: { currentPage: page, perPage, total },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  const { updates, errors } = validateClientInput(req.body);
  if (Object.keys(errors).length) return sendValidationError(res, errors);

  try {
    const client = await Client.create({
      ...updates,
      companyId: req.company._id,
    });
    return res.status(201).json({ data: client, message: 'Client created.' });
  } catch (error) {
    return next(error);
  }
});

router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ data: null, message: 'Client not found.' });
  }
  return next();
});

async function findClient(req) {
  return Client.findOne({ _id: req.params.id, companyId: req.company._id });
}

router.get('/:id/history', async (req, res, next) => {
  try {
    const client = await findClient(req);
    if (!client) {
      return res.status(404).json({ data: null, message: 'Client not found.' });
    }

    const [quotations, invoices] = await Promise.all([
      Quotation.find({ companyId: req.company._id, clientId: client._id })
        .sort({ createdAt: -1 }).lean(),
      Invoice.find({ companyId: req.company._id, clientId: client._id })
        .sort({ createdAt: -1 }).lean(),
    ]);
    const invoiceIds = invoices.map((invoice) => invoice._id);
    const payments = invoiceIds.length
      ? await Payment.find({ companyId: req.company._id, invoiceId: { $in: invoiceIds } })
        .sort({ paymentDate: -1, createdAt: -1 }).lean()
      : [];

    return res.json({
      data: { quotations, invoices, payments },
      message: 'Client history retrieved.',
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const client = await findClient(req);
    if (!client) {
      return res.status(404).json({ data: null, message: 'Client not found.' });
    }
    return res.json({ data: client, message: 'Client retrieved.' });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  const { updates, errors } = validateClientInput(req.body, { partial: true });
  if (Object.keys(errors).length) return sendValidationError(res, errors);
  if (!Object.keys(updates).length) {
    return sendValidationError(res, { body: 'Provide at least one client field to update.' });
  }

  try {
    const client = await findClient(req);
    if (!client) {
      return res.status(404).json({ data: null, message: 'Client not found.' });
    }
    Object.assign(client, updates);
    await client.save();
    return res.json({ data: client, message: 'Client updated.' });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const client = await findClient(req);
    if (!client) {
      return res.status(404).json({ data: null, message: 'Client not found.' });
    }

    const [quotation, invoice] = await Promise.all([
      Quotation.exists({ companyId: req.company._id, clientId: client._id }),
      Invoice.exists({ companyId: req.company._id, clientId: client._id }),
    ]);
    if (quotation || invoice) {
      return sendValidationError(res, {
        client: 'Cannot delete a client referenced by a quotation or invoice.',
      });
    }

    await client.deleteOne();
    return res.json({ data: { id: client.id }, message: 'Client deleted.' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
