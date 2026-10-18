import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { d, money } from '../lib/money.js';
import { rootDir } from '../config/paths.js';

const LEFT = 40;
const PAGE_BOTTOM = 112;
const REGULAR_FONT = '/System/Library/Fonts/Supplemental/Arial Unicode.ttf';
const BOLD_FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';
const RUPEE_FONT = '/System/Library/Fonts/SFNS.ttf';
const LETTERHEAD_LOGO = path.join(rootDir, 'assets', 'tc-logo.png');

export function writePdf({ filePath, kind, record, company }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, left: 40, right: 40, bottom: PAGE_BOTTOM },
      bufferPages: true,
    });
    if (fs.existsSync(REGULAR_FONT)) {
      doc.registerFont('Body', REGULAR_FONT);
      doc.registerFont('BodyBold', REGULAR_FONT);
    }
    if (fs.existsSync(RUPEE_FONT)) doc.registerFont('Rupee', RUPEE_FONT);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    drawDocument(doc, kind, record, company);
    addFooters(doc, kind, company, record);
    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

function addFooters(doc, kind, liveCompany, record) {
  const range = doc.bufferedPageRange();
  const company = letterheadCompany(record, liveCompany);
  const label = kind === 'invoice' ? 'Invoice' : 'Quotation';
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(index);
    drawLetterheadBand(doc);
    drawFooterDetails(doc, company, `${label}  ·  Page ${index + 1} of ${range.count}`);
  }
}

function letterheadCompany(record, liveCompany) {
  const live = liveCompany?.toJSON ? liveCompany.toJSON() : (liveCompany || {});
  return { ...(record.companySnapshot || {}), ...live };
}

function fromBottom(doc, distance) {
  return doc.page.height - distance;
}

function drawLetterheadBand(doc) {
  const width = doc.page.width;
  const y = (distance) => fromBottom(doc, distance);
  doc.save();
  doc.fillColor('#050505');
  doc.moveTo(0, y(0))
    .lineTo(width, y(0))
    .lineTo(width, y(72))
    .bezierCurveTo(464.315, y(63), 369.0709, y(44), 255.9685, y(53))
    .bezierCurveTo(148.8189, y(62), 65.48031, y(91), 0, y(68))
    .closePath()
    .fill();

  doc.fillColor('#e6ff00');
  doc.moveTo(0, y(61))
    .bezierCurveTo(83.33858, y(83), 166.6772, y(57), 267.874, y(48))
    .bezierCurveTo(398.8346, y(37), 500.0315, y(60), width, y(68))
    .lineTo(width, y(49))
    .bezierCurveTo(482.1732, y(43), 386.9291, y(27), 261.9213, y(37))
    .bezierCurveTo(148.8189, y(46), 71.43307, y(70), 0, y(47))
    .closePath()
    .fill();

  doc.strokeColor('#ffffff').lineWidth(1.6);
  doc.moveTo(0, y(62))
    .bezierCurveTo(83.33858, y(84), 166.6772, y(58), 267.874, y(49))
    .stroke();
  doc.moveTo(267.874, y(49))
    .bezierCurveTo(398.8346, y(38), 500.0315, y(61), width, y(69))
    .stroke();
  doc.restore();
}

function footerAddress(company) {
  const parts = [company.addressLine1, company.addressLine2].filter(Boolean);
  const joined = parts.join(', ').toLowerCase();
  if (!(company.country && joined.includes(String(company.country).toLowerCase()))) {
    [company.city, company.state, company.postalCode, company.country].filter(Boolean).forEach((part) => {
      if (!joined.includes(String(part).toLowerCase())) parts.push(part);
    });
  }
  return parts.join(', ');
}

function drawFooterDetails(doc, company, pageLabel) {
  const contact = [
    company.phone ? `Mobile: ${company.phone}` : '',
    company.email ? `Email: ${company.email}` : '',
  ].filter(Boolean).join('   ');
  const extra = [company.website, company.gstNumber ? `GST: ${company.gstNumber}` : ''].filter(Boolean).join('   ');
  const bank = [
    [company.bankName ? `Bank: ${company.bankName}` : '', company.bankBranch ? `Branch: ${company.bankBranch}` : ''].filter(Boolean).join('   '),
    company.bankAccountName ? `A/C Name: ${company.bankAccountName}` : '',
    [company.bankAccountNumber ? `A/C No: ${company.bankAccountNumber}` : '', company.bankIfsc ? `IFSC: ${company.bankIfsc}` : ''].filter(Boolean).join('   '),
    company.bankUpi ? `UPI: ${company.bankUpi}` : '',
  ].filter(Boolean);

  doc.font(bodyFont(doc)).fontSize(7.5).fillColor('#ffffff');
  const leftLines = [company.name, footerAddress(company), contact, extra].filter(Boolean);
  paintLines(doc, leftLines, 18, fromBottom(doc, 40), 280);
  if (bank.length) paintLines(doc, bank, 318, fromBottom(doc, 40), 260);
  doc.font(bodyFont(doc)).fontSize(7).fillColor('#111111');
  doc._fragment(pageLabel, doc.page.width - 18 - doc.widthOfString(pageLabel), fromBottom(doc, 100), {});
}

function paintLines(doc, lines, x, y, width) {
  let cursor = y;
  lines.forEach((line) => {
    wrapLine(doc, line, width).forEach((part) => {
      doc._fragment(part, x, cursor, {});
      cursor += 9;
    });
  });
}

function wrapLine(doc, text, width) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (current && doc.widthOfString(next) > width) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function drawDocument(doc, kind, record, liveCompany) {
  const company = letterheadCompany(record, liveCompany);
  const client = record.clientSnapshot || {};
  const title = record.header || (kind === 'invoice' ? 'Invoice' : 'Quotation');
  const width = doc.page.width - 80;
  const uploadedLogo = company.logoPath ? path.join(rootDir, String(company.logoPath).replace(/^\/+/, '')) : '';
  const logoPath = uploadedLogo && fs.existsSync(uploadedLogo) ? uploadedLogo : LETTERHEAD_LOGO;
  const logoY = 42;
  const logoSize = 118;
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, LEFT, logoY, { fit: [logoSize, logoSize] });
    } catch {
      // Keep the company text when the logo file cannot be drawn.
    }
  }

  const companyX = LEFT + 170;
  const companyWidth = width - 170;
  let companyY = 34;
  doc.font('Times-Bold').fontSize(29).fillColor('#111827')
    .text(title, companyX, companyY, { width: companyWidth, align: 'right' });
  companyY = doc.y + 1;
  doc.font('Times-Bold').fontSize(17).fillColor('#111827')
    .text(company.name || '', companyX, companyY, { width: companyWidth, align: 'right' });
  companyY = doc.y + 2;

  const companyAddress = [
    company.addressLine1,
    company.addressLine2 || [company.city, company.state, company.postalCode, company.country].filter(Boolean).join(', '),
    company.phone ? `Mobile: ${company.phone}` : '',
    company.email ? `Email Id: ${company.email}` : '',
    company.website || '',
  ].filter(Boolean);
  companyAddress.forEach((line) => {
    doc.font('Times-Roman').fontSize(11).fillColor('#111827')
      .text(line, companyX, companyY, { width: companyWidth, align: 'right' });
    companyY = doc.y + 1;
  });

  let y = Math.max(logoY + logoSize, companyY) + 14;
  drawRule(doc, y);
  y += 14;

  const dateValue = kind === 'invoice' ? record.invoiceDate : record.quotationDate;
  const numberLabel = kind === 'invoice' ? 'Invoice No.' : 'Quotation No.';
  const facts = [
    { label: 'Date', value: formatDay(dateValue) },
    { label: numberLabel, value: record.number || '' },
    record.poSoNumber ? { label: 'P.O. / S.O.', value: record.poSoNumber } : null,
    kind === 'invoice' && record.dueDate ? { label: 'Due date', value: formatDay(record.dueDate) } : null,
    { label: 'Grand Total', value: rupee(record.grandTotal), highlight: true },
  ].filter(Boolean);
  const factBoxHeight = 34;
  const factGap = 6;
  const factsHeight = facts.length * factBoxHeight + (facts.length - 1) * factGap;
  const clientBoxWidth = 330;
  const factBoxX = LEFT + clientBoxWidth + 15;
  const factBoxWidth = width - clientBoxWidth - 15;
  drawClientBox(doc, client, LEFT, y, clientBoxWidth, factsHeight);
  facts.forEach((fact, index) => {
    drawFactBox(doc, fact, factBoxX, y + index * (factBoxHeight + factGap), factBoxWidth, factBoxHeight);
  });
  y += factsHeight + 14;
  drawRule(doc, y);
  y += 14;

  doc.font('Times-Roman').fontSize(12).fillColor('#111827')
    .text(record.salutation || '', LEFT, y, { width });
  y = doc.y + 5;
  doc.font('Times-Roman').fontSize(12).fillColor('#111827')
    .text(record.message || '', LEFT, y, { width });
  y = doc.y + 5;
  if (record.closing) {
    doc.font('Times-Roman').fontSize(12).fillColor('#111827');
    doc.text(record.closing, LEFT, y, { width });
    y = doc.y + 10;
  }

  y = drawTable(doc, record, y);
  y = drawTotals(doc, kind, record, y);

  y = ensureSpace(doc, y, 90);
  doc.font(bodyFont(doc)).fontSize(11).fillColor('#222222');
  if (record.terms) {
    doc.text(record.terms, LEFT, y, { width });
    y = doc.y + 6;
  }
  const terms = kind === 'invoice' ? record.paymentTerms : record.validityText;
  if (terms) {
    doc.text(terms, LEFT, y, { width });
    y = doc.y + 10;
  }
  drawSignatureBlock(doc, company, record, y);
}

function drawClientBox(doc, client, x, y, width, height) {
  doc.save();
  doc.roundedRect(x, y, width, height, 13).fillAndStroke('#ffffff', '#aeb5c0');
  doc.restore();
  const padding = 12;
  let cursor = y + 11;
  doc.font('Times-Bold').fontSize(13).fillColor('#111827').text('To', x + padding, cursor);
  cursor = doc.y + 2;
  if (client.name) {
    doc.font('Times-Bold').fontSize(12).fillColor('#111827')
      .text(client.name, x + padding, cursor, { width: width - padding * 2 });
    cursor = doc.y + 2;
  }
  const address = [
    client.billingAddress || client.addressLine1,
    client.addressLine2 || [client.city, client.state, client.postalCode, client.country].filter(Boolean).join(', '),
    client.gstNumber ? `GST: ${client.gstNumber}` : '',
  ].filter(Boolean);
  address.forEach((line) => {
    doc.font('Times-Roman').fontSize(11).fillColor('#111827')
      .text(line, x + padding, cursor, { width: width - padding * 2 });
    cursor = doc.y + 1;
  });
}

function drawFactBox(doc, fact, x, y, width, height) {
  const color = fact.highlight ? '#168cae' : '#111827';
  doc.save();
  doc.roundedRect(x, y, width, height, 11).fillAndStroke('#f5f6f8', '#aeb5c0');
  doc.restore();
  doc.font('Times-Roman').fontSize(10).fillColor(color)
    .text(`${fact.label}:`, x + 8, y + 11, { width: width * 0.44, lineBreak: false });
  const valueY = y + 10;
  const valueSize = fact.highlight ? 11 : 12;
  if (fact.highlight && fact.value.includes('₹')) {
    const amount = fact.value.replace(/^₹\s*/, '');
    const right = x + width - 8;
    doc.font('Helvetica-Bold').fontSize(valueSize).fillColor(color);
    const amountWidth = doc.widthOfString(amount);
    doc.text(amount, right - amountWidth, valueY, { lineBreak: false });
    doc.font(rupeeFont(doc)).fontSize(valueSize).fillColor(color);
    const symbolWidth = doc.widthOfString('₹');
    // SFNS and Helvetica use different ascender metrics. Raise the rupee glyph
    // slightly so it visually shares the bold amount's baseline in the PDF.
    doc.text('₹', right - amountWidth - symbolWidth - 3, valueY - 2, { lineBreak: false });
    return;
  }
  doc.font('Times-Bold').fontSize(valueSize).fillColor(color)
    .text(fact.value, x + width * 0.5, valueY, { width: width * 0.45 - 8, align: 'right', lineBreak: false });
}

function drawRule(doc, y) {
  doc.save();
  doc.strokeColor('#263241').lineWidth(0.8).moveTo(LEFT, y).lineTo(doc.page.width - LEFT, y).stroke();
  doc.restore();
}

function drawTable(doc, record, startY) {
  const columns = tableColumns();
  let y = ensureSpace(doc, startY, 36);
  y = headerRow(doc, columns, y);

  let serial = 0;
  groupItems(record.items).forEach((group) => {
    if (group.heading) {
      y = ensureSpace(doc, y, 22);
      if (y === 48) y = headerRow(doc, columns, y);
      doc.rect(LEFT, y, tableWidth(columns), 18).fill('#f3f1ee');
      doc.fillColor('#111111').font(boldFont(doc)).fontSize(9).text(`**** ${group.heading}`, LEFT + 4, y + 4, {
        width: tableWidth(columns) - 8,
      });
      y += 18;
    }
    group.items.forEach((item) => {
      serial += 1;
      const detail = item.name || itemDetails(item);
      doc.font(bodyFont(doc)).fontSize(9);
      const detailHeight = doc.heightOfString(detail, { width: columns[1].width - 8 });
      const rowHeight = Math.max(22, detailHeight + 10);
      if (y + rowHeight > doc.page.height - PAGE_BOTTOM) {
        doc.addPage();
        y = headerRow(doc, columns, 48);
      }
      doc.rect(LEFT, y, tableWidth(columns), rowHeight).strokeColor('#d0d0d0').stroke();
      const values = [
        `${serial}.`,
        detail,
        displayQuantity(item.quantity),
        rupee(item.unitPrice),
        rupee(item.lineTotal),
      ];
      let x = LEFT;
      values.forEach((value, columnIndex) => {
        doc.font(value.includes('₹') ? rupeeFont(doc) : bodyFont(doc)).fontSize(9).fillColor('#111111').text(value, x + 4, y + 5, {
          width: columns[columnIndex].width - 8,
          align: columns[columnIndex].align,
        });
        x += columns[columnIndex].width;
      });
      y += rowHeight;
    });
  });

  return y + 14;
}

function groupItems(items = []) {
  const groups = [];
  items.forEach((item) => {
    const heading = item.sectionHeading || '';
    const last = groups[groups.length - 1];
    if (!last || last.heading !== heading) groups.push({ heading, items: [item] });
    else last.items.push(item);
  });
  return groups;
}

function drawTotals(doc, kind, record, startY) {
  const rows = [['Subtotal', rupee(record.subtotal)]];
  if (d(record.discountTotal).gt(0)) rows.push(['Discount', rupee(record.discountTotal)]);
  if (d(record.taxTotal).gt(0)) {
    rows.push(['Taxable amount', rupee(record.taxableAmount)]);
    rows.push(['Tax', rupee(record.taxTotal)]);
  }
  if (d(record.additionalCharges).gt(0)) rows.push(['Additional charges', rupee(record.additionalCharges)]);
  rows.push(['Total', rupee(record.grandTotal)]);
  if (kind === 'invoice') {
    rows.push(['Amount paid', rupee(record.amountPaid)]);
    if (record.dueDate) rows.push(['Due date', formatDay(record.dueDate)]);
    rows.push(['Balance due', rupee(record.balanceDue)]);
  }

  const panelWidth = 300;
  const panelX = doc.page.width - LEFT - panelWidth;
  const panelPadding = 14;
  const rowHeights = rows.map(([label]) => (label === 'Total' || label === 'Balance due' ? 22 : 16));
  const dividerCount = rows.filter(([label]) => label === 'Total' || label === 'Balance due').length;
  const panelHeight = 22 + rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0) + dividerCount * 6;
  let y = startY;
  if (y + panelHeight > doc.page.height - PAGE_BOTTOM) {
    doc.addPage();
    y = 48;
  }

  doc.save();
  doc.roundedRect(panelX, y, panelWidth, panelHeight, 15).fillAndStroke('#ffffff', '#aeb5c0');
  doc.restore();

  let cursor = y + 12;
  rows.forEach(([label, value], index) => {
    const major = label === 'Total' || label === 'Balance due';
    if (major) {
      doc.save();
      doc.strokeColor('#263241').lineWidth(0.8)
        .moveTo(panelX + panelPadding, cursor + 2)
        .lineTo(panelX + panelWidth - panelPadding, cursor + 2)
        .stroke();
      doc.restore();
      cursor += 5;
    }
    const color = major ? '#168cae' : '#111827';
    doc.font(major ? 'Helvetica-Bold' : 'Times-Roman')
      .fontSize(major ? 12 : 10).fillColor(major && label === 'Total' ? '#111827' : color)
      .text(label, panelX + panelPadding, cursor, { width: 128, lineBreak: false });
    const valueX = panelX + 138;
    doc.font(value.includes('₹') ? rupeeFont(doc) : (major ? 'Helvetica-Bold' : 'Times-Roman'))
      .fontSize(major ? 12 : 10).fillColor(color)
      .text(value, valueX, cursor, { width: panelWidth - (valueX - panelX) - panelPadding, align: 'right', lineBreak: false });
    cursor += rowHeights[index];
  });
  return y + panelHeight + 12;
}

function drawSignatureBlock(doc, company, record, startY) {
  const blockWidth = 180;
  const x = doc.page.width - LEFT - blockWidth;
  const y = ensureSpace(doc, startY, 88);
  const signaturePath = company.signaturePath
    ? path.join(rootDir, String(company.signaturePath).replace(/^\/+/, ''))
    : '';

  if (signaturePath && fs.existsSync(signaturePath)) {
    try {
      doc.image(signaturePath, x + 30, y, { fit: [120, 42] });
    } catch {
      // Keep the signatory details if the saved signature image cannot be drawn.
    }
  }

  const lineY = y + 47;
  doc.save();
  doc.strokeColor('#263241').lineWidth(0.8).moveTo(x + 8, lineY).lineTo(x + blockWidth, lineY).stroke();
  doc.restore();
  const signatory = record.signatory || company.defaultSignatory || company.name || '';
  doc.font('Times-Bold').fontSize(11).fillColor('#111827')
    .text(signatory, x + 8, lineY + 5, { width: blockWidth - 8, align: 'right' });
  doc.font('Times-Roman').fontSize(9).fillColor('#4b5563')
    .text('Authorised Signatory', x + 8, doc.y + 1, { width: blockWidth - 8, align: 'right' });
}

function headerRow(doc, columns, y) {
  const width = tableWidth(columns);
  doc.rect(LEFT, y, width, 18).fill('#1f1f1f');
  let x = LEFT;
  columns.forEach((column) => {
    doc.fillColor('#ffffff').font(boldFont(doc)).fontSize(8).text(column.label, x + 4, y + 5, {
      width: column.width - 8,
      align: column.align,
    });
    x += column.width;
  });
  return y + 18;
}

function tableColumns() {
  return [
    { label: 'S.No.', width: 42, align: 'left' },
    { label: 'Item Details', width: 248, align: 'left' },
    { label: 'Quantity', width: 55, align: 'right' },
    { label: 'Price', width: 82, align: 'right' },
    { label: 'Total', width: 88, align: 'right' },
  ];
}

function tableWidth(columns) {
  return columns.reduce((sum, column) => sum + column.width, 0);
}

function itemDetails(item) {
  const heading = item.sectionHeading || '';
  const lines = [];
  if (heading) lines.push(`**** ${heading}`);
  else if (item.name) lines.push(item.name);
  if (item.name && heading && item.name !== heading) lines.push(item.name);
  if (item.description) lines.push(item.description);
  return lines.join('\n');
}

function displayQuantity(value) {
  const amount = d(value || 0);
  return amount.isInteger() ? amount.toFixed(0) : money(amount);
}

function centerX(doc, text) {
  return (doc.page.width - doc.widthOfString(text)) / 2;
}

function bodyFont(doc) {
  return doc._registeredFonts?.Body ? 'Body' : 'Helvetica';
}

function boldFont(doc) {
  return doc._registeredFonts?.BodyBold ? 'BodyBold' : 'Helvetica-Bold';
}

function rupee(value) {
  return `₹ ${money(value)}`;
}

function rupeeFont(doc) {
  return doc._registeredFonts?.Rupee ? 'Rupee' : bodyFont(doc);
}

function formatDay(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function ensureSpace(doc, y, needed) {
  if (y + needed <= doc.page.height - PAGE_BOTTOM) return y;
  doc.addPage();
  return 48;
}
