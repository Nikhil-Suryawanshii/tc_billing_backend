const mongoose = require('mongoose');
const { Client, Company, Product, Category, Quotation } = require('../models');
const { calculateTotals } = require('./totals');

class QuotationError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.name = 'QuotationError';
    this.status = status;
    this.errors = errors;
  }
}

function snapshot(source, fields) {
  return Object.fromEntries(fields.map((field) => [field, source[field] ?? '']));
}

const companySnapshotFields = [
  'name', 'logoPath', 'signaturePath', 'gstNumber', 'addressLine1', 'addressLine2',
  'city', 'state', 'postalCode', 'country', 'phone', 'email', 'website', 'defaultCurrency',
];
const clientSnapshotFields = [
  'name', 'gstNumber', 'phone', 'email', 'attentionName', 'billingAddress',
  'shippingAddress', 'city', 'state', 'postalCode', 'country',
];

function defaultDocumentFields(company) {
  const validityDays = company.defaultValidityDays;
  const quotationDate = new Date();
  const validUntil = new Date(quotationDate);
  validUntil.setDate(validUntil.getDate() + validityDays);
  return {
    quotationDate,
    validUntil,
    header: company.defaultHeader,
    currency: company.defaultCurrency,
    salutation: company.defaultSalutation,
    message: company.defaultMessage,
    closing: company.defaultClosing,
    signatory: company.defaultSignatory,
    terms: company.quotationTerms,
    validityText: `${validityDays} days`,
  };
}

async function resolveClient({ body, existingClientId, companyId, session }) {
  if (body.clientId || (existingClientId && !body.name)) {
    const clientId = body.clientId || existingClientId;
    const client = await Client.findOne({ _id: clientId, companyId }).session(session);
    if (!client) throw new QuotationError('Client not found for this company.', 422, { clientId: 'Client not found for this company.' });
    return client;
  }
  if (!body.name) {
    throw new QuotationError('Provide a saved client or inline client name.', 422, { clientId: 'Client is required.' });
  }
  const client = new Client({
    companyId,
    ...Object.fromEntries(clientSnapshotFields.map((field) => [field, body[field]]).filter(([, value]) => value !== undefined)),
  });
  await client.save({ session });
  return client;
}

async function validateItemReferences(items, companyId, session) {
  for (const [index, item] of items.entries()) {
    if (item.categoryId) {
      const categoryExists = await Category.exists({ _id: item.categoryId, companyId }).session(session);
      if (!categoryExists) {
        throw new QuotationError(
          'Quotation item has an invalid category.',
          422,
          { [`items.${index}.categoryId`]: 'Category not found for this company.' },
        );
      }
    }
    if (item.productId) {
      const productExists = await Product.exists({ _id: item.productId, companyId }).session(session);
      if (!productExists) {
        throw new QuotationError(
          'Quotation item has an invalid product.',
          422,
          { [`items.${index}.productId`]: 'Product not found for this company.' },
        );
      }
    }
  }
}

async function nextQuotationNumber(company, session) {
  const prefix = company.quotationPrefix || 'QUO';
  const oldCompany = await Company.findOneAndUpdate(
    { _id: company._id },
    { $inc: { nextQuotationNumber: 1 } },
    { new: false, session, runValidators: true },
  );
  if (!oldCompany) throw new QuotationError('Company is not seeded.', 404);
  return `${prefix} ${oldCompany.nextQuotationNumber}`;
}

async function createQuotation({ body, companyId }) {
  const session = await mongoose.startSession();
  let created;
  try {
    await session.withTransaction(async () => {
      const company = await Company.findById(companyId).session(session);
      if (!company) throw new QuotationError('Company is not seeded.', 404);
      const client = await resolveClient({ body, companyId, session });
      await validateItemReferences(body.items, companyId, session);

      const defaults = defaultDocumentFields(company);
      const totals = calculateTotals(body.items, body.additionalCharges ?? '0');
      const number = await nextQuotationNumber(company, session);
      const documentFields = [
        'poSoNumber', 'header', 'currency', 'quotationDate', 'validUntil',
        'salutation', 'message', 'closing', 'signatory', 'terms', 'notes',
        'validityText',
      ];
      const quotation = new Quotation({
        companyId,
        clientId: client._id,
        number,
        ...defaults,
        ...Object.fromEntries(documentFields
          .filter((field) => body[field] !== undefined)
          .map((field) => [field, body[field]])),
        status: 'Draft',
        companySnapshot: snapshot(company, companySnapshotFields),
        clientSnapshot: snapshot(client, clientSnapshotFields),
        ...totals,
      });
      await quotation.save({ session });
      created = quotation;
    });
    return created;
  } finally {
    await session.endSession();
  }
}

async function updateQuotation({ quotationId, companyId, body }) {
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      const quotation = await Quotation.findOne({
        _id: quotationId,
        companyId,
        archivedAt: null,
      }).session(session);
      if (!quotation) throw new QuotationError('Quotation not found.', 404);
      if (quotation.convertedInvoiceId) {
        throw new QuotationError('A converted quotation cannot be edited.', 422);
      }
      const company = await Company.findById(companyId).session(session);
      if (!company) throw new QuotationError('Company is not seeded.', 404);
      const client = await resolveClient({
        body,
        existingClientId: quotation.clientId,
        companyId,
        session,
      });
      const nextItems = body.items === undefined
        ? quotation.items.map((item) => item.toObject())
        : body.items;
      await validateItemReferences(nextItems, companyId, session);
      const totals = calculateTotals(
        nextItems,
        body.additionalCharges === undefined ? quotation.additionalCharges : body.additionalCharges,
      );
      const documentFields = [
        'poSoNumber', 'header', 'currency', 'quotationDate', 'validUntil',
        'salutation', 'message', 'closing', 'signatory', 'terms', 'notes',
        'validityText',
      ];
      Object.assign(quotation, Object.fromEntries(documentFields
        .filter((field) => body[field] !== undefined)
        .map((field) => [field, body[field]])), {
        ...(body.items !== undefined ? { items: body.items } : {}),
        ...(body.additionalCharges !== undefined ? { additionalCharges: body.additionalCharges } : {}),
        clientId: client._id,
        companySnapshot: snapshot(company, companySnapshotFields),
        clientSnapshot: snapshot(client, clientSnapshotFields),
        ...totals,
      });
      await quotation.save({ session });
      updated = quotation;
    });
    return updated;
  } finally {
    await session.endSession();
  }
}

async function duplicateQuotation({ quotationId, companyId }) {
  const session = await mongoose.startSession();
  let duplicated;
  try {
    await session.withTransaction(async () => {
      const source = await Quotation.findOne({
        _id: quotationId,
        companyId,
        archivedAt: null,
      }).session(session);
      if (!source) throw new QuotationError('Quotation not found.', 404);

      const company = await Company.findById(companyId).session(session);
      if (!company) throw new QuotationError('Company is not seeded.', 404);
      const client = await Client.findOne({ _id: source.clientId, companyId }).session(session);
      if (!client) throw new QuotationError('Client not found for this company.', 422);
      const number = await nextQuotationNumber(company, session);

      const data = source.toObject();
      delete data._id;
      delete data.createdAt;
      delete data.updatedAt;
      delete data.__v;
      duplicated = new Quotation({
        ...data,
        number,
        status: 'Draft',
        convertedInvoiceId: null,
        archivedAt: null,
      });
      await duplicated.save({ session });
    });
    return duplicated;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  QuotationError,
  createQuotation,
  updateQuotation,
  duplicateQuotation,
  defaultDocumentFields,
};
