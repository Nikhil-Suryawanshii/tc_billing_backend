export class HttpError extends Error {
  constructor(status, message, errors = null) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export function ok(res, data, message = 'OK', meta) {
  const body = { data, message };
  if (meta) body.meta = meta;
  return res.json(body);
}

export function pageQuery(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const perPage = Math.min(Math.max(parseInt(query.perPage, 10) || 15, 1), 100);
  return { page, perPage, skip: (page - 1) * perPage };
}

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
