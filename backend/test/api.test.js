// End-to-end API tests. Each test starts the real server (server.js) as a child
// process against a fresh SQLite file in a temp folder, then talks to it over
// HTTP. No external services are called: GEMINI_API_KEY is blank and no test
// sends an image, so OCR never runs. Run with `npm test` in backend/.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createClient } = require('@libsql/client');

const net = require('node:net');

const SERVER = path.resolve(__dirname, '..', 'server.js');

// Asks the OS for a port nothing is listening on.
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function tempDbFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-test-'));
  return path.join(dir, 'app.db');
}

const dbUrl = (file) => `file:${file.replace(/\\/g, '/')}`;

// Starts server.js on a free port against `dbFile`; resolves once it is listening.
async function startServer(dbFile) {
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      TURSO_DATABASE_URL: dbUrl(dbFile),
      TURSO_AUTH_TOKEN: '',
      GEMINI_API_KEY: '',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${output}`)), 15000);
    const onData = (chunk) => {
      output += chunk;
      if (output.includes('Backend running')) {
        clearTimeout(timer);
        resolve({
          url: `http://127.0.0.1:${port}`,
          stop: () => new Promise((done) => {
            if (child.exitCode !== null || child.signalCode !== null) return done();
            child.once('exit', done);
            child.kill();
          }),
        });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited (${code}):\n${output}`)); });
  });
}

async function api(server, method, urlPath, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(server.url + urlPath, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function login(server, username, password) {
  const res = await api(server, 'POST', '/api/auth/login', { body: { username, password } });
  assert.equal(res.status, 200, `login as ${username} failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

const adminToken = async (server) => (await login(server, 'Admin', 'Admin@123')).token;
const staffToken = async (server) => (await login(server, 'User1', 'User1@123')).token;

// Runs `fn` with a freshly started server and always stops it afterwards.
async function withServer(fn, dbFile = tempDbFile()) {
  const server = await startServer(dbFile);
  try {
    await fn(server, dbFile);
  } finally {
    await server.stop();
  }
}

function historyRecord(overrides = {}) {
  return {
    id: `rec-test-${Math.random().toString(36).slice(2)}`,
    timestamp: '2026-10-29T10:00:00.000Z',
    extractedBatch: '16:47 01B11',
    extractedBarcode: '8909081011368',
    isValid: true,
    validationMethod: 'ocr',
    productName: 'Right Shift Jaggery Oats Cookies',
    barcodeImageUrl: 'data:image/jpeg;base64,dGh1bWI=',
    batchImageUrl: 'data:image/jpeg;base64,dGh1bWI=',
    barcodeImageFull: 'data:image/jpeg;base64,ZnVsbC1iYXJjb2Rl',
    batchImageFull: 'data:image/jpeg;base64,ZnVsbC1iYXRjaA==',
    ...overrides,
  };
}

// ── Health ──────────────────────────────────────────────────────────────────

test('health check needs no sign-in', () => withServer(async (server) => {
  const res = await api(server, 'GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
}));

// ── Sign-in and sessions ────────────────────────────────────────────────────

test('login returns a token and the user without the password', () => withServer(async (server) => {
  const res = await api(server, 'POST', '/api/auth/login', { body: { username: 'Admin', password: 'Admin@123' } });
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.token, 'string');
  assert.equal(res.body.user.username, 'Admin');
  assert.equal(res.body.user.role, 'admin');
  assert.equal(res.body.user.password, undefined);
}));

test('login with a wrong password is rejected', () => withServer(async (server) => {
  const res = await api(server, 'POST', '/api/auth/login', { body: { username: 'Admin', password: 'wrong@1' } });
  assert.equal(res.status, 401);
}));

test('the current-user endpoint returns the signed-in user', () => withServer(async (server) => {
  const token = await staffToken(server);
  const res = await api(server, 'GET', '/api/auth/me', { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.username, 'User1');
}));

test('a made-up token is rejected', () => withServer(async (server) => {
  const res = await api(server, 'GET', '/api/auth/me', { token: 'not-a-real-token' });
  assert.equal(res.status, 401);
}));

test('logging out ends the session', () => withServer(async (server) => {
  const token = await staffToken(server);
  const out = await api(server, 'POST', '/api/auth/logout', { token });
  assert.equal(out.status, 204);
  const res = await api(server, 'GET', '/api/auth/me', { token });
  assert.equal(res.status, 401);
}));

test('a session survives a server restart', async () => {
  const dbFile = tempDbFile();
  let token;
  await withServer(async (server) => { token = await staffToken(server); }, dbFile);
  await withServer(async (server) => {
    const res = await api(server, 'GET', '/api/auth/me', { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.username, 'User1');
  }, dbFile);
});

test('removing a user ends their sessions', () => withServer(async (server) => {
  const admin = await adminToken(server);
  const staff = await login(server, 'User2', 'User2@123');
  const del = await api(server, 'DELETE', `/api/users/${staff.user.id}`, { token: admin });
  assert.equal(del.status, 204);
  const res = await api(server, 'GET', '/api/auth/me', { token: staff.token });
  assert.equal(res.status, 401);
}));

// ── Password storage ────────────────────────────────────────────────────────

test('passwords are stored hashed, never as plain text', () => withServer(async (_server, dbFile) => {
  const db = createClient({ url: dbUrl(dbFile) });
  const rows = (await db.execute('SELECT username, password FROM users')).rows;
  db.close();
  assert.equal(rows.length, 5);
  for (const row of rows) {
    assert.ok(row.password.startsWith('scrypt$'), `${row.username} password is not hashed`);
    assert.ok(!row.password.includes(`${row.username}@123`), `${row.username} password stored in clear`);
  }
}));

test('an old plain-text password is hashed at startup and still signs in', async () => {
  const dbFile = tempDbFile();
  await withServer(async () => {}, dbFile);
  const db = createClient({ url: dbUrl(dbFile) });
  await db.execute("UPDATE users SET password = 'Admin@123' WHERE username = 'Admin'");

  await withServer(async (server) => {
    const res = await api(server, 'POST', '/api/auth/login', { body: { username: 'Admin', password: 'Admin@123' } });
    assert.equal(res.status, 200);
  }, dbFile);

  const row = (await db.execute("SELECT password FROM users WHERE username = 'Admin'")).rows[0];
  db.close();
  assert.ok(row.password.startsWith('scrypt$'));
});

test('a user added by an admin can sign in with their password', () => withServer(async (server) => {
  const admin = await adminToken(server);
  const created = await api(server, 'POST', '/api/users', { token: admin, body: { username: 'Line5', password: 'Line5@pass', role: 'staff' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.password, undefined);
  const res = await api(server, 'POST', '/api/auth/login', { body: { username: 'Line5', password: 'Line5@pass' } });
  assert.equal(res.status, 200);
}));

// ── Access control ──────────────────────────────────────────────────────────

test('API routes reject requests without a token', () => withServer(async (server) => {
  const routes = [
    ['GET', '/api/products'],
    ['GET', '/api/products/barcode/8909081011368'],
    ['POST', '/api/products'],
    ['GET', '/api/users'],
    ['POST', '/api/users'],
    ['GET', '/api/history'],
    ['POST', '/api/history'],
    ['DELETE', '/api/history'],
    ['POST', '/api/extract-product'],
    ['POST', '/api/extract-batch'],
    ['POST', '/api/extract-batch-format'],
    ['POST', '/api/analyze-image'],
  ];
  const statuses = [];
  for (const [method, route] of routes) {
    statuses.push(`${method} ${route} ${(await api(server, method, route)).status}`);
  }
  assert.deepEqual(statuses, routes.map(([method, route]) => `${method} ${route} 401`));
}));

test('staff can read products', () => withServer(async (server) => {
  const token = await staffToken(server);
  const res = await api(server, 'GET', '/api/products', { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 3);
}));

test('staff can call the OCR endpoints', () => withServer(async (server) => {
  const token = await staffToken(server);
  const res = await api(server, 'POST', '/api/extract-product', { token });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'No image file provided.');
}));

test('staff are refused admin-only actions', () => withServer(async (server) => {
  const token = await staffToken(server);
  const routes = [
    ['GET', '/api/users'],
    ['POST', '/api/users'],
    ['DELETE', '/api/users/user-002'],
    ['POST', '/api/products'],
    ['PUT', '/api/products/prod-8909081003363-general'],
    ['DELETE', '/api/products/prod-8909081003363-general'],
    ['DELETE', '/api/history'],
  ];
  const statuses = [];
  for (const [method, route] of routes) {
    const body = method === 'GET' ? undefined : {};
    statuses.push(`${method} ${route} ${(await api(server, method, route, { token, body })).status}`);
  }
  assert.deepEqual(statuses, routes.map(([method, route]) => `${method} ${route} 403`));
}));

// ── Existing behaviour that must keep working ───────────────────────────────

test('an admin can add, edit and delete a product', () => withServer(async (server) => {
  const token = await adminToken(server);
  const product = {
    id: 'prod-test-1', barcode: '1234567890123', productName: 'Test Biscuit', batchNumberFormat: '##@##',
    marketType: 'general', mrpApplicable: true, mrp: 10, shelfLife: 90, shelfLifeUnit: 'days', batchInfoText: '',
  };
  assert.equal((await api(server, 'POST', '/api/products', { token, body: product })).status, 201);
  const updated = await api(server, 'PUT', '/api/products/prod-test-1', { token, body: { ...product, mrp: 12 } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.mrp, 12);
  assert.equal((await api(server, 'DELETE', '/api/products/prod-test-1', { token })).status, 204);
}));

test('the original admin account still cannot be removed', () => withServer(async (server) => {
  const token = await adminToken(server);
  const res = await api(server, 'DELETE', '/api/users/user-000', { token });
  assert.equal(res.status, 400);
}));

test('a weak password is still rejected', () => withServer(async (server) => {
  const token = await adminToken(server);
  const res = await api(server, 'POST', '/api/users', { token, body: { username: 'Weak', password: 'abc', role: 'staff' } });
  assert.equal(res.status, 400);
}));

// ── Validation history ──────────────────────────────────────────────────────

test('staff see only their own history', () => withServer(async (server) => {
  const user1 = await staffToken(server);
  const user2 = (await login(server, 'User2', 'User2@123')).token;
  await api(server, 'POST', '/api/history', { token: user1, body: historyRecord({ id: 'rec-user1' }) });
  await api(server, 'POST', '/api/history', { token: user2, body: historyRecord({ id: 'rec-user2' }) });

  const res = await api(server, 'GET', '/api/history', { token: user1 });
  assert.deepEqual(res.body.map(r => r.id), ['rec-user1']);
}));

test('admins see every user\'s history, newest first', () => withServer(async (server) => {
  const admin = await adminToken(server);
  const user1 = await staffToken(server);
  await api(server, 'POST', '/api/history', { token: user1, body: historyRecord({ id: 'rec-old', timestamp: '2026-10-01T00:00:00.000Z' }) });
  await api(server, 'POST', '/api/history', { token: admin, body: historyRecord({ id: 'rec-new', timestamp: '2026-10-02T00:00:00.000Z' }) });

  const res = await api(server, 'GET', '/api/history', { token: admin });
  assert.deepEqual(res.body.map(r => r.id), ['rec-new', 'rec-old']);
}));

test('a history record belongs to the signed-in user, whatever the body says', () => withServer(async (server) => {
  const user1 = await login(server, 'User1', 'User1@123');
  await api(server, 'POST', '/api/history', { token: user1.token, body: historyRecord({ id: 'rec-x', userId: 'user-000' }) });
  const res = await api(server, 'GET', '/api/history', { token: user1.token });
  assert.equal(res.body[0].userId, user1.user.id);
}));

test('saving the same history record twice keeps one copy', () => withServer(async (server) => {
  const token = await staffToken(server);
  const record = historyRecord({ id: 'rec-dup' });
  assert.equal((await api(server, 'POST', '/api/history', { token, body: record })).status, 201);
  assert.equal((await api(server, 'POST', '/api/history', { token, body: record })).status, 201);
  const res = await api(server, 'GET', '/api/history', { token });
  assert.equal(res.body.length, 1);
}));

test('history survives a server restart', async () => {
  const dbFile = tempDbFile();
  await withServer(async (server) => {
    const token = await staffToken(server);
    await api(server, 'POST', '/api/history', { token, body: historyRecord({ id: 'rec-kept' }) });
  }, dbFile);
  await withServer(async (server) => {
    const token = await staffToken(server);
    const res = await api(server, 'GET', '/api/history', { token });
    assert.deepEqual(res.body.map(r => r.id), ['rec-kept']);
  }, dbFile);
});

test('the history list carries thumbnails and the full image loads separately', () => withServer(async (server) => {
  const token = await staffToken(server);
  await api(server, 'POST', '/api/history', { token, body: historyRecord({ id: 'rec-img' }) });

  const list = await api(server, 'GET', '/api/history', { token });
  assert.equal(list.body[0].barcodeImageUrl, 'data:image/jpeg;base64,dGh1bWI=');
  assert.equal(list.body[0].barcodeImageFull, undefined);

  const full = await api(server, 'GET', '/api/history/rec-img/images/batch', { token });
  assert.equal(full.status, 200);
  assert.equal(full.body.dataUrl, 'data:image/jpeg;base64,ZnVsbC1iYXRjaA==');
}));

test('staff cannot open another user\'s full image', () => withServer(async (server) => {
  const user1 = await staffToken(server);
  const user2 = (await login(server, 'User2', 'User2@123')).token;
  await api(server, 'POST', '/api/history', { token: user1, body: historyRecord({ id: 'rec-private' }) });
  const res = await api(server, 'GET', '/api/history/rec-private/images/barcode', { token: user2 });
  assert.equal(res.status, 404);
}));

test('a history record without an id is rejected', () => withServer(async (server) => {
  const token = await staffToken(server);
  const res = await api(server, 'POST', '/api/history', { token, body: historyRecord({ id: '' }) });
  assert.equal(res.status, 400);
}));

test('an admin can clear all history', () => withServer(async (server) => {
  const admin = await adminToken(server);
  const user1 = await staffToken(server);
  await api(server, 'POST', '/api/history', { token: user1, body: historyRecord() });
  assert.equal((await api(server, 'DELETE', '/api/history', { token: admin })).status, 204);
  const res = await api(server, 'GET', '/api/history', { token: admin });
  assert.deepEqual(res.body, []);
}));

test('an admin uploading old on-device history keeps each record\'s author', () => withServer(async (server) => {
  const admin = await adminToken(server);
  await api(server, 'POST', '/api/history', { token: admin, body: historyRecord({ id: 'rec-legacy', userId: 'user-003' }) });
  const res = await api(server, 'GET', '/api/history', { token: admin });
  assert.equal(res.body[0].userId, 'user-003');
}));

test('saving a record under an id another user already used is refused', () => withServer(async (server) => {
  const user1 = await staffToken(server);
  const user2 = (await login(server, 'User2', 'User2@123')).token;
  await api(server, 'POST', '/api/history', { token: user1, body: historyRecord({ id: 'rec-taken' }) });
  const res = await api(server, 'POST', '/api/history', { token: user2, body: historyRecord({ id: 'rec-taken' }) });
  assert.equal(res.status, 409);
}));

test('an unknown image name is not found rather than a server error', () => withServer(async (server) => {
  const token = await staffToken(server);
  await api(server, 'POST', '/api/history', { token, body: historyRecord({ id: 'rec-img2' }) });
  const res = await api(server, 'GET', '/api/history/rec-img2/images/constructor', { token });
  assert.equal(res.status, 404);
}));

test('an unknown username is rejected like a wrong password', () => withServer(async (server) => {
  const res = await api(server, 'POST', '/api/auth/login', { body: { username: 'Nobody', password: 'x@1abc' } });
  assert.equal(res.status, 401);
}));
