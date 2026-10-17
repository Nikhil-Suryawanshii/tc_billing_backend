const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const {
  validateCategoryInput,
  validateProductInput,
} = require('../src/utils/catalogValidation');

test('category input validates required names and typed updates', () => {
  assert.deepEqual(validateCategoryInput({ name: '  Kitchen  ', sortOrder: '2' }), {
    updates: { name: 'Kitchen', sortOrder: 2 },
    errors: {},
  });
  assert.deepEqual(validateCategoryInput({ name: ' ' }).errors, { name: 'Name is required.' });
  assert.deepEqual(validateCategoryInput({ isActive: 'false' }), {
    updates: { isActive: false },
    errors: { name: 'Name is required.' },
  });
  assert.deepEqual(validateCategoryInput({ isActive: 'yes' }).errors, {
    name: 'Name is required.',
    isActive: 'Must be a boolean.',
  });
});

test('category updates accept hierarchy, price, and returned read-only metadata', () => {
  const parentId = '0123456789abcdef01234567';
  const categoryId = '1123456789abcdef01234567';
  const result = validateCategoryInput({
    _id: categoryId,
    id: categoryId,
    companyId: 'ignored',
    createdAt: '2026-10-14T06:08:05.963Z',
    updatedAt: '2026-10-14T06:08:06.021Z',
    __v: 0,
    parentId,
    name: '  Kitchen service  ',
    defaultPrice: '1999.50',
    isActive: 'false',
  }, { partial: true });

  assert.deepEqual(result, {
    updates: {
      parentId,
      name: 'Kitchen service',
      defaultPrice: '1999.50',
      isActive: false,
    },
    errors: {},
  });
  assert.deepEqual(validateCategoryInput({ defaultPrice: '-1' }, { partial: true }).errors, {
    defaultPrice: 'defaultPrice must be a non-negative decimal value.',
  });
});

test('product money uses fixed decimal strings and tax rate remains decimal-safe', () => {
  const result = validateProductInput({
    name: 'Sofa',
    sellingPrice: '1999.50',
    costPrice: 999,
    taxRate: '18.00',
    sku: '',
  });
  assert.deepEqual(result, {
    updates: {
      name: 'Sofa',
      sellingPrice: '1999.50',
      costPrice: '999.00',
      taxRate: '18',
      sku: '',
    },
    errors: {},
  });
  const product = new Product({
    companyId: new mongoose.Types.ObjectId(),
    ...result.updates,
  });
  assert.equal(product.sellingPrice, '1999.50');
  assert.equal(product.costPrice, '999.00');
});

test('product input rejects negative, non-finite, malformed, and unknown values', () => {
  const { updates, errors } = validateProductInput({
    name: 'Sofa',
    sellingPrice: '-1',
    costPrice: 'NaN',
    taxRate: 'Infinity',
    isActive: 'yes',
    companyId: 'ignored',
    unexpected: true,
  });
  assert.deepEqual(updates, { name: 'Sofa' });
  assert.deepEqual(Object.keys(errors).sort(), [
    'costPrice',
    'isActive',
    'sellingPrice',
    'taxRate',
    'unexpected',
  ]);
});

test('empty SKU is allowed while category IDs must be valid Mongo IDs or null', () => {
  assert.deepEqual(validateProductInput({ name: 'Table', sku: '', categoryId: null }).errors, {});
  assert.deepEqual(validateProductInput({ name: 'Table', categoryId: 'bad-id' }).errors, {
    categoryId: 'Must be a valid category id or null.',
  });
});

test('product updates accept serialized records and boolean form values', () => {
  const { updates, errors } = validateProductInput({
    _id: '0123456789abcdef01234567',
    id: '0123456789abcdef01234567',
    companyId: 'ignored',
    createdAt: '2026-10-14T06:08:05.963Z',
    updatedAt: '2026-10-14T06:08:06.021Z',
    __v: 0,
    imagePath: '/uploads/products/image.png',
    name: '  Updated product  ',
    isActive: 'false',
  }, { partial: true });

  assert.deepEqual(updates, { name: 'Updated product', isActive: false });
  assert.deepEqual(errors, {});
  assert.deepEqual(validateProductInput({ isActive: 'yes' }, { partial: true }).errors, {
    isActive: 'Must be a boolean.',
  });
});

test('product list category filters can use empty or all for the all-categories option', () => {
  const { normalizeProductListQuery } = require('../src/utils/catalogValidation');
  assert.deepEqual(normalizeProductListQuery({ search: '', categoryId: '' }), { search: '' });
  assert.deepEqual(normalizeProductListQuery({ categoryId: 'all' }), {});
  assert.deepEqual(normalizeProductListQuery({
    categoryId: '0123456789abcdef01234567',
    isActive: '',
  }), { categoryId: '0123456789abcdef01234567' });
});

test('SKU has a partial unique index so empty values are not constrained', () => {
  const skuIndex = Product.schema.indexes().find(([keys]) => keys.companyId === 1 && keys.sku === 1);
  assert.ok(skuIndex);
  assert.equal(skuIndex[1].unique, true);
  assert.deepEqual(skuIndex[1].partialFilterExpression, {
    sku: { $type: 'string', $gt: '' },
  });
  assert.equal(Category.schema.indexes().some(([keys, options]) => (
    keys.companyId === 1 && keys.name === 1 && options.unique
  )), true);
});

test('category default prices use the same fixed-decimal money format as products', () => {
  const category = new Category({
    companyId: new mongoose.Types.ObjectId(),
    name: 'Kitchen',
    defaultPrice: '1999.5',
  });
  assert.equal(category.defaultPrice, '1999.50');
  assert.equal(category.parentId, null);
});
