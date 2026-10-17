const express = require('express');
const connectDB = require('../config/db');
const Company = require('../models/Company');
const { getReport } = require('../services/reports');
const { parseReportFilters, reportColumns, reportSlugs, toCsv } = require('../utils/reportFilters');

const router = express.Router();

router.use(async (req, res, next) => {
  try {
    await connectDB();
    req.company = await Company.current();
    if (!req.company) return res.status(404).json({ data: null, message: 'Company is not seeded.' });
    return next();
  } catch (error) {
    console.error('Reports API database connection failed:', error);
    return res.status(503).json({ data: null, message: 'Database connection unavailable.' });
  }
});

async function buildReport(req, res, next) {
  if (!reportSlugs.includes(req.params.slug)) {
    return res.status(404).json({ data: null, message: 'Report not found.' });
  }
  const errors = {};
  for (const key of Object.keys(req.query)) {
    if (!['from', 'to'].includes(key)) errors[key] = 'Unsupported query parameter.';
  }
  const { filters, errors: filterErrors } = parseReportFilters(req.query);
  Object.assign(errors, filterErrors);
  if (Object.keys(errors).length) {
    return res.status(422).json({ data: null, message: 'Validation failed.', errors });
  }

  try {
    const report = await getReport(req.params.slug, req.company._id, filters.from, filters.to);
    if (!report) return res.status(404).json({ data: null, message: 'Report not found.' });
    req.reportResult = {
      ...report,
      from: filters.fromLabel,
      to: filters.toLabel,
    };
    return next();
  } catch (error) {
    console.error(`Report "${req.params.slug}" query failed:`, error);
    return next(error);
  }
}

router.get('/:slug/export', buildReport, (req, res) => {
  const { slug } = req.params;
  const { from, to, rows } = req.reportResult;
  const filename = `${slug}-${from}-to-${to}.csv`;
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  return res.send(`\uFEFF${toCsv(rows, reportColumns[slug])}`);
});

router.get('/:slug', buildReport, (req, res) => res.json({
  data: req.reportResult,
  message: `${req.params.slug} report retrieved.`,
}));

module.exports = router;
