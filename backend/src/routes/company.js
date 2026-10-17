const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const multer = require('multer');
const connectDB = require('../config/db');
const Company = require('../models/Company');
const { defaultsFields, validateCompanyUpdate } = require('../utils/companyValidation');
const { imageExtension, upload } = require('../middleware/companyUpload');

const router = express.Router();
const companyUploadsDirectory = path.resolve(__dirname, '../../uploads/company');
const defaultsProjection = defaultsFields.join(' ');

function companyResponse(company) {
  const data = company.toObject();
  data.logoUrl = data.logoPath || null;
  data.signatureUrl = data.signaturePath || null;
  return data;
}

function sendValidationError(res, errors) {
  return res.status(422).json({
    data: null,
    message: 'Validation failed.',
    errors,
  });
}

function handleUpload(req, res, next) {
  if (process.env.VERCEL) {
    return res.status(503).json({
      data: null,
      message: 'Company image uploads require persistent object storage and are unavailable on this deployment.',
    });
  }

  return upload.single('file')(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Image must be 4 MB or smaller.'
        : 'Upload exactly one JPEG, PNG, or WebP image using the "file" field.';
      return sendValidationError(res, { file: message });
    }
    if (error) return next(error);
    return next();
  });
}

async function ensureDatabase(req, res, next) {
  try {
    await connectDB();
    return next();
  } catch (error) {
    console.error('Company API database connection failed:', error);
    return res.status(503).json({
      data: null,
      message: 'Database connection unavailable.',
    });
  }
}

router.use(ensureDatabase);

router.get('/defaults', async (req, res, next) => {
  try {
    const company = await Company.current().select(defaultsProjection).lean();
    if (!company) {
      return res.status(404).json({ data: null, message: 'Company is not seeded.' });
    }
    return res.json({ data: company, message: 'Company defaults retrieved.' });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const company = await Company.current();
    if (!company) {
      return res.status(404).json({ data: null, message: 'Company is not seeded.' });
    }
    return res.json({
      data: companyResponse(company),
      message: 'Company retrieved.',
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/', async (req, res, next) => {
  const { updates, errors } = validateCompanyUpdate(req.body);
  if (Object.keys(errors).length) {
    return sendValidationError(res, errors);
  }
  if (!Object.keys(updates).length) {
    return sendValidationError(res, { body: 'Provide at least one company field to update.' });
  }

  try {
    const company = await Company.current();
    if (!company) {
      return res.status(404).json({ data: null, message: 'Company is not seeded.' });
    }
    Object.assign(company, updates);
    await company.save();
    return res.json({
      data: companyResponse(company),
      message: 'Company updated.',
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const validationErrors = Object.fromEntries(
        Object.entries(error.errors).map(([field, issue]) => [field, issue.message]),
      );
      return sendValidationError(res, validationErrors);
    }
    return next(error);
  }
});

async function replaceCompanyImage(req, res, next, field) {
  if (!req.file) {
    return sendValidationError(res, {
      file: 'Upload one JPEG, PNG, or WebP image using the "file" field.',
    });
  }
  const extension = imageExtension(req.file.buffer);
  if (!extension) {
    return sendValidationError(res, { file: 'File content is not a valid JPEG, PNG, or WebP image.' });
  }

  const filename = `${crypto.randomUUID()}.${extension}`;
  const absolutePath = path.join(companyUploadsDirectory, filename);
  const publicPath = `/uploads/company/${filename}`;
  let newImageWritten = false;

  try {
    await fs.mkdir(companyUploadsDirectory, { recursive: true });
    await fs.writeFile(absolutePath, req.file.buffer, { flag: 'wx' });
    newImageWritten = true;

    const company = await Company.current();
    if (!company) {
      await fs.unlink(absolutePath);
      newImageWritten = false;
      return res.status(404).json({ data: null, message: 'Company is not seeded.' });
    }

    const previousPath = company[field];
    company[field] = publicPath;
    await company.save();
    newImageWritten = false;

    if (previousPath) {
      const previousFilename = path.basename(previousPath);
      if (previousFilename && previousPath === `/uploads/company/${previousFilename}`) {
        await fs.unlink(path.join(companyUploadsDirectory, previousFilename)).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
    }

    return res.json({
      data: companyResponse(company),
      message: field === 'logoPath' ? 'Company logo uploaded.' : 'Company signature uploaded.',
    });
  } catch (error) {
    if (newImageWritten) {
      try {
        await fs.unlink(absolutePath);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
          console.error('Unable to remove unreferenced company image:', cleanupError);
        }
      }
    }
    return next(error);
  }
}

router.post('/logo', handleUpload, (req, res, next) => {
  replaceCompanyImage(req, res, next, 'logoPath');
});

router.post('/signature', handleUpload, (req, res, next) => {
  replaceCompanyImage(req, res, next, 'signaturePath');
});

module.exports = router;
