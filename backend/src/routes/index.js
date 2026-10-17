const express = require('express');
const companyRoutes = require('./company');
const clientsRoutes = require('./clients');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    data: { status: 'ok' },
    message: 'OK',
  });
});

router.use('/company', companyRoutes);
router.use('/clients', clientsRoutes);

module.exports = router;
