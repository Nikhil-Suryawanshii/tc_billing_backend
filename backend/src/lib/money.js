import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export function d(value) {
  if (value === undefined || value === null || value === '') return new Decimal(0);
  return new Decimal(value);
}

export function money(value) {
  return d(value).toDecimalPlaces(2).toFixed(2);
}

export function formatMoney(value, currency = 'INR') {
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(money(value)));

  if (!currency || currency === 'INR') return `₹${formatted}`;
  return `${currency} ${formatted}`;
}
