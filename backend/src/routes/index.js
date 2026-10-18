import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { ok } from '../lib/http.js';
import { imageUpload } from '../middleware/upload.js';
import * as companyService from '../services/company.js';
import * as clientService from '../services/clients.js';
import * as catalog from '../services/catalog.js';
import * as quotations from '../services/quotations.js';
import * as invoices from '../services/invoices.js';
import * as payments from '../services/payments.js';
import * as reports from '../services/reports.js';
import { generatePdf } from '../services/pdfFiles.js';
import { fileUrl } from '../services/files.js';
import { HttpError } from '../lib/http.js';

const router = Router();

router.get('/health', (_req, res) => {
  ok(res, { status: 'ok' });
});

function companyJson(req, company) {
  const json = company.toJSON();
  json.logoUrl = fileUrl(req, json.logoPath);
  json.signatureUrl = fileUrl(req, json.signaturePath);
  return json;
}

router.get('/company', asyncHandler(async (req, res) => {
  ok(res, companyJson(req, await companyService.getCompany()));
}));

router.get('/company/defaults', asyncHandler(async (_req, res) => {
  ok(res, await companyService.getDefaults());
}));

router.put('/company', asyncHandler(async (req, res) => {
  ok(res, companyJson(req, await companyService.updateCompany(req.body)), 'Company updated');
}));

router.post('/company/logo', imageUpload('company').single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(422, 'Choose an image');
  const company = await companyService.saveImage('logo', `/uploads/company/${req.file.filename}`);
  ok(res, companyJson(req, company), 'Logo updated');
}));

router.post('/company/signature', imageUpload('company').single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(422, 'Choose an image');
  const company = await companyService.saveImage('signature', `/uploads/company/${req.file.filename}`);
  ok(res, companyJson(req, company), 'Signature updated');
}));

router.get('/clients', asyncHandler(async (req, res) => {
  const result = await clientService.listClients(req.query);
  ok(res, result.rows, 'OK', result.meta);
}));
router.post('/clients', asyncHandler(async (req, res) => {
  res.status(201);
  ok(res, await clientService.createClient(req.body), 'Client created');
}));
router.get('/clients/:id/history', asyncHandler(async (req, res) => {
  ok(res, await clientService.clientHistory(req.params.id));
}));
router.get('/clients/:id', asyncHandler(async (req, res) => {
  ok(res, await clientService.getClient(req.params.id));
}));
router.put('/clients/:id', asyncHandler(async (req, res) => {
  ok(res, await clientService.updateClient(req.params.id, req.body), 'Client updated');
}));
router.delete('/clients/:id', asyncHandler(async (req, res) => {
  await clientService.deleteClient(req.params.id);
  ok(res, null, 'Client deleted');
}));

router.get('/categories', asyncHandler(async (_req, res) => {
  ok(res, await catalog.listCategories());
}));
router.post('/categories', asyncHandler(async (req, res) => {
  ok(res, await catalog.createCategory(req.body), 'Category created');
}));
router.get('/categories/:id', asyncHandler(async (req, res) => {
  const rows = await catalog.listCategories();
  const category = rows.find((row) => row.id === req.params.id);
  if (!category) throw new HttpError(404, 'Category not found');
  ok(res, category);
}));
router.put('/categories/:id', asyncHandler(async (req, res) => {
  ok(res, await catalog.updateCategory(req.params.id, req.body), 'Category updated');
}));
router.delete('/categories/:id', asyncHandler(async (req, res) => {
  await catalog.deleteCategory(req.params.id);
  ok(res, null, 'Category deleted');
}));

router.get('/products', asyncHandler(async (req, res) => {
  const result = await catalog.listProducts(req.query);
  ok(res, result.rows.map((row) => ({ ...row, imageUrl: fileUrl(req, row.imagePath) })), 'OK', result.meta);
}));
router.post('/products', asyncHandler(async (req, res) => {
  const product = await catalog.createProduct(req.body);
  ok(res, { ...product, imageUrl: fileUrl(req, product.imagePath) }, 'Product created');
}));
router.get('/products/:id', asyncHandler(async (req, res) => {
  const product = await catalog.getProduct(req.params.id);
  ok(res, { ...product, imageUrl: fileUrl(req, product.imagePath) });
}));
router.put('/products/:id', asyncHandler(async (req, res) => {
  const product = await catalog.updateProduct(req.params.id, req.body);
  ok(res, { ...product, imageUrl: fileUrl(req, product.imagePath) }, 'Product updated');
}));
router.delete('/products/:id', asyncHandler(async (req, res) => {
  await catalog.deleteProduct(req.params.id);
  ok(res, null, 'Product deleted');
}));
router.post('/products/:id/image', imageUpload('products').single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(422, 'Choose an image');
  const product = await catalog.saveProductImage(req.params.id, `/uploads/products/${req.file.filename}`);
  ok(res, { ...product, imageUrl: fileUrl(req, product.imagePath) }, 'Image updated');
}));

router.get('/quotations', asyncHandler(async (req, res) => {
  const result = await quotations.listQuotations(req.query);
  ok(res, result.rows, 'OK', result.meta);
}));
router.post('/quotations', asyncHandler(async (req, res) => {
  ok(res, await quotations.createQuotation(req.body), 'Quotation saved');
}));
router.get('/quotations/:id/pdf', asyncHandler(async (req, res) => {
  const file = await generatePdf('quotation', req.params.id);
  res.type('application/pdf');
  res.download(file.absolute, file.filename);
}));
router.post('/quotations/:id/duplicate', asyncHandler(async (req, res) => {
  ok(res, await quotations.duplicateQuotation(req.params.id), 'Quotation duplicated');
}));
router.post('/quotations/:id/convert', asyncHandler(async (req, res) => {
  ok(res, await invoices.convertQuotation(req.params.id), 'Invoice created');
}));
router.patch('/quotations/:id/status', asyncHandler(async (req, res) => {
  ok(res, await quotations.changeStatus(req.params.id, req.body.status), 'Status updated');
}));
router.get('/quotations/:id', asyncHandler(async (req, res) => {
  ok(res, await quotations.getQuotation(req.params.id));
}));
router.put('/quotations/:id', asyncHandler(async (req, res) => {
  ok(res, await quotations.updateQuotation(req.params.id, req.body), 'Quotation updated');
}));
router.delete('/quotations/:id', asyncHandler(async (req, res) => {
  ok(res, await quotations.archiveQuotation(req.params.id), 'Quotation archived');
}));

router.get('/invoices', asyncHandler(async (req, res) => {
  const result = await invoices.listInvoices(req.query);
  ok(res, result.rows, 'OK', result.meta);
}));
router.post('/invoices', asyncHandler(async (req, res) => {
  ok(res, await invoices.createInvoice(req.body), 'Invoice saved');
}));
router.get('/invoices/:id/pdf', asyncHandler(async (req, res) => {
  const file = await generatePdf('invoice', req.params.id);
  res.type('application/pdf');
  res.download(file.absolute, file.filename);
}));
router.get('/invoices/:id/payments', asyncHandler(async (req, res) => {
  ok(res, await payments.invoicePayments(req.params.id));
}));
router.post('/invoices/:id/payments', asyncHandler(async (req, res) => {
  const result = await payments.addPayment(req.params.id, req.body);
  ok(res, { payment: result.payment, invoice: result.invoice.toJSON() }, 'Payment recorded');
}));
router.post('/invoices/:id/issue', asyncHandler(async (req, res) => {
  ok(res, await invoices.issueInvoice(req.params.id), 'Invoice issued');
}));
router.post('/invoices/:id/cancel', asyncHandler(async (req, res) => {
  ok(res, await invoices.cancelInvoice(req.params.id), 'Invoice cancelled');
}));
router.get('/invoices/:id', asyncHandler(async (req, res) => {
  ok(res, await invoices.getInvoice(req.params.id));
}));
router.put('/invoices/:id', asyncHandler(async (req, res) => {
  ok(res, await invoices.updateInvoice(req.params.id, req.body), 'Invoice updated');
}));

router.get('/payments', asyncHandler(async (req, res) => {
  const result = await payments.listPayments(req.query);
  ok(res, result.rows, 'OK', result.meta);
}));
router.delete('/payments/:id', asyncHandler(async (req, res) => {
  await payments.deletePayment(req.params.id);
  ok(res, null, 'Payment removed');
}));

router.get('/dashboard', asyncHandler(async (_req, res) => {
  ok(res, await reports.dashboard());
}));

router.get('/reports/:slug/export', asyncHandler(async (req, res) => {
  const data = await reports.report(req.params.slug, req.query);
  res.type('text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.slug}.csv"`);
  res.send(reports.toCsv(req.params.slug, data));
}));

router.get('/reports/:slug', asyncHandler(async (req, res) => {
  ok(res, await reports.report(req.params.slug, req.query));
}));

export default router;
