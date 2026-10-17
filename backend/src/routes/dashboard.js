const express = require('express');
const connectDB = require('../config/db');
const Company = require('../models/Company');
const { getDashboard } = require('../services/dashboard');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    await connectDB();
    const company = await Company.current();
    if (!company) return res.status(404).json({ data: null, message: 'Company is not seeded.' });
    const data = await getDashboard(company._id);
    return res.json({ data, message: 'Dashboard retrieved.' });
  } catch (error) {
    console.error('Dashboard query failed:', error);
    return next(error);
  }
});

module.exports = router;
