const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const PDFDocument = require('pdfkit');
const Decimal = require('decimal.js');
const { DocumentFile } = require('../models');

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 42;
const footerHeight = 66;
const contentWidth = pageWidth - (margin * 2);
const tableColumns = [
  { title: 'S.No.', width: 42 },
  { title: 'Item Details', width: 250 },
  { title: 'Quantity', width: 68, align: 'right' },
  { title: 'Price', width: 72, align: 'right' },
  { title: 'Total', width: 79, align: 'right' },
];
const fontDirectory = path.dirname(require.resolve('dejavu-fonts-ttf/package.json'));
const regularFont = path.join(fontDirectory, 'ttf/DejaVuSans.ttf');
const boldFont = path.join(fontDirectory, 'ttf/DejaVuSans-Bold.ttf');

function money(value, currency = 'INR') {
  const amount = new Decimal(String(value || 0)).toFixed(2, Decimal.ROUND_HALF_UP);
  return currency === 'INR' ? `₹ ${amount}` : `${currency} ${amount}`;
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function safeUploadPath(uploadPath) {
  if (typeof uploadPath !== 'string' || !uploadPath.startsWith('/uploads/')) return null;
  const relative = uploadPath.slice('/uploads/'.length);
  if (!relative || relative.split('/').some((part) => part === '.' || part === '..')) return null;
  const uploadsRoot = path.resolve(__dirname, '../../uploads');
  const absolutePath = path.resolve(uploadsRoot, relative);
  return absolutePath.startsWith(`${uploadsRoot}${path.sep}`) ? absolutePath : null;
}

function textHeight(doc, value, width, options = {}) {
  if (!value) return 0;
  return doc.heightOfString(text(value), {
    width,
    font: options.font || 'Regular',
    fontSize: options.fontSize || 9,
    lineGap: options.lineGap || 2,
  });
}

function renderHeader(doc, document, company) {
  const title = text(document.header || (document.invoiceDate ? 'Invoice' : 'Quotation'));
  const rightX = margin + 122;
  const rightWidth = contentWidth - 122;
  const logoPath = safeUploadPath(company.logoPath);
  let top = margin;

  if (logoPath && fs.existsSync(logoPath)) {
    doc.image(logoPath, margin, top, { fit: [112, 66] });
  }

  doc.font('Bold').fontSize(18).text(title, rightX, top, { width: rightWidth, align: 'right' });
  top += 25;
  doc.font('Bold').fontSize(11).text(text(company.name), rightX, top, { width: rightWidth, align: 'right' });
  top += 17;

  const companyAddress = [
    company.addressLine1,
    company.addressLine2,
    [company.city, company.state, company.postalCode].filter(Boolean).join(', '),
    company.country,
  ].filter(Boolean).join('\n');
  if (companyAddress) {
    doc.font('Regular').fontSize(8).text(companyAddress, rightX, top, { width: rightWidth, align: 'right' });
    top += textHeight(doc, companyAddress, rightWidth, { fontSize: 8 }) + 3;
  }
  const contacts = [company.phone, company.email, company.website].filter(Boolean).join('  |  ');
  if (contacts) {
    doc.font('Regular').fontSize(8).text(contacts, rightX, top, { width: rightWidth, align: 'right' });
  }

  const headerBottom = Math.max(top + 20, margin + 80);
  doc.moveTo(margin, headerBottom).lineTo(pageWidth - margin, headerBottom)
    .lineWidth(0.7).strokeColor('#777777').stroke();
  top = headerBottom + 15;

  const client = document.clientSnapshot || {};
  const clientAddress = [
    client.billingAddress || client.addressLine1,
    client.shippingAddress,
    [client.city, client.state, client.postalCode].filter(Boolean).join(', '),
    client.country,
  ].filter(Boolean).join('\n');
  doc.font('Bold').fontSize(9).text('To', margin, top);
  doc.font('Bold').fontSize(10).text(text(client.name), margin, top + 14);
  let clientBottom = top + 28;
  if (clientAddress) {
    doc.font('Regular').fontSize(8).text(clientAddress, margin, clientBottom, { width: 245, lineGap: 2 });
    clientBottom += textHeight(doc, clientAddress, 245, { fontSize: 8 }) + 3;
  }
  if (client.gstNumber) {
    doc.font('Regular').fontSize(8).text(`GST: ${client.gstNumber}`, margin, clientBottom);
    clientBottom += 12;
  }

  const factsX = margin + 290;
  let factsY = top;
  const facts = [
    ['Number', document.number],
    [document.invoiceDate ? 'Invoice date' : 'Date', formatDate(document.invoiceDate || document.quotationDate)],
    ...(document.poSoNumber ? [['P.O. / S.O.', document.poSoNumber]] : []),
  ];
  for (const [label, value] of facts) {
    if (!value) continue;
    doc.font('Bold').fontSize(8).text(`${label}:`, factsX, factsY, { width: 80 });
    doc.font('Regular').fontSize(8).text(text(value), factsX + 83, factsY, {
      width: contentWidth - (factsX - margin) - 83,
      align: 'right',
    });
    factsY += 14;
  }
  doc.font('Bold').fontSize(9).text('Grand total', factsX, factsY + 4, { width: 80 });
  doc.font('Bold').fontSize(10).text(money(document.grandTotal, document.currency), factsX + 83, factsY + 2, {
    width: contentWidth - (factsX - margin) - 83,
    align: 'right',
  });
  return Math.max(clientBottom, factsY + 20) + 13;
}

function renderIntroduction(doc, document) {
  for (const [field, font] of [['salutation', 'Bold'], ['message', 'Regular']]) {
    if (!document[field]) continue;
    doc.font(font).fontSize(9).text(text(document[field]), margin, doc.y, {
      width: contentWidth,
      lineGap: 3,
    });
    doc.y += 7;
  }
}

function renderTableHeader(doc) {
  const y = doc.y;
  doc.save();
  doc.rect(margin, y, contentWidth, 22).fill('#eeeeee');
  doc.restore();
  let x = margin;
  for (const column of tableColumns) {
    doc.font('Bold').fontSize(8).fillColor('#111111')
      .text(column.title, x + 4, y + 7, {
        width: column.width - 8,
        align: column.align || 'left',
      });
    x += column.width;
  }
  doc.y = y + 28;
}

function renderItem(doc, item, index, currency, ensurePage) {
  const detailWidth = tableColumns[1].width - 10;
  const details = [
    ...(item.sectionHeading ? [{ value: text(item.sectionHeading), font: 'Bold', size: 9 }] : []),
    ...(item.name ? [{ value: text(item.name), font: 'Bold', size: 9 }] : []),
    ...(item.description ? [{ value: text(item.description), font: 'Regular', size: 8 }] : []),
  ];
  const estimatedHeight = details.reduce(
    (total, part) => total + textHeight(doc, part.value, detailWidth, { font: part.font, fontSize: part.size }) + 3,
    0,
  );
  ensurePage(Math.min(estimatedHeight, 100) + 20);

  const startY = doc.y;
  const cells = [
    { value: String(index + 1), width: tableColumns[0].width },
    { value: '', width: tableColumns[1].width },
    { value: text(item.quantity), width: tableColumns[2].width, align: 'right' },
    { value: money(item.unitPrice, currency), width: tableColumns[3].width, align: 'right' },
    { value: money(item.lineTotal, currency), width: tableColumns[4].width, align: 'right', bold: true },
  ];
  let x = margin;
  cells.forEach((cell, cellIndex) => {
    if (cellIndex !== 1) {
      doc.font(cell.bold ? 'Bold' : 'Regular').fontSize(8).fillColor('#111111')
        .text(cell.value, x + 4, startY + 2, {
          width: cell.width - 8,
          align: cell.align || 'left',
        });
    }
    x += cell.width;
  });

  let detailY = startY + 2;
  const detailX = margin + tableColumns[0].width + 4;
  for (const part of details) {
    doc.font(part.font).fontSize(part.size).fillColor('#111111')
      .text(part.value, detailX, detailY, { width: detailWidth, lineGap: 2 });
    detailY = doc.y + 3;
  }
  doc.y = Math.max(startY + 22, detailY + 1);
  if (doc.y < pageHeight - footerHeight - margin) {
    doc.moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y)
      .lineWidth(0.35).strokeColor('#cccccc').stroke();
    doc.y += 7;
  }
}

function renderTotals(doc, document, ensurePage) {
  const nonZero = (value) => new Decimal(String(value || 0)).isZero() === false;
  const rows = [
    ['Subtotal', document.subtotal],
    ...(nonZero(document.discountTotal) ? [['Discount', document.discountTotal, true]] : []),
    ...(nonZero(document.taxTotal) ? [['Tax', document.taxTotal]] : []),
    ...(nonZero(document.additionalCharges) ? [['Additional charges', document.additionalCharges]] : []),
    ['Grand total', document.grandTotal],
  ];
  ensurePage(rows.length * 18 + 12);
  const labelX = pageWidth - margin - 205;
  const valueX = pageWidth - margin - 106;
  for (const [label, value, negative = false] of rows) {
    const y = doc.y;
    const isGrandTotal = label === 'Grand total';
    if (isGrandTotal) {
      doc.moveTo(labelX, y - 3).lineTo(pageWidth - margin, y - 3)
        .lineWidth(0.8).strokeColor('#555555').stroke();
    }
    doc.font(isGrandTotal ? 'Bold' : 'Regular').fontSize(isGrandTotal ? 10 : 8)
      .text(label, labelX, y, { width: 100 });
    doc.font(isGrandTotal ? 'Bold' : 'Regular').fontSize(isGrandTotal ? 10 : 8)
      .text(`${negative ? '-' : ''}${money(value, document.currency)}`, valueX, y, {
        width: 106,
        align: 'right',
      });
    doc.y = y + 16;
  }
}

function invoiceStatus(invoice, now = new Date()) {
  if (invoice.status === 'Cancelled' || invoice.status === 'Draft') return invoice.status;
  const paid = new Decimal(String(invoice.amountPaid || 0));
  const total = new Decimal(String(invoice.grandTotal || 0));
  const due = new Decimal(String(invoice.balanceDue || 0));
  if (paid.gte(total) && total.gt(0)) return 'Paid';
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
  if (dueDate && Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate()) < today && due.gt(0)) {
    return 'Overdue';
  }
  return paid.gt(0) ? 'Partially Paid' : 'Issued';
}

function renderPaymentSummary(doc, invoice, ensurePage) {
  ensurePage(84);
  doc.moveDown(0.4);
  doc.font('Bold').fontSize(9).text('Payment summary', margin, doc.y);
  doc.y += 14;
  const rows = [
    ['Amount paid', money(invoice.amountPaid, invoice.currency)],
    ['Balance due', money(invoice.balanceDue, invoice.currency)],
    ['Payment status', invoiceStatus(invoice)],
    ['Due date', formatDate(invoice.dueDate)],
  ];
  for (const [label, value] of rows) {
    if (!value) continue;
    doc.font('Regular').fontSize(8).text(`${label}: ${value}`, margin, doc.y);
    doc.y += 13;
  }
}

function renderClosing(doc, document, company, ensurePage) {
  const terms = document.invoiceDate ? document.paymentTerms : document.validityText;
  const closingText = [
    document.closing,
    company.pdfClosingMessage,
    terms,
  ].filter(Boolean).join('\n\n');
  if (!closingText) return;
  const height = textHeight(doc, closingText, contentWidth, { fontSize: 8 }) + 12;
  ensurePage(height);
  doc.moveDown(0.8);
  doc.font('Regular').fontSize(8).text(closingText, margin, doc.y, {
    width: contentWidth,
    lineGap: 3,
  });
}

async function createPdfBuffer(document, documentType) {
  if (!fs.existsSync(regularFont) || !fs.existsSync(boldFont)) {
    throw new Error('Bundled PDF font files are missing.');
  }
  const pdf = new PDFDocument({
    size: 'A4',
    margins: { top: margin, bottom: footerHeight + margin, left: margin, right: margin },
    bufferPages: true,
    info: {
      Title: `${document.number} ${documentType}`,
      Author: document.companySnapshot?.name || 'THE CONCEPT DESIGNERS',
      Subject: `${documentType} ${document.number}`,
    },
  });
  pdf.registerFont('Regular', regularFont);
  pdf.registerFont('Bold', boldFont);

  const chunks = [];
  const output = new Promise((resolve, reject) => {
    pdf.on('data', (chunk) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });

  const company = document.companySnapshot || {};
  let tableActive = false;
  pdf.on('pageAdded', () => {
    if (tableActive) {
      pdf.y = margin;
      renderTableHeader(pdf);
    }
  });

  pdf.y = renderHeader(pdf, document, company);
  renderIntroduction(pdf, document);
  const ensurePage = (height) => {
    if (pdf.y + height <= pageHeight - footerHeight - margin) return;
    pdf.addPage();
    if (!tableActive) {
      pdf.y = renderHeader(pdf, document, company);
      renderIntroduction(pdf, document);
    }
  };

  tableActive = true;
  renderTableHeader(pdf);
  (document.items || []).forEach((item, index) => renderItem(pdf, item, index, document.currency || 'INR', ensurePage));
  renderTotals(pdf, document, ensurePage);
  if (documentType === 'invoice') renderPaymentSummary(pdf, document, ensurePage);
  tableActive = false;
  renderClosing(pdf, document, company, ensurePage);

  const pages = pdf.bufferedPageRange();
  for (let index = pages.start; index < pages.start + pages.count; index += 1) {
    pdf.switchToPage(index);
    pdf.page.margins.bottom = margin;
    const footerY = pageHeight - margin - 37;
    pdf.moveTo(margin, footerY).lineTo(pageWidth - margin, footerY)
      .lineWidth(0.5).strokeColor('#999999').stroke();
    pdf.font('Regular').fontSize(7).fillColor('#555555')
      .text('Computer-generated document', margin, footerY + 7, {
        width: contentWidth * 0.62,
        lineBreak: false,
      });
    pdf.font('Regular').fontSize(7).fillColor('#555555')
      .text(`Page ${index + 1} of ${pages.count}`, pageWidth - margin - 95, footerY + 7, {
        width: 95,
        align: 'right',
      });
    if (document.signatory) {
      pdf.font('Bold').fontSize(7).fillColor('#555555')
        .text(text(document.signatory), pageWidth - margin - 180, footerY + 19, {
          width: 180,
          align: 'right',
        });
    }
  }
  pdf.end();
  return output;
}

async function persistPdf({ document, documentType, companyId }) {
  const buffer = await createPdfBuffer(document, documentType);
  const safeNumber = text(document.number).replace(/[^A-Za-z0-9_-]+/g, '-');
  const filter = { companyId, documentType, documentId: document._id };
  const record = await DocumentFile.findOneAndUpdate(
    filter,
    {
      $inc: { version: 1 },
      $set: { generatedAt: new Date() },
      $setOnInsert: { path: 'pending' },
    },
    { upsert: true, new: true, setDefaultsOnInsert: false },
  );
  const previousPath = record.path;
  const relativePath = path.join('pdfs', String(companyId), `${safeNumber}-v${record.version}.pdf`);
  const uploadsRoot = path.resolve(__dirname, '../../uploads');
  const absolutePath = path.resolve(uploadsRoot, relativePath);
  if (!absolutePath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error('Generated PDF path is outside the uploads directory.');
  }
  await fsp.mkdir(path.dirname(absolutePath), { recursive: true });

  try {
    await fsp.writeFile(absolutePath, buffer, { flag: 'wx' });
    const publicPath = `/uploads/${relativePath.split(path.sep).join('/')}`;
    const saved = await DocumentFile.updateOne(
      { _id: record._id, version: record.version },
      { $set: { path: publicPath, generatedAt: new Date() } },
    );
    if (saved.matchedCount !== 1) throw new Error('PDF version reservation was superseded.');
  } catch (error) {
    await fsp.unlink(absolutePath).catch((cleanupError) => {
      if (cleanupError.code !== 'ENOENT') console.error('Unable to remove incomplete generated PDF:', cleanupError);
    });
    const rollback = previousPath
      ? DocumentFile.updateOne(
        { _id: record._id, version: record.version },
        { $inc: { version: -1 }, $set: { path: previousPath } },
      )
      : DocumentFile.deleteOne({ _id: record._id, version: record.version });
    await rollback.catch((rollbackError) => console.error('Unable to roll back failed PDF version:', rollbackError));
    throw error;
  }

  return { buffer, filename: `${safeNumber}.pdf`, version: record.version };
}

module.exports = { createPdfBuffer, persistPdf, money, formatDate, invoiceStatus };
