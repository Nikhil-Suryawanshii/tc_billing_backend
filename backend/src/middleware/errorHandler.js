import { HttpError } from '../lib/http.js';

export function errorHandler(error, _req, res, _next) {
  if (error?.name === 'CastError') {
    return res.status(404).json({ data: null, message: 'Not found', errors: {} });
  }
  if (error?.code === 11000) {
    return res.status(422).json({
      data: null,
      message: 'That value is already in use',
      errors: { duplicate: 'That value is already in use' },
    });
  }
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({
    data: null,
    message: status >= 500 ? 'Something went wrong' : error.message,
    errors: error.errors || {},
  });
}

export function notFound(_req, _res, next) {
  next(new HttpError(404, 'Not found'));
}
