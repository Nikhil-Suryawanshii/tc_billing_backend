const express = require('express');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { Company, Invoice, Quotation } = require('../models');
const { persistPdf } = require('../services/pdf');

function createPdfRouter({ Model, documentType }) {
  const router = express.Router();

  router.get('/:id/pdf', async (req, res, next) => {
    if (process.env.VERCEL) {
      return res.status(503).json({
        data: null,
        message: 'PDF generation requires persistent file storage and is unavailable on this deployment.',
      });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ data: null, message: `${documentType} not found.` });
    }

    try {
      await connectDB();
      const company = await Company.current();
      if (!company) {
        return res.status(404).json({ data: null, message: 'Company is not seeded.' });
      }
      const filter = { _id: req.params.id, companyId: company._id };
      if (documentType === 'quotation') filter.archivedAt = null;
      const document = await Model.findOne(filter).lean();
      if (!document) {
        const label = documentType === 'quotation' ? 'Quotation' : 'Invoice';
        return res.status(404).json({ data: null, message: `${label} not found.` });
      }
      const generated = await persistPdf({
        document,
        documentType,
        companyId: company._id,
      });
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Length': generated.buffer.length,
        'Content-Disposition': `attachment; filename="${generated.filename}"`,
        'Cache-Control': 'no-store',
      });
      return res.send(generated.buffer);
    } catch (error) {
      console.error(`${documentType} PDF generation failed:`, error);
      return next(error);
    }
  });

  return router;
}

module.exports = {
  quotations: createPdfRouter({ Model: Quotation, documentType: 'quotation' }),
  invoices: createPdfRouter({ Model: Invoice, documentType: 'invoice' }),
};
