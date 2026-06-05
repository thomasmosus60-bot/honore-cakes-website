import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/server.js';

let server;
let baseUrl;

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
