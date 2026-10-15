// COH-016 — the Firestore REST codec and write builders. Pure; no emulator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';

const require = Module.createRequire(import.meta.url);
const rest = require('../lib/firestoreRest.js');

test('codec round-trips every value type', () => {
  const when = new Date('2026-10-15T12:34:56.000Z');
  const obj = {
    s: 'hello', empty: '', i: 42, neg: -7, zero: 0, d: 3.5, t: true, f: false, n: null,
    ts: when, arr: [1, 'a', { x: true }], emptyArr: [], map: { a: { b: ['c'] } }, emptyMap: {},
  };
  const back = rest.decodeFields(rest.encodeFields(obj));
  assert.deepEqual(back, obj);
});

test('integers encode as integerValue strings, non-integers as doubleValue', () => {
  assert.deepEqual(rest.toValue(5), { integerValue: '5' });
  assert.deepEqual(rest.toValue(5.25), { doubleValue: 5.25 });
  assert.deepEqual(rest.toValue(null), { nullValue: null });
  assert.deepEqual(rest.toValue([]), { arrayValue: {} });
  assert.deepEqual(rest.toValue(new Date('2026-01-01T00:00:00Z')), { timestampValue: '2026-01-01T00:00:00.000Z' });
});

test('encodeFields skips undefined and rejects unsupported values', () => {
  assert.deepEqual(rest.encodeFields({ a: 1, b: undefined }), { a: { integerValue: '1' } });
  assert.throws(() => rest.toValue(NaN));
  assert.throws(() => rest.toValue(() => 1));
});

test('decodeDoc extracts id, path, updateTime and data', () => {
  const d = rest.decodeDoc({
    name: 'projects/p/databases/(default)/documents/churches/c/workItems/task_abc',
    updateTime: '2026-10-15T00:00:00Z',
    fields: { name: { stringValue: 'x' }, n: { integerValue: '3' } },
  });
  assert.equal(d.id, 'task_abc');
  assert.equal(d.path, 'churches/c/workItems/task_abc');
  assert.equal(d.updateTime, '2026-10-15T00:00:00Z');
  assert.deepEqual(d.data, { name: 'x', n: 3 });
});

test('updateMask lists exactly the written keys, quoting odd names', () => {
  assert.deepEqual(rest.buildUpdateMask(['status', 'updatedAt']), { fieldPaths: ['status', 'updatedAt'] });
  assert.deepEqual(rest.buildUpdateMask(['a-b', '1x']), { fieldPaths: ['`a-b`', '`1x`'] });
  const w = rest.updateWrite('churches/c/workItems/task_x', { status: 'Complete' }, ['status', 'completedAt'], { updateTime: 'T' });
  assert.deepEqual(w.updateMask.fieldPaths, ['status', 'completedAt']);
  assert.deepEqual(w.currentDocument, { updateTime: 'T' });
  // completedAt is in the mask but absent from fields: Firestore deletes it.
  assert.deepEqual(Object.keys(w.update.fields), ['status']);
});

test('REQUEST_TIME transform shape', () => {
  assert.deepEqual(rest.requestTimeTransform('timestamp'), { fieldPath: 'timestamp', setToServerValue: 'REQUEST_TIME' });
  const w = rest.createWrite('churches/c/activityLog/a', { action: 'x' }, { transforms: [rest.requestTimeTransform('timestamp')] });
  assert.deepEqual(w.updateTransforms, [{ fieldPath: 'timestamp', setToServerValue: 'REQUEST_TIME' }]);
  assert.deepEqual(w.currentDocument, { exists: false });
  assert.equal(w.updateMask, undefined, 'a create writes every key; no mask');
});

test('buildQuery: single filter, composite AND, ordering, limit', () => {
  const one = rest.buildQuery('workItems', [['visibility', '==', 'team']], { limit: 300 });
  assert.equal(one.limit, 300);
  assert.equal(one.where.fieldFilter.op, 'EQUAL');
  assert.deepEqual(one.where.fieldFilter.value, { stringValue: 'team' });
  const two = rest.buildQuery('workItems', [['a', 'array-contains', 'u'], ['archived', '==', false]]);
  assert.equal(two.where.compositeFilter.op, 'AND');
  assert.equal(two.where.compositeFilter.filters[0].fieldFilter.op, 'ARRAY_CONTAINS');
  assert.deepEqual(two.where.compositeFilter.filters[1].fieldFilter.value, { booleanValue: false });
  const ord = rest.buildQuery('comments', [], { orderBy: ['createdAt', 'asc'] });
  assert.equal(ord.where, undefined);
  assert.deepEqual(ord.orderBy, [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }]);
  assert.throws(() => rest.buildQuery('x', [['a', '<', 1]]));
});

test('error classification never exposes the response body', async () => {
  assert.equal(rest.classify(403, '{}'), 'permission');
  assert.equal(rest.classify(404, '{}'), 'not_found');
  assert.equal(rest.classify(400, JSON.stringify({ error: { status: 'FAILED_PRECONDITION' } })), 'conflict');
  assert.equal(rest.classify(409, JSON.stringify({ error: { status: 'ABORTED' } })), 'conflict');
  assert.equal(rest.classify(500, 'boom'), 'error');

  const client = rest.createFirestoreRest({
    fetchFn: async () => ({ ok: false, status: 403, text: async () => 'SECRET-BODY', json: async () => ({}) }),
  });
  await assert.rejects(() => client.getDoc('tok', 'a/b'), (e) => {
    assert.equal(e.kind, 'permission');
    assert.ok(!e.message.includes('SECRET-BODY'));
    assert.ok(!JSON.stringify(e).includes('SECRET-BODY'));
    return true;
  });
});

test('client getDoc: 404 -> null, sends the bearer token', async () => {
  const seen = [];
  const client = rest.createFirestoreRest({
    fetchFn: async (url, opts) => { seen.push([url, opts]); return { ok: false, status: 404, text: async () => '{}' }; },
  });
  assert.equal(await client.getDoc('TOK', 'churches/c/workItems/task_x'), null);
  assert.equal(seen[0][1].headers.Authorization, 'Bearer TOK');
  assert.ok(seen[0][0].startsWith('https://firestore.googleapis.com/v1/projects/church-inventory-9615c/databases/(default)/documents/'));
});
