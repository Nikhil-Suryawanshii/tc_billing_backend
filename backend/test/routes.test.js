const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');

test('billing API paths are registered instead of falling through to API not found', async () => {
  const previousUri = process.env.MONGODB_URI;
  delete process.env.MONGODB_URI;
  const server = app.listen(0);

  try {
    const { port } = server.address();
    for (const path of [
      '/api/v1/quotations',
      '/api/v1/invoices',
      '/api/v1/payments',
      '/api/v1/categories',
      '/api/v1/products',
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      const body = await response.json();
      assert.equal(response.status, 503, `${path} should reach its route-level database guard`);
      assert.equal(body.message, 'Database connection unavailable.');
      assert.notEqual(body.message, 'API route not found.');
    }
  } finally {
    if (previousUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousUri;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
