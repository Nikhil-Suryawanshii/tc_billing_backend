const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const PDFDocument = require('pdfkit');
const Decimal = require('decimal.js');
const { DocumentFile } = require('../models');
const { calculateInvoiceStatus } = require('./invoices');

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 42;
const bottomReserved = 76;
const contentWidth = pageWidth - (2 * margin);
const tableColumns = [
  { key: 'serial', title: 'S.No.', width: 42, align: 'left' },
  { key: 'details', title: 'Item Details', width: 250, align: 'left' },
  { key: 'quantity', title: 'Quantity', width: 68, align: 'right' },
  { key: 'price', title: 'Price', width: 72, align: 'right' },
  { key: 'total', title: 'Total', width: 79, align: 'right' },
];
const normalFont = path.join(
  path.dirname(require.resolve('dejavu-fonts-ttf/package.json')),
  'ttf/DejaVuSans.ttf',
);
const boldFont = path.join(
  path.dirname(require.resolve('dejavu-fonts-ttf/package.json')),
  'ttf/DejaVuSans-Bold.ttf',
);

function money(value, currency = 'INR') {
  const amount = new Decimal(String(value || 0)).toFixed(2, Decimal.ROUND_HALF_UP);
  return currency === 'INR' ? `₹ ${amount}` : `${currency} ${amount}`;
}

function date(value) {
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

function safeLocalUpload(uploadPath) {
  if (typeof uploadPath !== 'string' || !uploadPath.startsWith('/uploads/')) return null;
  const relative = uploadPath.slice('/uploads/'.length);
  if (!relative || relative.split('/').some((part) => part === '..' || part === '.')) return null;
  const uploadsRoot = path.resolve(__dirname, '../../uploads');
  const resolved = path.resolve(uploadsRoot, relative);
  return resolved.startsWith(`${uploadsRoot}${path.sep}`) ? resolved : null;
}

function measure(doc, value, width, options = {}) {
  return doc.heightOfString(text(value), {
    width,
    font: options.font || 'Regular',
    fontSize: options.fontSize || 9,
    lineGap: options.lineGap || 2,
  });
}

function renderHeader(doc, document, company) {
  const title = text(document.header || (document.invoiceDate ? 'Invoice' : 'Quotation'));
  const facts = [
    ['Number', document.number],
    [document.invoiceDate ? 'Invoice date' : 'Date', date(document.invoiceDate || document.quotationDate)],
    ...(document.poSoNumber ? [['P.O. / S.O.', document.poSoNumber]] : []),
  ];
  let top = margin;
  const logo = safeLocalUpload(company.logoPath);
  if (logo && fs.existsSync(logo)) {
    doc.image(logo, margin, top, { fit: [112, 66] });
  }
  doc.font('Bold').fontSize(18).text(title, margin + 122, top, {
    width: contentWidth - 122,
    align: 'right',
  });
  top += 25;
  doc.font('Bold').fontSize(11).text(text(company.name), margin + 122, top, {
    width: contentWidth - 122,
    align: 'right',
  });
  top += 17;
  const companyAddress = [
    company.addressLine1,
    company.addressLine2,
    [company.city, company.state, company.postalCode].filter(Boolean).join(', '),
    company.country,
  ].filter(Boolean).join('\n');
  if (companyAddress) {
    doc.font('Regular').fontSize(8).text(companyAddress, margin + 122, top, {
      width: contentWidth - 122,
      align: 'right',
    });
    top += measure(doc, companyAddress, contentWidth - 122, { fontSize: 8 }) + 3;
  }
  const contacts = [company.phone, company.email, company.website].filter(Boolean).join('  |  ');
  if (contacts) {
    doc.font('Regular').fontSize(8).text(contacts, margin + 122, top, {
      width: contentWidth - 122,
      align: 'right',
    });
  }
  const headerBottom = Math.max(top + 20, margin + 80);
  doc.moveTo(margin, headerBottom).lineTo(pageWidth - margin, headerBottom)
    .lineWidth(0.7).strokeColor('#777777').stroke();
  top = headerBottom + 15;

  const customerAddress = [
    document.clientSnapshot?.billingAddress || document.clientSnapshot?.addressLine1,
    document.clientSnapshot?.shippingAddress,
    [
      document.clientSnapshot?.city,
      document.clientSnapshot?.state,
      document.clientSnapshot?.postalCode,
    ].filter(Boolean).join(', '),
    document.clientSnapshot?.country,
  ].filter(Boolean).join('\n');
  doc.font('Bold').fontSize(9).text('To', margin, top);
  doc.font('Bold').fontSize(10).text(text(document.clientSnapshot?.name), margin, top + 14);
  let customerY = top + 28;
  if (customerAddress) {
    doc.font('Regular').fontSize(8).text(customerAddress, margin, customerY, {
      width: 245,
      lineGap: 2,
    });
    customerY += measure(doc, customerAddress, 245, { fontSize: 8 }) + 3;
  }
  if (document.clientSnapshot?.gstNumber) {
    doc.font('Regular').fontSize(8).text(`GST: ${document.clientSnapshot.gstNumber}`, margin, customerY);
    customerY += 12;
  }

  const factsX = margin + 290;
  let factsY = top;
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
  return Math.max(customerY, factsY + 20) + 13;
}

function renderIntroduction(doc, document, y) {
  for (const [field, style] of [
    ['salutation', 'Bold'],
    ['message', 'Regular'],
  ]) {
    if (!document[field]) continue;
    doc.font(style).fontSize(9).text(text(document[field]), margin, y, {
      width: contentWidth,
      lineGap: 3,
    });
    y = doc.y + 7;
  }
  return y;
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
        align: column.align,
      });
    x += column.width;
  }
  doc.y = y + 28;
}

function drawItem(doc, item, index, currency, ensurePage) {
  const detailsWidth = tableColumns[1].width - 10;
  const detailParts = [];
  if (item.sectionHeading) detailParts.push({ value: text(item.sectionHeading), font: 'Bold', size: 9 });
  if (item.name) detailParts.push({ value: text(item.name), font: 'Bold', size: 9 });
  if (item.description) detailParts.push({ value: text(item.description), font: 'Regular', size: 8 });
  const detailHeight = detailParts.reduce(
    (height, part) => height + measure(doc, part.value, detailsWidth, { font: part.font, fontSize: part.size }) + 3,
    0,
  );
  const rowHeight = Math.max(detailHeight, 20);
  ensurePage(rowHeight + 8);
  const startY = doc.y;
  let x = margin;
  const values = [
    { value: String(index + 1), align: 'left', width: tableColumns[0].width },
    { value: '', align: 'left', width: tableColumns[1].width },
    { value: text(item.quantity), align: 'right', width: tableColumns[2].width },
    { value: money(item.unitPrice, currency), align: 'right', width: tableColumns[3].width },
    { value: money(item.lineTotal, currency), align: 'right', width: tableColumns[4].width },
  ];
  values.forEach((cell, cellIndex) => {
    if (cellIndex !== 1) {
      doc.font(cellIndex === 4 ? 'Bold' : 'Regular').fontSize(8).fillColor('#111111')
        .text(cell.value, x + 4, startY + 2, {
          width: cell.width - 8,
          align: cell.align,
        });
    }
    x += cell.width;
  });
  let detailsY = startY + 2;
  const detailsX = margin + tableColumns[0].width + 4;
  for (const part of detailParts) {
    doc.font(part.font).fontSize(part.size).fillColor('#111111')
      .text(part.value, detailsX, detailsY, {
        width: detailsWidth,
        lineGap: 2,
      });
    detailsY = doc.y + 3;
  }
  doc.y = Math.max(startY + rowHeight + 4, detailsY + 1);
  doc.moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y)
    .lineWidth(0.35).strokeColor('#cccccc').stroke();
  doc.y += 7;
}

function renderTotals(doc, document, ensurePage) {
  const rows = [
    ['Subtotal', document.subtotal],
    ...(Number(document.discountTotal) ? [['Discount', document.discountTotal, true]] : []),
    ...(Number(document.taxTotal) ? [['Tax', document.taxTotal]] : []),
    ...(Number(document.additionalCharges) ? [['Additional charges', document.additionalCharges]] : []),
    ['Grand total', document.grandTotal],
  ];
  ensurePage(rows.length * 17 + 12);
  const labelX = pageWidth - margin - 205;
  const valueX = pageWidth - margin - 106;
  for (const [label, value, negative = false] of rows) {
    const rowY = doc.y;
    const isTotal = label === 'Grand total';
    if (isTotal) {
      doc.moveTo(labelX, rowY - 3).lineTo(pageWidth - margin, rowY - 3)
        .lineWidth(0.8).strokeColor('#555555').stroke();
    }
    doc.font(isTotal ? 'Bold' : 'Regular').fontSize(isTotal ? 10 : 8)
      .text(label, labelX, rowY, { width: 100 });
    doc.font(isTotal ? 'Bold' : 'Regular').fontSize(isTotal ? 10 : 8)
      .text(`${negative ? '-' : ''}${money(value, document.currency)}`, valueX, rowY, {
        width: 106,
        align: 'right',
      });
    doc.y = rowY + 16;
  }
}

function renderInvoicePaymentSummary(doc, invoice, ensurePage) {
  ensurePage(66);
  doc.moveDown(0.4);
  doc.font('Bold').fontSize(9).text('Payment summary', margin, doc.y);
  doc.y += 14;
  const status = calculateInvoiceStatus(invoice);
  const rows = [
    ['Amount paid', money(invoice.amountPaid, invoice.currency)],
    ['Balance due', money(invoice.balanceDue, invoice.currency)],
    ['Payment status', status],
    ['Due date', date(invoice.dueDate)],
  ];
  for (const [label, value] of rows) {
    if (!value) continue;
    doc.font('Regular').fontSize(8).text(`${label}: ${value}`, margin, doc.y);
    doc.y += 13;
  }
}

function renderClosing(doc, document, company, ensurePage) {
  const closing = [
    document.closing,
    document.signatory,
  ].filter(Boolean).join('\n');
  const terms = document.invoiceDate ? document.paymentTerms : document.validityText;
  const footerText = [
    company.pdfClosingMessage,
    terms,
    closing,
  ].filter(Boolean).join('\n\n');
  if (!footerText) return;
  const height = measure(doc, footerText, contentWidth, { fontSize: 8 }) + 12;
  ensurePage(height);
  doc.moveDown(0.8);
  doc.font('Regular').fontSize(8).text(footerText, margin, doc.y, {
    width: contentWidth,
    lineGap: 3,
  });
}

async function createPdfBuffer(document, documentType) {
  if (!fs.existsSync(normalFont) || !fs.existsSync(boldFont)) {
    throw new Error('Bundled PDF font files are missing.');
  }
  const pdf = new PDFDocument({
    size: 'A4',
    margins: { top: margin, bottom: margin, left: margin, right: margin },
    bufferPages: true,
    info: {
      Title: `${document.number} ${documentType}`,
      Author: document.companySnapshot?.name || 'THE CONCEPT DESIGNERS',
      Subject: `${documentType} ${document.number}`,
    },
  });
  pdf.registerFont('Regular', normalFont);
  pdf.registerFont('Bold', boldFont);

  const chunks = [];
  const completed = new Promise((resolve, reject) => {
    pdf.on('data', (chunk) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });

  const company = document.companySnapshot || {};
  const previousPageAdded = () => {
    if (tableActive) {
      pdf.y = margin;
      renderTableHeader(pdf);
    }
  };
  let tableActive = false;
  pdf.on('pageAdded', previousPageAdded);

  pdf.y = renderHeader(pdf, document, company);
  pdf.y = renderIntroduction(pdf, document, pdf.y);
  const ensurePage = (height) => {
    if (pdf.y + height <= pageHeight - bottomReserved) return;
    pdf.addPage();
    if (!tableActive) {
      pdf.y = renderHeader(pdf, document, company);
      pdf.y = renderIntroduction(pdf, document, pdf.y);
    }
  };
  tableActive = true;
  renderTableHeader(pdf);
  for (const [index, item] of document.items.entries()) {
    drawItem(pdf, item, index, document.currency || 'INR', ensurePage);
  }
  renderTotals(pdf, document, ensurePage);
  if (documentType === 'invoice') renderInvoicePaymentSummary(pdf, document, ensurePage);
  tableActive = false;
  renderClosing(pdf, document, company, ensurePage);

  const pageRange = pdf.bufferedPageRange();
  for (let index = pageRange.start; index < pageRange.start + pageRange.count; index += 1) {
    pdf.switchToPage(index);
    const footerY = pageHeight - margin - 34;
    pdf.moveTo(margin, footerY).lineTo(pageWidth - margin, footerY)
      .lineWidth(0.5).strokeColor('#999999').stroke();
    pdf.font('Regular').fontSize(7).fillColor('#555555')
      .text(text(company.pdfClosingMessage), margin, footerY + 6, {
        width: contentWidth * 0.62,
        lineBreak: false,
      });
    pdf.font('Regular').fontSize(7).fillColor('#555555')
      .text('Computer-generated document', margin, footerY + 18, {
        width: contentWidth * 0.62,
        lineBreak: false,
      });
    pdf.font('Regular').fontSize(7).fillColor('#555555')
      .text(`Page ${index + 1} of ${pageRange.count}`, pageWidth - margin - 95, footerY + 8, {
        width: 95,
        align: 'right',
      });
    if (document.signatory) {
      pdf.font('Bold').fontSize(7).fillColor('#555555')
        .text(text(document.signatory), pageWidth - margin - 180, footerY + 20, {
          width: 180,
          align: 'right',
        });
    }
  }
  pdf.end();
  return completed;
}

async function persistPdf({ document, documentType, companyId }) {
  const output = await createPdfBuffer(document, documentType);
  const safeNumber = document.number.replace(/[^A-Za-z0-9_-]+/g, '-');
  const record = await DocumentFile.findOneAndUpdate(
    { companyId, documentType, documentId: document._id },
    {
      $inc: { version: 1 },
      $set: { generatedAt: new Date() },
    },
    { upsert: true, new: true, setDefaultsOnInsert: false },
  );
  const previousPath = record.path;
  const relativePath = path.join(
    'pdfs',
    String(companyId),
    `${safeNumber}-v${record.version}.pdf`,
  );
  const uploadsDirectory = path.resolve(__dirname, '../../uploads');
  const filePath = path.join(uploadsDirectory, relativePath);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fsp.writeFile(filePath, output, { flag: 'wx' });
    const publicPath = `/uploads/${relativePath.split(path.sep).join('/')}`;
    await DocumentFile.updateOne(
      { _id: record._id, version: record.version },
      { $set: { path: publicPath, generatedAt: new Date() } },
    );
  } catch (error) {
    await fsp.unlink(filePath).catch((cleanupError) => {
      if (cleanupError.code !== 'ENOENT') {
        console.error('Unable to remove incomplete generated PDF:', cleanupError);
      }
    });
    const rollback = previousPath
      ? DocumentFile.updateOne(
        { _id: record._id, version: record.version },
        { $inc: { version: -1 }, $set: { path: previousPath } },
      )
      : DocumentFile.deleteOne({ _id: record._id, version: record.version });
    await rollback.catch((rollbackError) => {
      console.error('Unable to roll back failed PDF version reservation:', rollbackError);
    });
    throw error;
  }
  return { buffer: output, filename: `${safeNumber}.pdf`, version: record.version };
}

module.exports = { createPdfBuffer, persistPdf, money, date };
