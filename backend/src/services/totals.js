import mongoose from 'mongoose';
import { d, money } from '../lib/money.js';
import { HttpError } from '../lib/http.js';

function refId(value) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
  return value;
}

function readAmount(value, field) {
  try {
    const amount = d(value ?? 0);
    if (!amount.isFinite()) throw new Error('invalid');
    return amount;
  } catch {
    throw new HttpError(422, 'Validation failed', { [field]: 'Enter a valid amount' });
  }
}

export function priceItem(raw, index) {
  const name = String(raw?.name || '').trim();
  if (!name) {
    throw new HttpError(422, 'Validation failed', { [`items.${index}.name`]: 'Item name is required' });
  }

  const quantity = readAmount(raw.quantity, `items.${index}.quantity`);
  const unitPrice = readAmount(raw.unitPrice, `items.${index}.unitPrice`);
  const discountAmount = readAmount(raw.discountAmount, `items.${index}.discountAmount`);
  const taxRate = readAmount(raw.taxRate, `items.${index}.taxRate`);
  const gross = quantity.times(unitPrice);

  if (quantity.lte(0)) {
    throw new HttpError(422, 'Validation failed', { [`items.${index}.quantity`]: 'Quantity must be greater than zero' });
  }
  if (unitPrice.lt(0) || discountAmount.lt(0) || taxRate.lt(0)) {
    throw new HttpError(422, 'Validation failed', { [`items.${index}.unitPrice`]: 'Amounts cannot be negative' });
  }
  if (discountAmount.gt(gross)) {
    throw new HttpError(422, 'Validation failed', { [`items.${index}.discountAmount`]: 'Discount cannot exceed the line amount' });
  }

  const lineSubtotal = gross.minus(discountAmount);
  const lineTax = taxRate.gt(0) ? lineSubtotal.times(taxRate).dividedBy(100) : d(0);
  const lineTotal = lineSubtotal.plus(lineTax);

  return {
    name,
    description: String(raw.description || ''),
    sectionHeading: String(raw.sectionHeading || ''),
    productId: refId(raw.productId),
    categoryId: refId(raw.categoryId),
    quantity: money(quantity),
    unit: String(raw.unit || ''),
    unitPrice: money(unitPrice),
    discountAmount: money(discountAmount),
    taxRate: money(taxRate),
    lineSubtotal: money(lineSubtotal),
    lineTax: money(lineTax),
    lineTotal: money(lineTotal),
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : index,
  };
}

export function priceDocument(rawItems, additionalCharges = 0) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new HttpError(422, 'Validation failed', { items: 'Add at least one item' });
  }

  const items = rawItems.map(priceItem);
  const subtotal = items.reduce((sum, item) => sum.plus(item.lineSubtotal), d(0));
  const discountTotal = items.reduce((sum, item) => sum.plus(item.discountAmount), d(0));
  const taxableAmount = items.reduce(
    (sum, item) => (d(item.taxRate).gt(0) ? sum.plus(item.lineSubtotal) : sum),
    d(0)
  );
  const taxTotal = items.reduce((sum, item) => sum.plus(item.lineTax), d(0));
  const charges = readAmount(additionalCharges, 'additionalCharges');
  if (charges.lt(0)) {
    throw new HttpError(422, 'Validation failed', { additionalCharges: 'Additional charges cannot be negative' });
  }
  const grandTotal = subtotal.plus(taxTotal).plus(charges);

  return {
    items: items.map(({ lineTax, ...item }) => item),
    subtotal: money(subtotal),
    discountTotal: money(discountTotal),
    taxableAmount: money(taxableAmount),
    taxTotal: money(taxTotal),
    additionalCharges: money(charges),
    grandTotal: money(grandTotal),
  };
}
