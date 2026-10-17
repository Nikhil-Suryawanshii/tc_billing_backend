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

module.exports = app;
