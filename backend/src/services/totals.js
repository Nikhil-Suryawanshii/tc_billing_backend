const Decimal = require('decimal.js');
const { toMoneyString } = require('../utils/money');

function asDecimal(value, label) {
  let result;
  try {
    result = new Decimal(String(value));
  } catch (error) {
    throw new TypeError(`${label} must be a valid decimal number.`, { cause: error });
  }
  if (!result.isFinite()) {
    throw new TypeError(`${label} must be a finite decimal number.`);
  }
  return result;
}

function calculateTotals(items, additionalCharges = '0') {
  if (!Array.isArray(items)) {
    throw new TypeError('Items must be an array.');
  }

  let subtotal = new Decimal(0);
  let discountTotal = new Decimal(0);
  let taxableAmount = new Decimal(0);
  let taxTotal = new Decimal(0);

  const calculatedItems = items.map((item, index) => {
    const quantity = asDecimal(item.quantity, `items[${index}].quantity`);
    const unitPrice = asDecimal(item.unitPrice, `items[${index}].unitPrice`);
    const discount = asDecimal(item.discountAmount ?? 0, `items[${index}].discountAmount`);
    const taxRate = asDecimal(item.taxRate ?? 0, `items[${index}].taxRate`);
    if (quantity.lte(0)) throw new TypeError(`items[${index}].quantity must be greater than zero.`);
    if (unitPrice.isNegative()) throw new TypeError(`items[${index}].unitPrice cannot be negative.`);
    if (discount.isNegative()) throw new TypeError(`items[${index}].discountAmount cannot be negative.`);
    if (taxRate.isNegative()) throw new TypeError(`items[${index}].taxRate cannot be negative.`);

    const lineGross = quantity.times(unitPrice);
    if (discount.gt(lineGross)) {
      throw new TypeError(`items[${index}].discountAmount cannot exceed the line value.`);
    }
    const lineSubtotal = new Decimal(toMoneyString(lineGross.minus(discount)));
    const lineTax = taxRate.gt(0)
      ? new Decimal(toMoneyString(lineSubtotal.times(taxRate).dividedBy(100)))
      : new Decimal(0);
    const lineTotal = lineSubtotal.plus(lineTax);

    subtotal = subtotal.plus(lineSubtotal);
    discountTotal = discountTotal.plus(discount);
    if (taxRate.gt(0)) taxableAmount = taxableAmount.plus(lineSubtotal);
    taxTotal = taxTotal.plus(lineTax);

    return {
      ...item,
      quantity: quantity.toString(),
      unitPrice: toMoneyString(unitPrice),
      discountAmount: toMoneyString(discount),
      taxRate: taxRate.toString(),
      lineSubtotal: toMoneyString(lineSubtotal),
      lineTotal: toMoneyString(lineTotal),
    };
  });

  const charges = asDecimal(additionalCharges, 'additionalCharges');
  if (charges.isNegative()) {
    throw new TypeError('additionalCharges cannot be negative.');
  }

  const formattedSubtotal = toMoneyString(subtotal);
  const formattedTax = toMoneyString(taxTotal);
  const formattedCharges = toMoneyString(charges);
  return {
    items: calculatedItems,
    subtotal: formattedSubtotal,
    discountTotal: toMoneyString(discountTotal),
    taxableAmount: toMoneyString(taxableAmount),
    taxTotal: formattedTax,
    additionalCharges: formattedCharges,
    grandTotal: toMoneyString(subtotal.plus(taxTotal).plus(charges)),
  };
}

module.exports = { calculateTotals };
