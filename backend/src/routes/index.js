const express = require('express');
const companyRoutes = require('./company');
const clientsRoutes = require('./clients');
const dashboardRoutes = require('./dashboard');
const reportsRoutes = require('./reports');
const pdfRoutes = require('./pdf');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    data: { status: 'ok' },
    message: 'OK',
  });
});

router.use('/company', companyRoutes);
router.use('/clients', clientsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportsRoutes);
router.use('/quotations', pdfRoutes.quotations);
router.use('/invoices', pdfRoutes.invoices);

module.exports = router;
