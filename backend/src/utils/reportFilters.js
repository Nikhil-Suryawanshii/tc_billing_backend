const reportSlugs = [
  'quotations',
  'quotation-outcomes',
  'conversion',
  'sales',
  'payments',
  'outstanding',
  'overdue',
  'clients',
  'products',
  'revenue',
];

const reportColumns = {
  quotations: ['status', 'count', 'total'],
  'quotation-outcomes': ['status', 'count', 'total'],
  conversion: ['metric', 'count'],
  sales: ['invoiceId', 'number', 'clientName', 'date', 'status', 'total', 'amountPaid', 'balanceDue'],
  payments: ['paymentId', 'date', 'invoiceNumber', 'clientName', 'amount', 'method', 'reference'],
  outstanding: ['invoiceId', 'number', 'clientName', 'invoiceDate', 'dueDate', 'status', 'grandTotal', 'amountPaid', 'balanceDue'],
  overdue: ['invoiceId', 'number', 'clientName', 'invoiceDate', 'dueDate', 'status', 'grandTotal', 'amountPaid', 'balanceDue'],
  clients: ['clientId', 'clientName', 'sales', 'paid', 'outstanding', 'invoices'],
  products: ['itemName', 'quantity', 'lineTotal', 'occurrences'],
  revenue: ['month', 'amount'],
};

function parseDate(value, field, errors) {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors[field] = 'Must be a date in YYYY-MM-DD format.';
    return undefined;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    errors[field] = 'Must be a valid date in YYYY-MM-DD format.';
    return undefined;
  }
  return date;
}

function parseReportFilters(query, now = new Date()) {
  const errors = {};
  const from = parseDate(query.from, 'from', errors);
  const to = parseDate(query.to, 'to', errors);
  const end = to || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  end.setUTCHours(23, 59, 59, 999);
  const start = from || new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));

  if (start > end) errors[to ? 'to' : 'from'] = to
    ? 'Must be on or after from.'
    : 'Must be on or before today.';

  return {
    errors,
    filters: {
      from: start,
      to: end,
      fromLabel: start.toISOString().slice(0, 10),
      toLabel: end.toISOString().slice(0, 10),
    },
  };
}

function csvEscape(value) {
  let text = value === undefined || value === null ? '' : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows, emptyHeaders = []) {
  const headers = rows.length ? Object.keys(rows[0]) : emptyHeaders;
  if (!headers.length) return '';
  return [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\r\n');
}

module.exports = { reportSlugs, reportColumns, parseReportFilters, toCsv };
