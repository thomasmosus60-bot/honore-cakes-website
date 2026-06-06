import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, '..', '.env');

function loadLocalEnv() {
  if (!existsSync(ENV_PATH)) {
    return;
  }

  const lines = readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').trim();

    if (!process.env[key]) {
      process.env[key] = value.replace(/^["']|["']$/g, '');
    }
  }
}

loadLocalEnv();

const DEFAULT_PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const CAKES_DATA_PATH = join(__dirname, 'data', 'cakes.json');
const PRODUCTS_DATA_PATH = join(__dirname, 'data', 'products.json');
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN ?? 'https://honorecake.netlify.app';

async function readJsonFile(path) {
  const file = await readFile(path, 'utf8');
  return JSON.parse(file);
}

async function writeJsonFile(path, data) {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

async function loadCakes() {
  return readJsonFile(CAKES_DATA_PATH);
}

async function loadProducts() {
  return readJsonFile(PRODUCTS_DATA_PATH);
}

async function saveProducts(products) {
  await writeJsonFile(PRODUCTS_DATA_PATH, products);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);

  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(body);
}

function notFound(res) {
  sendJson(res, 404, { error: 'Not found' });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', chunk => {
      body += chunk;

      if (body.length > 1_000_000) {
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function validateInquiry(inquiry) {
  const requiredFields = ['name', 'email', 'message'];
  const missing = requiredFields.filter(field => !String(inquiry[field] ?? '').trim());

  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(', ')}`;
  }

  if (!String(inquiry.email).includes('@')) {
    return 'Email must be valid';
  }

  return null;
}

function validateProduct(product) {
  const requiredFields = ['name', 'description', 'category', 'price', 'image', 'flavours', 'size', 'featured'];
  const missing = requiredFields.filter(field => product[field] === undefined || product[field] === null || product[field] === '');

  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(', ')}`;
  }

  if (Number.isNaN(Number(product.price)) || Number(product.price) < 0) {
    return 'Price must be a valid positive number';
  }

  if (!Array.isArray(product.flavours)) {
    return 'Flavours must be an array';
  }

  if (typeof product.featured !== 'boolean') {
    return 'Featured must be a boolean';
  }

  return null;
}

function normalizeProduct(product, existingId) {
  const name = String(product.name).trim();
  const id = existingId ?? String(product.id ?? name.toLowerCase())
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return {
    id,
    name,
    description: String(product.description).trim(),
    category: String(product.category).trim(),
    price: Number(product.price),
    image: String(product.image).trim(),
    flavours: product.flavours.map(flavour => String(flavour).trim()).filter(Boolean),
    size: String(product.size).trim(),
    featured: product.featured
  };
}

function getAdminCredentials() {
  return {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  };
}

function signToken(payload) {
  const secret = process.env.ADMIN_PASSWORD;
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');

  return `${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  const secret = process.env.ADMIN_PASSWORD;

  if (!secret || !token || !token.includes('.')) {
    return false;
  }

  const [encodedPayload, signature] = token.split('.');
  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  const received = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    return payload.email === process.env.ADMIN_EMAIL && Number(payload.exp) > Date.now();
  } catch {
    return false;
  }
}

function getBearerToken(req) {
  const authorization = req.headers.authorization ?? '';
  const [scheme, token] = authorization.split(' ');

  return scheme === 'Bearer' ? token : null;
}

function requireAdmin(req, res) {
  if (!verifyToken(getBearerToken(req))) {
    sendJson(res, 401, { error: 'Admin authentication required' });
    return false;
  }

  return true;
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok', service: 'honore-cakes-api' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/cakes') {
    const cakes = await loadCakes();
    const featured = url.searchParams.get('featured');
    const filteredCakes = featured === 'true' ? cakes.filter(cake => cake.featured) : cakes;

    sendJson(res, 200, { cakes: filteredCakes });
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/cakes/')) {
    const cakeId = decodeURIComponent(url.pathname.replace('/api/cakes/', ''));
    const cakes = await loadCakes();
    const cake = cakes.find(item => item.id === cakeId);

    if (!cake) {
      notFound(res);
      return;
    }

    sendJson(res, 200, { cake });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/products') {
    const products = await loadProducts();
    const featured = url.searchParams.get('featured');
    const filteredProducts = featured === 'true' ? products.filter(product => product.featured) : products;

    sendJson(res, 200, { products: filteredProducts });
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/products/')) {
    const productId = decodeURIComponent(url.pathname.replace('/api/products/', ''));
    const products = await loadProducts();
    const product = products.find(item => item.id === productId);

    if (!product) {
      notFound(res);
      return;
    }

    sendJson(res, 200, { product });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/login') {
    try {
      const credentials = await readJsonBody(req);
      const admin = getAdminCredentials();

      if (!admin.email || !admin.password) {
        sendJson(res, 500, { error: 'Admin credentials are not configured' });
        return;
      }

      if (credentials.email !== admin.email || credentials.password !== admin.password) {
        sendJson(res, 401, { error: 'Invalid admin credentials' });
        return;
      }

      sendJson(res, 200, {
        token: signToken({ email: admin.email, exp: Date.now() + 24 * 60 * 60 * 1000 })
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/products') {
    if (!requireAdmin(req, res)) {
      return;
    }

    try {
      const productInput = await readJsonBody(req);
      const validationError = validateProduct(productInput);

      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      const products = await loadProducts();
      const product = normalizeProduct(productInput);

      if (!product.id) {
        sendJson(res, 400, { error: 'Product id is required' });
        return;
      }

      if (products.some(item => item.id === product.id)) {
        sendJson(res, 409, { error: 'Product id already exists' });
        return;
      }

      products.push(product);
      await saveProducts(products);

      sendJson(res, 201, { product });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/products/')) {
    if (!requireAdmin(req, res)) {
      return;
    }

    try {
      const productId = decodeURIComponent(url.pathname.replace('/api/products/', ''));
      const productInput = await readJsonBody(req);
      const validationError = validateProduct(productInput);

      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      const products = await loadProducts();
      const index = products.findIndex(item => item.id === productId);

      if (index === -1) {
        notFound(res);
        return;
      }

      const product = normalizeProduct(productInput, productId);
      products[index] = product;
      await saveProducts(products);

      sendJson(res, 200, { product });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/products/')) {
    if (!requireAdmin(req, res)) {
      return;
    }

    const productId = decodeURIComponent(url.pathname.replace('/api/products/', ''));
    const products = await loadProducts();
    const nextProducts = products.filter(item => item.id !== productId);

    if (nextProducts.length === products.length) {
      notFound(res);
      return;
    }

    await saveProducts(nextProducts);
    sendJson(res, 200, { message: 'Product deleted' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/inquiries') {
    try {
      const inquiry = await readJsonBody(req);
      const validationError = validateInquiry(inquiry);

      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      sendJson(res, 202, {
        message: 'Inquiry received',
        inquiry: {
          name: String(inquiry.name).trim(),
          email: String(inquiry.email).trim(),
          cakeId: inquiry.cakeId ? String(inquiry.cakeId).trim() : null
        }
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  notFound(res);
}

export function createApp() {
  return createServer((req, res) => {
    handleRequest(req, res).catch(error => {
      console.error(error);
      sendJson(res, 500, { error: 'Internal server error' });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createApp();

  server.listen(DEFAULT_PORT, () => {
    console.log(`Honore Cakes API listening on http://localhost:${DEFAULT_PORT}`);
  });
}
