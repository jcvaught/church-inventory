// COH-016 — API keys + the `mcp` endpoint's front door.
//
// Callables run through the real handlers against the firestore+auth emulators.
// The `mcp` endpoint is exercised both with mock req/res (every refusal that
// happens BEFORE the MCP transport) and over a real local HTTP server (one
// happy-path round trip, with the identitytoolkit + Firestore REST calls
// stubbed at global.fetch — no real network).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import Module from 'node:module';
import { loadFunctions, mockCallable, mockRes, db } from './setup.mjs';

const require = Module.createRequire(import.meta.url);
const OWNER = 'RCFuTSK9ARfGF83v6TOS1Yf4Cnn2'; // the one allowlisted uid (keys.js API_KEY_ALLOWLIST)

let funcs;
before(async () => { funcs = await loadFunctions(); });

let n = 0;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function wipeKeysFor(uid) {
  const snap = await db().collection('apiKeys').where('uid', '==', uid).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}
async function seedOwner({ active = true, role = 'admin', allowedHubs } = {}) {
  const churchId = `apikey-church-${Date.now()}-${n++}`;
  await db().doc(`users/${OWNER}`).set({ churchId, role, name: 'John Vaught', active, ...(allowedHubs !== undefined ? { allowedHubs } : {}) });
  await db().doc(`churches/${churchId}/config/subscription`).set({ grandfathered: true, status: 'active' });
  return churchId;
}
const createCall = (uid, label = 'ChatGPT') => funcs.createApiKey.run(mockCallable(uid, { label }));

async function seedKey({ uid = OWNER, churchId, revokedAt = null, expiresAt, lastUsedAt = null, label = 'seeded' } = {}) {
  const key = 'coh_' + crypto.randomBytes(32).toString('base64url');
  await db().doc(`apiKeys/${sha(key)}`).set({
    uid, churchId, label, createdAt: new Date().toISOString(),
    expiresAt: expiresAt || new Date(Date.now() + 86400000).toISOString(), lastUsedAt, revokedAt,
  });
  return key;
}
const mcpReq = (key, over = {}) => ({
  method: 'POST',
  headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), 'content-type': 'application/json' },
  body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  rawBody: Buffer.from('{}'),
  ...over,
});
async function callMcp(req) { const res = mockRes(); await funcs.mcp(req, res); return res; }

// ── createApiKey ─────────────────────────────────────────────────────────────
test('createApiKey refuses a uid that is not on the allowlist', async () => {
  await assert.rejects(() => createCall('some-other-uid'), (e) => e.code === 'permission-denied');
  await assert.rejects(() => funcs.createApiKey.run(mockCallable(null, { label: 'x' })), (e) => e.code === 'unauthenticated');
});

test('the stored doc holds a hash, never the plaintext key', async () => {
  await wipeKeysFor(OWNER);
  const churchId = await seedOwner();
  const r = await createCall(OWNER, 'My ChatGPT');
  assert.match(r.key, /^coh_[A-Za-z0-9_-]{43}$/);
  assert.equal(r.id.length, 12);
  const doc = await db().doc(`apiKeys/${sha(r.key)}`).get();
  assert.equal(doc.exists, true);
  const d = doc.data();
  assert.equal(d.uid, OWNER);
  assert.equal(d.churchId, churchId);
  assert.equal(d.label, 'My ChatGPT');
  assert.equal(d.revokedAt, null);
  assert.equal(d.lastUsedAt, null);
  assert.equal(new Date(d.expiresAt).getTime() - new Date(d.createdAt).getTime(), 90 * 86400000);
  assert.equal(r.expiresAt, d.expiresAt);
  // The plaintext appears nowhere in anything stored for this uid.
  const all = await db().collection('apiKeys').where('uid', '==', OWNER).get();
  assert.equal(JSON.stringify(all.docs.map((x) => [x.id, x.data()])).includes(r.key), false);
});

test('at most 5 live keys; a revoked key frees a slot', async () => {
  await wipeKeysFor(OWNER);
  await seedOwner();
  const made = [];
  for (let i = 0; i < 5; i++) made.push(await createCall(OWNER, `k${i}`));
  await assert.rejects(() => createCall(OWNER, 'sixth'), (e) => e.code === 'resource-exhausted');
  await funcs.revokeApiKey.run(mockCallable(OWNER, { id: made[0].id }));
  await createCall(OWNER, 'sixth-ok');
});

test('label is required and bounded', async () => {
  await seedOwner();
  await assert.rejects(() => createCall(OWNER, ''), (e) => e.code === 'invalid-argument');
  await assert.rejects(() => createCall(OWNER, 'x'.repeat(61)), (e) => e.code === 'invalid-argument');
});

// ── listApiKeys / revokeApiKey ───────────────────────────────────────────────
test('listApiKeys returns only the caller’s keys, with no full hash', async () => {
  await wipeKeysFor(OWNER);
  const churchId = await seedOwner();
  const mine = await createCall(OWNER, 'mine');
  const theirs = await seedKey({ uid: 'other-owner', churchId, label: 'theirs' });
  const { keys } = await funcs.listApiKeys.run(mockCallable(OWNER, {}));
  assert.equal(keys.length, 1);
  assert.equal(keys[0].label, 'mine');
  assert.equal(keys[0].id, mine.id);
  assert.equal(keys[0].revoked, false);
  const dump = JSON.stringify(keys);
  assert.equal(dump.includes(sha(mine.key)), false, 'full hash must not be returned');
  assert.equal(dump.includes(mine.key), false);
  assert.equal(dump.includes(sha(theirs).slice(0, 12)), false);
  await db().doc(`apiKeys/${sha(theirs)}`).delete();
});

test('revokeApiKey: own keys only', async () => {
  await wipeKeysFor(OWNER);
  const churchId = await seedOwner();
  const theirs = await seedKey({ uid: 'other-owner', churchId });
  const mine = await createCall(OWNER, 'mine');

  await assert.rejects(
    () => funcs.revokeApiKey.run(mockCallable(OWNER, { id: sha(theirs).slice(0, 12) })),
    (e) => e.code === 'not-found',
  );
  assert.equal((await db().doc(`apiKeys/${sha(theirs)}`).get()).data().revokedAt, null, 'another uid’s key is untouched');

  await funcs.revokeApiKey.run(mockCallable(OWNER, { id: mine.id }));
  assert.ok((await db().doc(`apiKeys/${sha(mine.key)}`).get()).data().revokedAt);
  // Idempotent.
  await funcs.revokeApiKey.run(mockCallable(OWNER, { id: mine.id }));
  await assert.rejects(() => funcs.revokeApiKey.run(mockCallable(OWNER, { id: 'nothex' })), (e) => e.code === 'invalid-argument');
  await db().doc(`apiKeys/${sha(theirs)}`).delete();
});

// ── mcp front door ───────────────────────────────────────────────────────────
test('mcp: no key, a malformed key and an unknown key are all 401', async () => {
  for (const key of [null, 'nope', 'coh_' + 'a'.repeat(43)]) {
    const res = await callMcp(mcpReq(key));
    assert.equal(res.statusCode, 401, String(key));
  }
});

test('mcp: only POST; GET and DELETE are 405', async () => {
  for (const method of ['GET', 'DELETE']) {
    const res = await callMcp(mcpReq(null, { method }));
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.Allow, 'POST');
  }
});

test('mcp: a body over 64 KB is 413', async () => {
  const churchId = await seedOwner();
  const key = await seedKey({ churchId });
  const res = await callMcp(mcpReq(key, { rawBody: Buffer.alloc(64 * 1024 + 1) }));
  assert.equal(res.statusCode, 413);
});

test('mcp: expired and revoked keys are 401', async () => {
  const churchId = await seedOwner();
  const expired = await seedKey({ churchId, expiresAt: new Date(Date.now() - 1000).toISOString() });
  const revoked = await seedKey({ churchId, revokedAt: new Date().toISOString() });
  assert.equal((await callMcp(mcpReq(expired))).statusCode, 401);
  assert.equal((await callMcp(mcpReq(revoked))).statusCode, 401);
});

test('mcp: a key whose owner left the allowlist is 401', async () => {
  const churchId = await seedOwner();
  const key = await seedKey({ uid: 'not-allowlisted', churchId });
  assert.equal((await callMcp(mcpReq(key))).statusCode, 401);
});

test('mcp: a deactivated owner is 401, a missing tasks hub is 403', async () => {
  let churchId = await seedOwner({ active: false });
  let key = await seedKey({ churchId });
  assert.equal((await callMcp(mcpReq(key))).statusCode, 401);

  churchId = await seedOwner({ role: 'user', allowedHubs: ['jobs'] });
  key = await seedKey({ churchId });
  assert.equal((await callMcp(mcpReq(key))).statusCode, 403);

  // Profile moved to another church than the key was minted for.
  await seedOwner();
  key = await seedKey({ churchId: 'a-different-church' });
  assert.equal((await callMcp(mcpReq(key))).statusCode, 401);
});

test('mcp: lastUsedAt is stamped, then not rewritten within a minute', async () => {
  const churchId = await seedOwner({ active: false }); // stops after auth; we only care about the stamp
  const key = await seedKey({ churchId });
  await callMcp(mcpReq(key));
  const first = (await db().doc(`apiKeys/${sha(key)}`).get()).data().lastUsedAt;
  assert.ok(first);
  await callMcp(mcpReq(key));
  assert.equal((await db().doc(`apiKeys/${sha(key)}`).get()).data().lastUsedAt, first);
});

test('mcp: the 61st request in a minute is 429', async () => {
  const churchId = await seedOwner({ active: false }); // each allowed call ends 401 at the actor check
  const key = await seedKey({ churchId });
  for (let i = 1; i <= 60; i++) {
    const res = await callMcp(mcpReq(key));
    assert.equal(res.statusCode, 401, `request ${i}`);
  }
  const res = await callMcp(mcpReq(key));
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['Retry-After'], '60');
  const usage = (await db().doc(`apiKeyUsage/${sha(key)}`).get()).data();
  assert.equal(usage.count, 60);
});

test('rate limiter resets after the window', async () => {
  const { rateLimit } = require('../../lib/mcp/keys.js');
  const hash = sha('window-' + Date.now());
  const t0 = new Date('2026-10-15T12:00:00Z');
  for (let i = 0; i < 60; i++) assert.equal((await rateLimit({ db: db(), hash, now: t0 })).ok, true);
  assert.equal((await rateLimit({ db: db(), hash, now: t0 })).ok, false);
  assert.equal((await rateLimit({ db: db(), hash, now: new Date(t0.getTime() + 61000) })).ok, true);
});

// ── one real round trip over HTTP (REST calls stubbed at global.fetch) ──────
test('mcp: list_tasks runs as the owner via REST with the minted ID token', async () => {
  const churchId = await seedOwner();
  const key = await seedKey({ churchId });

  const realFetch = global.fetch;
  const rest = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, opts);
    if (u.includes('identitytoolkit.googleapis.com')) {
      return { ok: true, status: 200, json: async () => ({ idToken: 'ID-TOKEN-FOR-OWNER' }), text: async () => '{}' };
    }
    if (u.includes('firestore.googleapis.com')) {
      rest.push({ url: u, auth: opts.headers?.Authorization, body: opts.body ? JSON.parse(opts.body) : null });
      const doc = {
        document: {
          name: `projects/church-inventory-9615c/databases/(default)/documents/churches/${churchId}/workItems/task_abc123`,
          fields: {
            type: { stringValue: 'task' }, name: { stringValue: 'Replace the projector bulb' }, status: { stringValue: 'Backlog' },
            priority: { stringValue: 'High' }, taskNumber: { stringValue: 'TSK-009' }, visibility: { stringValue: 'private' },
            createdAt: { stringValue: '2026-10-10T00:00:00.000Z' },
          },
        },
      };
      return { ok: true, status: 200, json: async () => [doc], text: async () => '[]' };
    }
    throw new Error(`unexpected fetch ${u}`);
  };

  const express = require('express');
  const app = express();
  app.use(express.json());
  app.all('/mcp', (req, res) => funcs.mcp(req, res));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${server.address().port}/mcp`;
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${key}` };
    const post = async (body) => { const r = await fetch(base, { method: 'POST', headers, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };

    const tools = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    assert.equal(tools.status, 200);
    assert.deepEqual(tools.json.result.tools.map((t) => t.name).sort(), ['add_comment', 'create_task', 'get_task', 'list_tasks', 'update_task']);

    const listed = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_tasks', arguments: {} } });
    const out = JSON.parse(listed.json.result.content[0].text);
    assert.equal(out.tasks.length, 1, 'four arms returned the same doc: deduped');
    assert.equal(out.tasks[0].id, 'abc123', 'bare id, task_ prefix stripped');
    assert.equal(rest.length, 4, 'one REST runQuery per authorization arm');
    assert.ok(rest.every((c) => c.auth === 'Bearer ID-TOKEN-FOR-OWNER'), 'every Firestore call carries the owner’s ID token');
    assert.ok(rest.every((c) => c.url.endsWith(`/churches/${churchId}:runQuery`)));

    // A write with a forbidden field never reaches Firestore.
    rest.length = 0;
    const bad = await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'create_task', arguments: { name: 'x', assignees: [{ uid: 'u2', name: 'B' }] } } });
    assert.equal(bad.json.result.isError, true);
    assert.equal(rest.length, 0);
  } finally {
    global.fetch = realFetch;
    await new Promise((r) => server.close(r));
  }
});
