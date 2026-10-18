import { HttpError } from './http.js';

export function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function parseDate(value, field, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(422, 'Validation failed', { [field]: 'Required' });
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(422, 'Validation failed', { [field]: 'Invalid date' });
  }
  return date;
}

export function endOfDay(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
