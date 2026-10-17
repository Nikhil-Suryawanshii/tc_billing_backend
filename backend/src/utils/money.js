const Decimal = require('decimal.js');

function decimal(value) {
  try {
    const result = new Decimal(String(value));
    if (!result.isFinite()) {
      throw new Error('Value must be finite.');
    }
    return result;
  } catch (error) {
    throw new TypeError(`Invalid decimal value: ${value}`, { cause: error });
  }
}

function toMoneyString(value) {
  return decimal(value).toFixed(2, Decimal.ROUND_HALF_UP);
}

function addMoney(...values) {
  return values.reduce((total, value) => total.plus(decimal(value)), new Decimal(0))
    .toFixed(2, Decimal.ROUND_HALF_UP);
}

function multiplyMoney(amount, quantity) {
  return decimal(amount).times(decimal(quantity)).toFixed(2, Decimal.ROUND_HALF_UP);
}

module.exports = { toMoneyString, addMoney, multiplyMoney };
