const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const connectDB = require('../config/db');
const { Category, Company, Product } = require('../models');
const { imageExtension, upload } = require('../middleware/companyUpload');
const {
  validateCategoryInput,
  validateProductInput,
  normalizeProductListQuery,
} = require('../utils/catalogValidation');
const documentResponse = require('../utils/documentResponse');
const { escapeRegex } = require('../utils/clientValidation');

const router = express.Router();
const productsUploadsDirectory = path.resolve(__dirname, '../../uploads/products');

function sendValidationError(res, errors) {
  return res.status(422).json({ data: null, message: 'Validation failed.', errors });
}

async function validateCategoryParent(parentId, companyId, categoryId) {
  if (!parentId) return null;

  const visited = new Set();
  let currentId = parentId;
  while (currentId) {
    const currentIdString = String(currentId);
    if (currentIdString === String(categoryId)) {
      return 'A category cannot be its own ancestor.';
    }
    if (visited.has(currentIdString)) {
      return 'The selected parent category has a circular parent reference.';
    }
    visited.add(currentIdString);

    const parent = await Category.findOne({ _id: currentId, companyId }).select('_id parentId').lean();
    if (!parent) return 'Parent category not found for this company.';
    currentId = parent.parentId;
  }
  return null;
}

router.use(['/categories', '/products'], async (req, res, next) => {
  try {
    await connectDB();
    req.company = await Company.current();
    if (!req.company) {
      return res.status(404).json({ data: null, message: 'Company is not seeded.' });
    }
    return next();
  } catch (error) {
    console.error('Catalog API database connection failed:', error);
    return res.status(503).json({ data: null, message: 'Database connection unavailable.' });
  }
});

router.get('/categories', async (req, res, next) => {
  try {
    const categories = await Category.find({ companyId: req.company._id })
      .sort({ isActive: -1, sortOrder: 1, name: 1 })
      .lean();
    return res.json({ data: categories.map(documentResponse), message: 'Categories retrieved.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/categories', async (req, res, next) => {
  const { updates, errors } = validateCategoryInput(req.body);
  if (Object.keys(errors).length) return sendValidationError(res, errors);
  try {
    const parentError = await validateCategoryParent(updates.parentId, req.company._id);
    if (parentError) return sendValidationError(res, { parentId: parentError });
    const category = await Category.create({ ...updates, companyId: req.company._id });
    return res.status(201).json({ data: documentResponse(category), message: 'Category created.' });
  } catch (error) {
    if (error.code === 11000) {
      return sendValidationError(res, { name: 'A category with this name already exists.' });
    }
    return next(error);
  }
});

router.get('/products', async (req, res, next) => {
  const errors = {};
  const filter = { companyId: req.company._id };
  const query = normalizeProductListQuery(req.query);

  if (query.search !== undefined) {
    if (typeof query.search !== 'string') {
      errors.search = 'Must be a string.';
    } else if (query.search.trim()) {
      const expression = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter.$or = [{ name: expression }, { sku: expression }];
    }
  }
  if (query.categoryId !== undefined) {
    if (typeof query.categoryId !== 'string' || !mongoose.isValidObjectId(query.categoryId)) {
      errors.categoryId = 'Must be a valid category id.';
    } else {
      filter.categoryId = query.categoryId;
    }
  }
  if (query.isActive === undefined) {
    filter.isActive = true;
  } else if (query.isActive === 'all') {
    // Explicitly include both active and inactive products.
  } else if (query.isActive === 'true' || query.isActive === 'false') {
    filter.isActive = query.isActive === 'true';
  } else {
    errors.isActive = 'Must be "true", "false", or "all".';
  }
  if (Object.keys(errors).length) return sendValidationError(res, errors);

  try {
    const products = await Product.find(filter).sort({ name: 1, createdAt: -1 }).lean();
    return res.json({ data: products.map(documentResponse), message: 'Products retrieved.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/products', async (req, res, next) => {
  const { updates, errors } = validateProductInput(req.body);
  if (Object.keys(errors).length) return sendValidationError(res, errors);
  try {
    if (updates.categoryId) {
      const category = await Category.exists({
        _id: updates.categoryId,
        companyId: req.company._id,
      });
      if (!category) {
        return sendValidationError(res, { categoryId: 'Category not found for this company.' });
      }
    }
    const product = await Product.create({ ...updates, companyId: req.company._id });
    return res.status(201).json({ data: documentResponse(product), message: 'Product created.' });
  } catch (error) {
    if (error.code === 11000) {
      return sendValidationError(res, { sku: 'This SKU is already used by another product.' });
    }
    return next(error);
  }
});

router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ data: null, message: 'Catalog item not found.' });
  }
  return next();
});

async function findCategory(req) {
  return Category.findOne({ _id: req.params.id, companyId: req.company._id });
}

async function findProduct(req) {
  return Product.findOne({ _id: req.params.id, companyId: req.company._id });
}

router.get('/categories/:id', async (req, res, next) => {
  try {
    const category = await findCategory(req);
    if (!category) return res.status(404).json({ data: null, message: 'Category not found.' });
    return res.json({ data: documentResponse(category), message: 'Category retrieved.' });
  } catch (error) {
    return next(error);
  }
});

router.put('/categories/:id', async (req, res, next) => {
  const { updates, errors } = validateCategoryInput(req.body, { partial: true });
  if (Object.keys(errors).length) return sendValidationError(res, errors);
  if (!Object.keys(updates).length) {
    return sendValidationError(res, { body: 'Provide at least one category field to update.' });
  }
  try {
    const category = await findCategory(req);
    if (!category) return res.status(404).json({ data: null, message: 'Category not found.' });
    if (Object.hasOwn(updates, 'parentId')) {
      const parentError = await validateCategoryParent(
        updates.parentId,
        req.company._id,
        category._id,
      );
      if (parentError) return sendValidationError(res, { parentId: parentError });
    }
    Object.assign(category, updates);
    await category.save();
    return res.json({ data: documentResponse(category), message: 'Category updated.' });
  } catch (error) {
    if (error.code === 11000) {
      return sendValidationError(res, { name: 'A category with this name already exists.' });
    }
    return next(error);
  }
});

router.delete('/categories/:id', async (req, res, next) => {
  try {
    const category = await findCategory(req);
    if (!category) return res.status(404).json({ data: null, message: 'Category not found.' });
    const productUsesCategory = await Product.exists({
      companyId: req.company._id,
      categoryId: category._id,
    });
    if (productUsesCategory) {
      return sendValidationError(res, {
        category: 'Cannot delete a category while products still use it.',
      });
    }
    await category.deleteOne();
    return res.json({ data: { id: category.id }, message: 'Category deleted.' });
  } catch (error) {
    return next(error);
  }
});

router.get('/products/:id', async (req, res, next) => {
  try {
    const product = await findProduct(req);
    if (!product) return res.status(404).json({ data: null, message: 'Product not found.' });
    return res.json({ data: documentResponse(product), message: 'Product retrieved.' });
  } catch (error) {
    return next(error);
  }
});

router.put('/products/:id', async (req, res, next) => {
  const { updates, errors } = validateProductInput(req.body, { partial: true });
  if (Object.keys(errors).length) return sendValidationError(res, errors);
  if (!Object.keys(updates).length) {
    return sendValidationError(res, { body: 'Provide at least one product field to update.' });
  }
  try {
    if (updates.categoryId) {
      const category = await Category.exists({
        _id: updates.categoryId,
        companyId: req.company._id,
      });
      if (!category) {
        return sendValidationError(res, { categoryId: 'Category not found for this company.' });
      }
    }
    const product = await findProduct(req);
    if (!product) return res.status(404).json({ data: null, message: 'Product not found.' });
    Object.assign(product, updates);
    await product.save();
    return res.json({ data: documentResponse(product), message: 'Product updated.' });
  } catch (error) {
    if (error.code === 11000) {
      return sendValidationError(res, { sku: 'This SKU is already used by another product.' });
    }
    return next(error);
  }
});

router.delete('/products/:id', async (req, res, next) => {
  try {
    const product = await findProduct(req);
    if (!product) return res.status(404).json({ data: null, message: 'Product not found.' });
    const previousImagePath = product.imagePath;
    await product.deleteOne();
    if (previousImagePath
      && previousImagePath === `/uploads/products/${path.basename(previousImagePath)}`) {
      await fs.unlink(path.join(productsUploadsDirectory, path.basename(previousImagePath))).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    return res.json({ data: { id: product.id }, message: 'Product deleted.' });
  } catch (error) {
    return next(error);
  }
});

function handleProductUpload(req, res, next) {
  if (process.env.VERCEL) {
    return res.status(503).json({
      data: null,
      message: 'Product image uploads require persistent object storage and are unavailable on this deployment.',
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

router.post('/products/:id/image', handleProductUpload, async (req, res, next) => {
  if (!req.file) {
    return sendValidationError(res, {
      file: 'Upload one JPEG, PNG, or WebP image using the "file" field.',
    });
  }
  const extension = imageExtension(req.file.buffer);
  if (!extension) {
    return sendValidationError(res, { file: 'File content is not a valid JPEG, PNG, or WebP image.' });
  }

  let product;
  try {
    product = await findProduct(req);
  } catch (error) {
    return next(error);
  }
  if (!product) {
    return res.status(404).json({ data: null, message: 'Product not found.' });
  }

  const filename = `${crypto.randomUUID()}.${extension}`;
  const absolutePath = path.join(productsUploadsDirectory, filename);
  const publicPath = `/uploads/products/${filename}`;
  let newImageWritten = false;
  try {
    await fs.mkdir(productsUploadsDirectory, { recursive: true });
    await fs.writeFile(absolutePath, req.file.buffer, { flag: 'wx' });
    newImageWritten = true;
    const previousPath = product.imagePath;
    product.imagePath = publicPath;
    await product.save();
    newImageWritten = false;

    if (previousPath
      && previousPath === `/uploads/products/${path.basename(previousPath)}`) {
      await fs.unlink(path.join(productsUploadsDirectory, path.basename(previousPath))).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    return res.json({ data: product, message: 'Product image uploaded.' });
  } catch (error) {
    if (newImageWritten) {
      await fs.unlink(absolutePath).catch((cleanupError) => {
        if (cleanupError.code !== 'ENOENT') {
          console.error('Unable to remove unreferenced product image:', cleanupError);
        }
      });
    }
    return next(error);
  }
});

module.exports = router;
