const { persistPdf } = require('../services/pdf');

function createPdfHandler({ Model, documentType }) {
  return async function generatePdf(req, res, next) {
    if (process.env.VERCEL) {
      return res.status(503).json({
        data: null,
        message: 'PDF generation requires persistent file storage and is unavailable on this deployment.',
      });
    }

    try {
      const filter = {
        _id: req.params.id,
        companyId: req.company._id,
      };
      if (documentType === 'quotation') filter.archivedAt = null;
      const document = await Model.findOne(filter).lean();
      if (!document) {
        const label = documentType === 'quotation' ? 'Quotation' : 'Invoice';
        return res.status(404).json({ data: null, message: `${label} not found.` });
      }
      const generated = await persistPdf({
        document,
        documentType,
        companyId: req.company._id,
      });
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Length': generated.buffer.length,
        'Content-Disposition': `attachment; filename="${generated.filename}"`,
        'Cache-Control': 'no-store',
      });
      return res.send(generated.buffer);
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = createPdfHandler;
