import Category from '../models/Category.js';
import Product from '../models/Product.js';
import Company from '../models/Company.js';
import { HttpError, escapeRegex, pageQuery } from '../lib/http.js';
import { money } from '../lib/money.js';
import { removeUpload } from './files.js';

export async function listCategories() {
  const company = await Company.current();
  return Category.find({ companyId: company._id }).sort({ isActive: -1, sortOrder: 1, name: 1 });
}

export async function createCategory(body) {
  const company = await Company.current();
  const name = String(body.name || '').trim();
  if (!name) throw new HttpError(422, 'Validation failed', { name: 'Name is required' });
  let parentId = body.parentId || null;
  if (parentId) {
    const parent = await Category.findOne({ _id: parentId, companyId: company._id, parentId: null });
    if (!parent) throw new HttpError(422, 'Validation failed', { parentId: 'Choose a main category' });
    parentId = parent._id;
  }
  return Category.create({
    companyId: company._id,
    parentId,
    name,
    description: body.description || '',
    defaultPrice: money(body.defaultPrice || 0),
    isActive: body.isActive !== false,
    sortOrder: Number(body.sortOrder || 0),
  });
}

export async function updateCategory(id, body) {
  const company = await Company.current();
  const category = await Category.findOne({ _id: id, companyId: company._id });
  if (!category) throw new HttpError(404, 'Category not found');
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new HttpError(422, 'Validation failed', { name: 'Name is required' });
    category.name = name;
  }
  if (body.description !== undefined) category.description = body.description;
  if (body.isActive !== undefined) category.isActive = Boolean(body.isActive);
  if (body.sortOrder !== undefined) category.sortOrder = Number(body.sortOrder || 0);
  if (body.defaultPrice !== undefined) category.defaultPrice = money(body.defaultPrice);
  await category.save();
  return category;
}

export async function deleteCategory(id) {
  const company = await Company.current();
  const category = await Category.findOne({ _id: id, companyId: company._id });
  if (!category) throw new HttpError(404, 'Category not found');
  const [used, children] = await Promise.all([
    Product.countDocuments({ categoryId: category._id }),
    Category.countDocuments({ parentId: category._id }),
  ]);
  if (children) throw new HttpError(422, 'Remove the points under this category first');
  if (used) throw new HttpError(422, 'This category still has products');
  await category.deleteOne();
}

function presentProduct(product) {
  const json = product.toJSON();
  json.sellingPrice = money(json.sellingPrice);
  json.costPrice = json.costPrice ? money(json.costPrice) : '';
  json.taxRate = money(json.taxRate || 0);
  return json;
}

export async function listProducts(query) {
  const company = await Company.current();
  const { page, perPage, skip } = pageQuery(query);
  const filter = { companyId: company._id };
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: pattern }, { sku: pattern }];
  }
  if (query.categoryId) filter.categoryId = query.categoryId;
  if (query.isActive === 'all') {
    // both
  } else if (query.isActive === 'false') filter.isActive = false;
  else filter.isActive = true;

  const [rows, total] = await Promise.all([
    Product.find(filter).sort({ name: 1 }).skip(skip).limit(perPage),
    Product.countDocuments(filter),
  ]);
  return { rows: rows.map(presentProduct), meta: { currentPage: page, perPage, total } };
}

export async function getProduct(id) {
  const company = await Company.current();
  const product = await Product.findOne({ _id: id, companyId: company._id });
  if (!product) throw new HttpError(404, 'Product not found');
  return presentProduct(product);
}

function validateProduct(body, creating) {
  const errors = {};
  if (creating && !String(body.name || '').trim()) errors.name = 'Name is required';
  if (body.name !== undefined && !String(body.name).trim()) errors.name = 'Name is required';
  if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
}

export async function createProduct(body) {
  validateProduct(body, true);
  const company = await Company.current();
  const product = await Product.create({
    companyId: company._id,
    categoryId: body.categoryId || null,
    name: String(body.name).trim(),
    sku: String(body.sku || '').trim(),
    description: body.description || '',
    unit: body.unit || '',
    sellingPrice: money(body.sellingPrice || 0),
    costPrice: body.costPrice ? money(body.costPrice) : '',
    taxRate: money(body.taxRate || 0),
    isActive: body.isActive !== false,
  });
  return presentProduct(product);
}

export async function updateProduct(id, body) {
  validateProduct(body, false);
  const company = await Company.current();
  const product = await Product.findOne({ _id: id, companyId: company._id });
  if (!product) throw new HttpError(404, 'Product not found');
  if (body.name !== undefined) product.name = String(body.name).trim();
  if (body.sku !== undefined) product.sku = String(body.sku || '').trim();
  if (body.description !== undefined) product.description = body.description;
  if (body.unit !== undefined) product.unit = body.unit;
  if (body.categoryId !== undefined) product.categoryId = body.categoryId || null;
  if (body.sellingPrice !== undefined) product.sellingPrice = money(body.sellingPrice);
  if (body.costPrice !== undefined) product.costPrice = body.costPrice ? money(body.costPrice) : '';
  if (body.taxRate !== undefined) product.taxRate = money(body.taxRate);
  if (body.isActive !== undefined) product.isActive = Boolean(body.isActive);
  await product.save();
  return presentProduct(product);
}

export async function deleteProduct(id) {
  const company = await Company.current();
  const product = await Product.findOne({ _id: id, companyId: company._id });
  if (!product) throw new HttpError(404, 'Product not found');
  await removeUpload(product.imagePath);
  await product.deleteOne();
}

export async function saveProductImage(id, publicPath) {
  const company = await Company.current();
  const product = await Product.findOne({ _id: id, companyId: company._id });
  if (!product) throw new HttpError(404, 'Product not found');
  const previous = product.imagePath;
  product.imagePath = publicPath;
  await product.save();
  if (previous && previous !== publicPath) await removeUpload(previous);
  return presentProduct(product);
}
