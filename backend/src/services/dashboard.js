const Decimal = require('decimal.js');
const { Client, Invoice, Payment, Product, Quotation } = require('../models');

function money(value) {
  return new Decimal(String(value || 0)).toFixed(2, Decimal.ROUND_HALF_UP);
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthLabels(now = new Date()) {
  const currentMonth = startOfMonth(now);
  return Array.from({ length: 12 }, (_, index) => {
    const month = new Date(Date.UTC(
      currentMonth.getUTCFullYear(),
      currentMonth.getUTCMonth() - 11 + index,
      1,
    ));
    return month.toISOString().slice(0, 7);
  });
}

async function sumPaymentAmounts(companyId, filter = {}) {
  const rows = await Payment.aggregate([
    { $match: { companyId, ...filter } },
    { $group: { _id: null, amount: { $sum: { $toDecimal: '$amount' } } } },
  ]);
  return money(rows[0]?.amount || 0);
}

async function getRecentDocuments(Model, companyId, dateField, match = {}) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const displayedStatus = dateField === 'invoiceDate'
    ? {
      $cond: [
        { $in: ['$status', ['Draft', 'Cancelled']] },
        '$status',
        {
          $cond: [
            {
              $and: [
                { $gt: [{ $toDecimal: '$grandTotal' }, 0] },
                { $gte: [{ $toDecimal: '$amountPaid' }, { $toDecimal: '$grandTotal' }] },
              ],
            },
            'Paid',
            {
              $cond: [
                {
                  $and: [
                    { $ne: ['$dueDate', null] },
                    { $lt: ['$dueDate', today] },
                    { $gt: [{ $toDecimal: '$balanceDue' }, 0] },
                  ],
                },
                'Overdue',
                {
                  $cond: [
                    { $gt: [{ $toDecimal: '$amountPaid' }, 0] },
                    'Partially Paid',
                    'Issued',
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    : {
      $cond: [
        {
          $and: [
            { $eq: ['$status', 'Sent'] },
            { $ne: ['$validUntil', null] },
            { $lt: ['$validUntil', today] },
          ],
        },
        'Expired',
        '$status',
      ],
    };
  return Model.aggregate([
    { $match: { companyId, ...match } },
    { $sort: { [dateField]: -1, createdAt: -1 } },
    { $limit: 5 },
    {
      $addFields: { displayedStatus },
    },
    {
      $lookup: {
        from: 'clients',
        let: { clientId: '$clientId', companyId: '$companyId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$_id', '$$clientId'] }, { $eq: ['$companyId', '$$companyId'] }] } } },
          { $project: { _id: 0, name: 1 } },
        ],
        as: 'client',
      },
    },
    {
      $project: {
        id: '$_id',
        _id: 0,
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
  const monthNames = monthLabels(now);
  const currentMonthStart = new Date(`${monthNames[0]}-01T00:00:00.000Z`);
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
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
    revenueReceived,
    recentQuotations,
    recentInvoices,
    monthlyRows,
    conversionRows,
    outstandingRowsByClient,
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
        {
          status: 'Sent',
          validUntil: {
            $ne: null,
            $lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
          },
        },
      ],
    }),
    Invoice.countDocuments({ companyId }),
    Invoice.countDocuments({
      companyId,
      status: { $nin: ['Draft', 'Cancelled'] },
      $expr: { $and: [{ $gt: [{ $toDecimal: '$grandTotal' }, 0] }, { $gte: [{ $toDecimal: '$amountPaid' }, { $toDecimal: '$grandTotal' }] }] },
    }),
    Invoice.countDocuments({
      companyId,
      status: { $in: ['Issued', 'Overdue'] },
      $expr: {
        $and: [
          { $eq: [{ $toDecimal: '$amountPaid' }, 0] },
          { $gt: [{ $toDecimal: '$balanceDue' }, 0] },
        ],
      },
    }),
    Invoice.countDocuments({
      companyId,
      status: { $nin: ['Draft', 'Cancelled'] },
      $expr: { $and: [{ $gt: [{ $toDecimal: '$amountPaid' }, 0] }, { $gt: [{ $toDecimal: '$balanceDue' }, 0] }] },
    }),
    Invoice.aggregate([
      { $match: { companyId, status: { $nin: ['Draft', 'Cancelled'] } } },
      { $group: { _id: null, amount: { $sum: { $toDecimal: '$balanceDue' } } } },
    ]),
    sumPaymentAmounts(companyId),
    getRecentDocuments(Quotation, companyId, 'quotationDate', { archivedAt: null }),
    getRecentDocuments(Invoice, companyId, 'invoiceDate'),
    Payment.aggregate([
      { $match: { companyId, paymentDate: { $gte: currentMonthStart, $lt: tomorrow } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paymentDate', timezone: 'UTC' } }, amount: { $sum: { $toDecimal: '$amount' } } } },
    ]),
    Quotation.aggregate([
      { $match: { companyId, archivedAt: null, status: { $in: ['Accepted', 'Rejected', 'Converted'] } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: { companyId, status: { $nin: ['Draft', 'Cancelled'] }, $expr: { $gt: [{ $toDecimal: '$balanceDue' }, 0] } } },
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
      { $project: { _id: 0, clientId: '$_id', clientName: { $ifNull: [{ $arrayElemAt: ['$client.name', 0] }, 'Unknown client'] }, amount: { $toString: '$amount' }, invoices: 1 } },
    ]),
  ]);

  const monthAmounts = new Map(monthlyRows.map((row) => [row._id, money(row.amount)]));
  const conversion = Object.fromEntries(['Accepted', 'Rejected', 'Converted'].map((status) => [
    status.toLowerCase(),
    conversionRows.find((row) => row._id === status)?.count || 0,
  ]));
  const outstandingAmount = money(outstandingRows[0]?.amount || 0);

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
    outstandingAmount,
    revenueReceived,
    recentQuotations,
    recentInvoices,
    monthlyRevenue: monthNames.map((month) => ({ month, amount: monthAmounts.get(month) || '0.00' })),
    conversion,
    outstandingSummary: outstandingRowsByClient.map((row) => ({
      ...row,
      amount: money(row.amount),
    })),
  };
}

module.exports = { getDashboard, money, monthLabels };
