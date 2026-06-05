import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const DATA_PATH = join(__dirname, 'data', 'cakes.json');
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN ?? '*';

async function loadCakes() {
  const file = await readFile(DATA_PATH, 'utf8');
  return JSON.parse(file);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);

  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
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
