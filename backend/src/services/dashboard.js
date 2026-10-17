const Decimal = require('decimal.js');
const { Client, Invoice, Payment, Product, Quotation } = require('../models');

function money(value) {
  return new Decimal(String(value || 0)).toFixed(2, Decimal.ROUND_HALF_UP);
}

function sumMoney(values) {
  return values.reduce((total, value) => total.plus(new Decimal(String(value || 0))), new Decimal(0))
    .toFixed(2, Decimal.ROUND_HALF_UP);
}

function monthLabels(now = new Date()) {
  return Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() - 11 + index,
    1,
  )).toISOString().slice(0, 7));
}

function recentDocuments(Model, companyId, dateField, now) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const status = dateField === 'invoiceDate'
    ? {
      $cond: [
        { $in: ['$status', ['Draft', 'Cancelled']] },
        '$status',
        {
          $cond: [
            {
              $and: [
                { $gt: [{ $toDecimal: '$grandTotal' }, { $toDecimal: '0' }] },
                { $gte: [{ $toDecimal: '$amountPaid' }, { $toDecimal: '$grandTotal' }] },
              ],
            },
            'Paid',
            {
              $cond: [
                { $and: [{ $ne: ['$dueDate', null] }, { $lt: ['$dueDate', today] }, { $gt: [{ $toDecimal: '$balanceDue' }, { $toDecimal: '0' }] }] },
                'Overdue',
                { $cond: [{ $gt: [{ $toDecimal: '$amountPaid' }, { $toDecimal: '0' }] }, 'Partially Paid', 'Issued'] },
              ],
            },
          ],
        },
      ],
    }
    : {
      $cond: [
        { $and: [{ $eq: ['$status', 'Sent'] }, { $ne: ['$validUntil', null] }, { $lt: ['$validUntil', today] }] },
        'Expired',
        '$status',
      ],
    };

  return Model.aggregate([
    { $match: { companyId, ...(dateField === 'quotationDate' ? { archivedAt: null } : {}) } },
    { $sort: { [dateField]: -1, createdAt: -1 } },
    { $limit: 5 },
    { $addFields: { displayedStatus: status } },
    {
      $lookup: {
        from: 'clients',
        let: { clientId: '$clientId', companyId: '$companyId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$_id', '$$clientId'] }, { $eq: ['$companyId', '$$companyId'] }] } } },
          { $project: { name: 1 } },
        ],
        as: 'client',
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: '$_id' },
        number: 1,
        clientName: { $ifNull: [{ $arrayElemAt: ['$client.name', 0] }, '$clientSnapshot.name'] },
        date: `$${dateField}`,
        status: '$displayedStatus',
        total: '$grandTotal',
      },
    },
  ]);
}

async function getDashboard(companyId, now = new Date()) {
  const months = monthLabels(now);
  const monthStart = new Date(`${months[0]}-01T00:00:00.000Z`);
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const baseInvoiceMatch = { companyId, status: { $nin: ['Draft', 'Cancelled'] } };

  const [
    clients,
    products,
    quotations,
    quotationsAccepted,
    quotationsPending,
    quotationsRejected,
    quotationsExpired,
    invoices,
    invoicesPaid,
    invoicesUnpaid,
    invoicesPartial,
    outstandingRows,
    revenueRows,
    recentQuotations,
    recentInvoices,
    monthlyRows,
    conversionRows,
    outstandingSummary,
  ] = await Promise.all([
    Client.countDocuments({ companyId }),
    Product.countDocuments({ companyId }),
    Quotation.countDocuments({ companyId, archivedAt: null }),
    Quotation.countDocuments({ companyId, archivedAt: null, status: 'Accepted' }),
    Quotation.countDocuments({ companyId, archivedAt: null, status: { $in: ['Draft', 'Sent'] } }),
    Quotation.countDocuments({ companyId, archivedAt: null, status: 'Rejected' }),
    Quotation.countDocuments({
      companyId,
      archivedAt: null,
      $or: [
        { status: 'Expired' },
        { status: 'Sent', validUntil: { $ne: null, $lt: today } },
      ],
    }),
    Invoice.countDocuments({ companyId }),
    Invoice.countDocuments({ ...baseInvoiceMatch, status: 'Paid' }),
    Invoice.countDocuments({
      companyId,
      status: { $in: ['Issued', 'Overdue'] },
      $expr: {
        $and: [
          { $eq: [{ $toDecimal: '$amountPaid' }, { $toDecimal: '0' }] },
          { $gt: [{ $toDecimal: '$balanceDue' }, { $toDecimal: '0' }] },
        ],
      },
    }),
    Invoice.countDocuments({ ...baseInvoiceMatch, status: 'Partially Paid' }),
    Invoice.aggregate([
      { $match: baseInvoiceMatch },
      { $group: { _id: null, amount: { $sum: { $toDecimal: '$balanceDue' } } } },
    ]),
    Payment.aggregate([
      { $match: { companyId } },
      { $group: { _id: null, amount: { $sum: { $toDecimal: '$amount' } } } },
    ]),
    recentDocuments(Quotation, companyId, 'quotationDate', now),
    recentDocuments(Invoice, companyId, 'invoiceDate', now),
    Payment.aggregate([
      { $match: { companyId, paymentDate: { $gte: monthStart, $lt: nextMonth } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$paymentDate', timezone: 'UTC' } },
          amount: { $sum: { $toDecimal: '$amount' } },
        },
      },
    ]),
    Quotation.aggregate([
      { $match: { companyId, archivedAt: null, status: { $in: ['Accepted', 'Rejected', 'Converted'] } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      {
        $match: {
          ...baseInvoiceMatch,
          $expr: { $gt: [{ $toDecimal: '$balanceDue' }, { $toDecimal: '0' }] },
        },
      },
      { $group: { _id: '$clientId', amount: { $sum: { $toDecimal: '$balanceDue' } }, invoices: { $sum: 1 } } },
      {
        $lookup: {
          from: 'clients',
          let: { clientId: '$_id', companyId },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$_id', '$$clientId'] }, { $eq: ['$companyId', '$$companyId'] }] } } },
            { $project: { name: 1 } },
          ],
          as: 'client',
        },
      },
      { $sort: { amount: -1, _id: 1 } },
      {
        $project: {
          _id: 0,
          clientId: { $toString: '$_id' },
          clientName: { $ifNull: [{ $arrayElemAt: ['$client.name', 0] }, 'Unknown client'] },
          amount: { $toString: '$amount' },
          invoices: 1,
        },
      },
    ]),
  ]);

  const monthlyAmounts = new Map(monthlyRows.map((row) => [row._id, money(row.amount)]));
  const conversion = Object.fromEntries(['Accepted', 'Rejected', 'Converted'].map((status) => [
    status.toLowerCase(),
    conversionRows.find((row) => row._id === status)?.count || 0,
  ]));

  return {
    clients,
    products,
    quotations,
    quotationsAccepted,
    quotationsPending,
    quotationsRejected,
    quotationsExpired,
    invoices,
    invoicesPaid,
    invoicesUnpaid,
    invoicesPartial,
    outstandingAmount: money(outstandingRows[0]?.amount),
    revenueReceived: money(revenueRows[0]?.amount),
    recentQuotations,
    recentInvoices,
    monthlyRevenue: months.map((month) => ({ month, amount: monthlyAmounts.get(month) || '0.00' })),
    conversion,
    outstandingSummary: outstandingSummary.map((row) => ({ ...row, amount: money(row.amount) })),
  };
}

module.exports = { getDashboard, monthLabels, money, sumMoney };
