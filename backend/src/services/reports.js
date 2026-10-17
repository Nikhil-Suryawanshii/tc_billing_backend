const Decimal = require('decimal.js');
const { Invoice, Payment, Quotation } = require('../models');

function money(value) {
  return new Decimal(String(value || 0)).toFixed(2, Decimal.ROUND_HALF_UP);
}

function addMoney(values) {
  return values.reduce((total, value) => total.plus(new Decimal(String(value || 0))), new Decimal(0))
    .toFixed(2, Decimal.ROUND_HALF_UP);
}

function dateRange(field, from, to) {
  return { [field]: { $gte: from, $lte: to } };
}

function decimalField(field) {
  return { $toDecimal: `$${field}` };
}

function lookupClient(clientExpression = '$clientId') {
  return {
    $lookup: {
      from: 'clients',
      let: { clientId: clientExpression, companyId: '$companyId' },
      pipeline: [
        { $match: { $expr: { $and: [{ $eq: ['$_id', '$$clientId'] }, { $eq: ['$companyId', '$$companyId'] }] } } },
        { $project: { name: 1 } },
      ],
      as: 'client',
    },
  };
}

async function quotationReport(companyId, from, to, outcomesOnly = false) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const rows = await Quotation.aggregate([
    {
      $match: {
        companyId,
        archivedAt: null,
        ...dateRange('quotationDate', from, to),
        ...(outcomesOnly ? { status: { $in: ['Accepted', 'Rejected', 'Converted'] } } : {}),
      },
    },
    {
      $addFields: {
        reportStatus: {
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
        },
      },
    },
    {
      $group: {
        _id: '$reportStatus',
        count: { $sum: 1 },
        total: { $sum: { $toDecimal: '$grandTotal' } },
      },
    },
    { $project: { _id: 0, status: '$_id', count: 1, total: { $toString: '$total' } } },
    { $sort: { status: 1 } },
  ]);
  const normalizedRows = rows.map((row) => ({ ...row, total: money(row.total) }));
  return {
    rows: normalizedRows,
    summary: {
      count: normalizedRows.reduce((total, row) => total + row.count, 0),
      total: addMoney(normalizedRows.map((row) => row.total)),
    },
  };
}

async function conversionReport(companyId, from, to) {
  const [quotations, invoicesCreatedFromQuotations] = await Promise.all([
    Quotation.aggregate([
      {
        $match: {
          companyId,
          archivedAt: null,
          ...dateRange('quotationDate', from, to),
          status: { $in: ['Accepted', 'Rejected', 'Converted'] },
        },
      },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Invoice.countDocuments({
      companyId,
      quotationId: { $ne: null },
      ...dateRange('invoiceDate', from, to),
    }),
  ]);
  const values = Object.fromEntries(['Accepted', 'Rejected', 'Converted'].map((status) => [
    status.toLowerCase(),
    quotations.find((row) => row._id === status)?.count || 0,
  ]));
  const rows = [
    { metric: 'accepted', count: values.accepted },
    { metric: 'rejected', count: values.rejected },
    { metric: 'converted', count: values.converted },
    { metric: 'invoicesCreatedFromQuotations', count: invoicesCreatedFromQuotations },
  ];
  return { rows, summary: { ...values, invoicesCreatedFromQuotations } };
}

async function salesReport(companyId, from, to) {
  const rows = await Invoice.aggregate([
    {
      $match: {
        companyId,
        ...dateRange('invoiceDate', from, to),
        status: { $nin: ['Draft', 'Cancelled'] },
      },
    },
    lookupClient(),
    {
      $project: {
        invoiceId: { $toString: '$_id' },
        number: 1,
        clientName: { $ifNull: [{ $arrayElemAt: ['$client.name', 0] }, '$clientSnapshot.name'] },
        date: '$invoiceDate',
        status: 1,
        total: '$grandTotal',
        amountPaid: 1,
        balanceDue: 1,
      },
    },
    { $sort: { date: -1, number: 1 } },
  ]);
  const normalizedRows = rows.map((row) => ({
    ...row,
    total: money(row.total),
    amountPaid: money(row.amountPaid),
    balanceDue: money(row.balanceDue),
  }));
  return {
    rows: normalizedRows,
    summary: {
      issuedSales: addMoney(normalizedRows.map((row) => row.total)),
      paidAmount: addMoney(normalizedRows.map((row) => row.amountPaid)),
      outstandingAmount: addMoney(normalizedRows.map((row) => row.balanceDue)),
    },
  };
}

async function paymentsReport(companyId, from, to) {
  const rows = await Payment.aggregate([
    { $match: { companyId, ...dateRange('paymentDate', from, to) } },
    {
      $lookup: {
        from: 'invoices',
        let: { invoiceId: '$invoiceId', companyId: '$companyId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$_id', '$$invoiceId'] }, { $eq: ['$companyId', '$$companyId'] }] } } },
          { $project: { number: 1, clientId: 1, clientSnapshot: 1 } },
        ],
        as: 'invoice',
      },
    },
    { $unwind: { path: '$invoice', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'clients',
        let: { clientId: '$invoice.clientId', companyId: '$companyId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$_id', '$$clientId'] }, { $eq: ['$companyId', '$$companyId'] }] } } },
          { $project: { name: 1 } },
        ],
        as: 'client',
      },
    },
    {
      $project: {
        paymentId: { $toString: '$_id' },
        date: '$paymentDate',
        invoiceNumber: '$invoice.number',
        clientName: { $ifNull: [{ $arrayElemAt: ['$client.name', 0] }, '$invoice.clientSnapshot.name'] },
        amount: 1,
        method: 1,
        reference: 1,
      },
    },
    { $sort: { date: -1, paymentId: 1 } },
  ]);
  const normalizedRows = rows.map((row) => ({ ...row, amount: money(row.amount) }));
  return {
    rows: normalizedRows,
    summary: { paidAmount: addMoney(normalizedRows.map((row) => row.amount)) },
  };
}

async function invoiceBalanceReport(companyId, from, to, overdueOnly = false) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const match = {
    companyId,
    status: { $nin: ['Draft', 'Cancelled'] },
    ...dateRange(overdueOnly ? 'dueDate' : 'invoiceDate', from, to),
    $expr: { $gt: [decimalField('balanceDue'), { $toDecimal: '0' }] },
  };
  if (overdueOnly) {
    match.status = { $in: ['Issued', 'Partially Paid', 'Overdue'] };
    match.dueDate.$lt = today;
  }
  const rows = await Invoice.aggregate([
    { $match: match },
    lookupClient(),
    {
      $project: {
        invoiceId: { $toString: '$_id' },
        number: 1,
        clientName: { $ifNull: [{ $arrayElemAt: ['$client.name', 0] }, '$clientSnapshot.name'] },
        invoiceDate: 1,
        dueDate: 1,
        status: overdueOnly ? { $literal: 'Overdue' } : '$status',
        grandTotal: 1,
        amountPaid: 1,
        balanceDue: 1,
      },
    },
    { $sort: { dueDate: 1, number: 1 } },
  ]);
  const normalizedRows = rows.map((row) => ({
    ...row,
    grandTotal: money(row.grandTotal),
    amountPaid: money(row.amountPaid),
    balanceDue: money(row.balanceDue),
  }));
  return {
    rows: normalizedRows,
    summary: {
      issuedSales: addMoney(normalizedRows.map((row) => row.grandTotal)),
      paidAmount: addMoney(normalizedRows.map((row) => row.amountPaid)),
      outstandingAmount: addMoney(normalizedRows.map((row) => row.balanceDue)),
    },
  };
}

async function clientsReport(companyId, from, to) {
  const rows = await Invoice.aggregate([
    {
      $match: {
        companyId,
        ...dateRange('invoiceDate', from, to),
        status: { $nin: ['Draft', 'Cancelled'] },
      },
    },
    {
      $group: {
        _id: '$clientId',
        sales: { $sum: { $toDecimal: '$grandTotal' } },
        outstanding: { $sum: { $toDecimal: '$balanceDue' } },
        invoices: { $sum: 1 },
      },
    },
    { $sort: { sales: -1, _id: 1 } },
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
    {
      $lookup: {
        from: 'invoices',
        let: { clientId: '$_id', companyId },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$clientId', '$$clientId'] },
                  { $eq: ['$companyId', '$$companyId'] },
                  { $gte: ['$invoiceDate', from] },
                  { $lte: ['$invoiceDate', to] },
                  { $not: [{ $in: ['$status', ['Draft', 'Cancelled']] }] },
                ],
              },
            },
          },
          {
            $lookup: {
              from: 'payments',
              let: { invoiceId: '$_id', companyId: '$companyId' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$invoiceId', '$$invoiceId'] },
                        { $eq: ['$companyId', '$$companyId'] },
                        { $gte: ['$paymentDate', from] },
                        { $lte: ['$paymentDate', to] },
                      ],
                    },
                  },
                },
              ],
              as: 'payments',
            },
          },
          { $unwind: { path: '$payments', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: null,
              paid: { $sum: { $ifNull: [{ $toDecimal: '$payments.amount' }, { $toDecimal: '0' }] } },
            },
          },
        ],
        as: 'paymentTotals',
      },
    },
    {
      $project: {
        _id: 0,
        clientId: { $toString: '$_id' },
        clientName: { $ifNull: [{ $arrayElemAt: ['$client.name', 0] }, 'Unknown client'] },
        sales: { $toString: '$sales' },
        paid: { $toString: { $ifNull: [{ $arrayElemAt: ['$paymentTotals.paid', 0] }, { $toDecimal: '0' }] } },
        outstanding: { $toString: '$outstanding' },
        invoices: 1,
      },
    },
  ]);
  const normalizedRows = rows.map((row) => ({
    ...row,
    sales: money(row.sales),
    paid: money(row.paid),
    outstanding: money(row.outstanding),
  }));
  return {
    rows: normalizedRows,
    summary: {
      issuedSales: addMoney(normalizedRows.map((row) => row.sales)),
      paidAmount: addMoney(normalizedRows.map((row) => row.paid)),
      outstandingAmount: addMoney(normalizedRows.map((row) => row.outstanding)),
    },
  };
}

async function productsReport(companyId, from, to) {
  const rows = await Invoice.aggregate([
    {
      $match: {
        companyId,
        ...dateRange('invoiceDate', from, to),
        status: { $nin: ['Draft', 'Cancelled'] },
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.name',
        quantity: { $sum: { $toDecimal: '$items.quantity' } },
        lineTotal: { $sum: { $toDecimal: '$items.lineTotal' } },
        occurrences: { $sum: 1 },
      },
    },
    { $sort: { lineTotal: -1, _id: 1 } },
    {
      $project: {
        _id: 0,
        itemName: '$_id',
        quantity: { $toString: '$quantity' },
        lineTotal: { $toString: '$lineTotal' },
        occurrences: 1,
      },
    },
  ]);
  const normalizedRows = rows.map((row) => ({ ...row, lineTotal: money(row.lineTotal) }));
  return {
    rows: normalizedRows,
    summary: { issuedSales: addMoney(normalizedRows.map((row) => row.lineTotal)) },
  };
}

async function revenueReport(companyId, from, to) {
  const rows = await Payment.aggregate([
    { $match: { companyId, ...dateRange('paymentDate', from, to) } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$paymentDate', timezone: 'UTC' } },
        amount: { $sum: { $toDecimal: '$amount' } },
      },
    },
    { $project: { _id: 0, month: '$_id', amount: { $toString: '$amount' } } },
    { $sort: { month: 1 } },
  ]);
  const amountByMonth = new Map(rows.map((row) => [row.month, money(row.amount)]));
  const months = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const lastMonth = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cursor <= lastMonth) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const normalizedRows = months.map((month) => ({ month, amount: amountByMonth.get(month) || '0.00' }));
  return {
    rows: normalizedRows,
    summary: { total: addMoney(normalizedRows.map((row) => row.amount)) },
  };
}

async function getReport(slug, companyId, from, to) {
  switch (slug) {
    case 'quotations':
      return quotationReport(companyId, from, to);
    case 'quotation-outcomes':
      return quotationReport(companyId, from, to, true);
    case 'conversion':
      return conversionReport(companyId, from, to);
    case 'sales':
      return salesReport(companyId, from, to);
    case 'payments':
      return paymentsReport(companyId, from, to);
    case 'outstanding':
      return invoiceBalanceReport(companyId, from, to);
    case 'overdue':
      return invoiceBalanceReport(companyId, from, to, true);
    case 'clients':
      return clientsReport(companyId, from, to);
    case 'products':
      return productsReport(companyId, from, to);
    case 'revenue':
      return revenueReport(companyId, from, to);
    default:
      return null;
  }
}

module.exports = { getReport, money, addMoney };
