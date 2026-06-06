import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/server.js';

let server;
let baseUrl;
let adminToken;

const testProduct = {
  id: 'test-admin-product',
  name: 'Test Admin Product',
  description: 'A temporary product created by the API test suite.',
  category: 'Test Cakes',
  price: 42,
  image: 'images/cake6.jpg',
  flavours: ['Vanilla'],
  size: '6 inch',
  featured: false
};

function listen(app) {
  return new Promise(resolve => {
    app.listen(0, () => {
      const { port } = app.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

describe('Honore Cakes API', () => {
  before(async () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'super-secret-password';
    server = createApp();
    baseUrl = await listen(server);
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  it('returns health status', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
  });

  it('lists cake catalog items', async () => {
    const response = await fetch(`${baseUrl}/api/cakes`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.cakes));
    assert.ok(body.cakes.length >= 3);
  });

  it('filters featured cake catalog items', async () => {
    const response = await fetch(`${baseUrl}/api/cakes?featured=true`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok(body.cakes.every(cake => cake.featured));
  });

  it('returns a single cake by id', async () => {
    const response = await fetch(`${baseUrl}/api/cakes/classic-vanilla`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.cake.id, 'classic-vanilla');
  });

  it('lists products', async () => {
    const response = await fetch(`${baseUrl}/api/products`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.products));
    assert.ok(body.products.length >= 12);
    assert.ok(body.products.every(product => product.image.startsWith('images/')));
  });

  it('returns a single product by id', async () => {
    const response = await fetch(`${baseUrl}/api/products/signature-chocolate-cake`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.product.id, 'signature-chocolate-cake');
  });

  it('logs in an admin with environment credentials', async () => {
    const response = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(typeof body.token, 'string');
    adminToken = body.token;
  });

  it('rejects product creation without admin authentication', async () => {
    const response = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testProduct)
    });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.match(body.error, /Admin authentication required/);
  });

  it('creates, updates, and deletes a product with admin authentication', async () => {
    const createResponse = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(testProduct)
    });
    const created = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.equal(created.product.id, testProduct.id);

    const updateResponse = await fetch(`${baseUrl}/api/products/${testProduct.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ ...testProduct, price: 50, featured: true })
    });
    const updated = await updateResponse.json();

    assert.equal(updateResponse.status, 200);
    assert.equal(updated.product.price, 50);
    assert.equal(updated.product.featured, true);

    const deleteResponse = await fetch(`${baseUrl}/api/products/${testProduct.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const deleted = await deleteResponse.json();

    assert.equal(deleteResponse.status, 200);
    assert.equal(deleted.message, 'Product deleted');
  });

  it('validates inquiries', async () => {
    const response = await fetch(`${baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ada', email: 'ada@example.com', message: 'I need a cake.' })
    });
    const body = await response.json();

    assert.equal(response.status, 202);
    assert.equal(body.message, 'Inquiry received');
  });

  it('rejects incomplete inquiries', async () => {
    const response = await fetch(`${baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ada' })
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /Missing required fields/);
  });
});
