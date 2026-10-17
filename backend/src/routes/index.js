const express = require('express');
const companyRoutes = require('./company');
const clientsRoutes = require('./clients');
const catalogRoutes = require('./catalog');
const quotationsRoutes = require('./quotations');
const invoicesRoutes = require('./invoices');
const paymentsRoutes = require('./payments');
const dashboardRoutes = require('./dashboard');
const reportsRoutes = require('./reports');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    data: { status: 'ok' },
    message: 'OK',
  });
});

router.use('/company', companyRoutes);
router.use('/clients', clientsRoutes);
router.use('/', catalogRoutes);
router.use('/quotations', quotationsRoutes);
router.use('/invoices', invoicesRoutes);
router.use('/payments', paymentsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportsRoutes);

module.exports = router;
