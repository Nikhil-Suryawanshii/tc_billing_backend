import path from 'path';
import Quotation from '../models/Quotation.js';
import Invoice from '../models/Invoice.js';
import DocumentFile from '../models/DocumentFile.js';
import Company from '../models/Company.js';
import { HttpError } from '../lib/http.js';
import { uploadsDir } from '../config/paths.js';
import { writePdf } from './pdf.js';
import { refreshStatuses } from './status.js';

export async function generatePdf(kind, id) {
  const company = await Company.current();
  await refreshStatuses(company._id);
  const Model = kind === 'invoice' ? Invoice : Quotation;
  const record = await Model.findOne({ _id: id, companyId: company._id });
  if (!record) throw new HttpError(404, kind === 'invoice' ? 'Invoice not found' : 'Quotation not found');

  const previous = await DocumentFile.findOne({ documentType: kind, documentId: record._id }).sort({ version: -1 });
  const version = (previous?.version || 0) + 1;
  const filename = `${String(record.number).replace(/\s+/g, '-')}-v${version}.pdf`;
  const absolute = path.join(uploadsDir, 'pdfs', filename);
  await writePdf({ filePath: absolute, kind, record, company });

  const publicPath = `/uploads/pdfs/${filename}`;
  await DocumentFile.create({
    companyId: company._id,
    documentType: kind,
    documentId: record._id,
    path: publicPath,
    version,
    generatedAt: new Date(),
  });

  return { absolute, filename: `${String(record.number).replace(/\s+/g, '-')}.pdf` };
}
