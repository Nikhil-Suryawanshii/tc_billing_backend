const path = require('path');
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const apiRoutes = require('./routes');

const app = express();

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
}));
app.use(express.json());
if (!process.env.VERCEL) {
  app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));
}

app.get('/', async (req, res) => {
  try {
    await connectDB();
    res.status(200).type('html').send('<h1>Connected successfully</h1>');
  } catch (error) {
    console.error('MongoDB connection check failed:', error);
    res.status(503).type('html').send('<h1>Database connection failed</h1>');
  }
});

app.use('/api/v1', apiRoutes);

app.use('/api/v1', (req, res) => res.status(404).json({
  data: null,
  message: 'API route not found.',
}));

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }
  console.error('Unhandled API error:', error);
  const status = Number.isInteger(error.status) ? error.status : 500;
  return res.status(status).json({
    data: null,
    message: status >= 500 ? 'An unexpected server error occurred.' : error.message,
  });
});

module.exports = app;
