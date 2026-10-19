// stableStringify (2026-10-18) — WorkBoard detail sync compares snapshots with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stableStringify as s } from '../../src/lib/stableStringify.js';

test('key order does not matter, at any depth', () => {
  assert.equal(s({ b: 1, a: { d: 2, c: 3 } }), s({ a: { c: 3, d: 2 }, b: 1 }));
});

test('array order DOES matter', () => {
  assert.notEqual(s({ a: [1, 2] }), s({ a: [2, 1] }));
});

test('toJSON is used (Date, Timestamp-like with private fields)', () => {
  const ts = (sec) => ({ _seconds: sec, toJSON() { return { seconds: this._seconds, nanoseconds: 0 }; } });
  assert.equal(s({ t: ts(5) }), s({ t: ts(5) }));
  assert.notEqual(s({ t: ts(5) }), s({ t: ts(6) }));
  assert.equal(s({ d: new Date(0) }), '{"d":"1970-01-01T00:00:00.000Z"}');
});

test('undefined keys are omitted; null is kept', () => {
  assert.equal(s({ a: 1, b: undefined }), s({ a: 1 }));
  assert.notEqual(s({ a: 1, b: null }), s({ a: 1 }));
});

test('a changed nested value is detected', () => {
  assert.notEqual(s({ checklist: [{ done: false }] }), s({ checklist: [{ done: true }] }));
});

test('empty/absent distinctions survive', () => {
  assert.notEqual(s({ a: [] }), s({ a: {} }));
  assert.notEqual(s({ a: '' }), s({ a: null }));
});
