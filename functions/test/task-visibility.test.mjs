// The shared task-visibility predicate consumed by useFirestore (store level)
// and WorkBoard (board level) — DEC-2026-010, Codex review finding M-3.
// These pin what "private" and "shared" mean IN THE APP. They say nothing about
// authorization: until COH-006 deploys, the documents still reach the browser
// (DEC-2026-009).
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSeeTask, uidsOf } from '../../src/utils/taskVisibility.js';

const ME = 'uid-me';
const OTHER = 'uid-other';

test('team and legacy-unset visibility are church-wide', () => {
  assert.equal(canSeeTask({ visibility: 'team', createdBy: OTHER }, ME), true);
  assert.equal(canSeeTask({ createdBy: OTHER }, ME), true);          // legacy doc, no field
  assert.equal(canSeeTask({ visibility: '', createdBy: OTHER }, ME), true);
});

test('private is the creator only', () => {
  assert.equal(canSeeTask({ visibility: 'private', createdBy: ME }, ME), true);
  assert.equal(canSeeTask({ visibility: 'private', createdBy: OTHER }, ME), false);
});

test('assignees see their task at any visibility', () => {
  const t = { visibility: 'private', createdBy: OTHER, assignees: [{ uid: ME, name: 'Me' }] };
  assert.equal(canSeeTask(t, ME), true);
  assert.equal(canSeeTask({ ...t, visibility: 'shared' }, ME), true);
});

test('shared is the selected recipients, not every member', () => {
  const t = { visibility: 'shared', createdBy: OTHER, sharedWith: [{ uid: ME, name: 'Me' }] };
  assert.equal(canSeeTask(t, ME), true);
  assert.equal(canSeeTask({ ...t, sharedWith: [{ uid: 'uid-third', name: 'Third' }] }, ME), false);
});

test('sharedWith does not grant access to a private task', () => {
  // Guards the shape of the predicate: the sharedWith arm is gated on visibility,
  // so a stale sharedWith left on a task later switched to private stays inert.
  const t = { visibility: 'private', createdBy: OTHER, sharedWith: [{ uid: ME, name: 'Me' }] };
  assert.equal(canSeeTask(t, ME), false);
});

test('missing arrays, missing task, and missing uid are safe', () => {
  assert.equal(canSeeTask({ visibility: 'private', createdBy: OTHER }, undefined), false);
  assert.equal(canSeeTask({ visibility: 'shared', createdBy: OTHER }, ME), false);
  assert.equal(canSeeTask(null, ME), false);
  assert.equal(canSeeTask(undefined, ME), false);
  // An unauthenticated caller still sees team items — the store only reaches this
  // predicate inside an authenticated church session.
  assert.equal(canSeeTask({ visibility: 'team', createdBy: OTHER }, undefined), true);
});

// ── uidsOf — the rules-searchable projection of the [{uid,name}] arrays ───────

test('uidsOf projects uids, deduped and sorted', () => {
  assert.deepEqual(uidsOf([{ uid: 'b', name: 'B' }, { uid: 'a', name: 'A' }]), ['a', 'b']);
  assert.deepEqual(uidsOf([{ uid: 'a' }, { uid: 'a' }]), ['a']);
});

test('uidsOf is stable for the same membership regardless of input order', () => {
  const one = [{ uid: 'c' }, { uid: 'a' }, { uid: 'b' }];
  const two = [{ uid: 'b' }, { uid: 'c' }, { uid: 'a' }];
  assert.deepEqual(uidsOf(one), uidsOf(two));
});

test('uidsOf drops malformed entries rather than writing null into the array', () => {
  // A null in the projection would make an array-contains query and any rules-side
  // comparison behave unpredictably, so entries without a uid are dropped.
  assert.deepEqual(uidsOf([{ name: 'no uid' }, null, undefined, { uid: '' }, { uid: 'a' }]), ['a']);
});

test('uidsOf returns an empty array for missing or non-array input', () => {
  assert.deepEqual(uidsOf(undefined), []);
  assert.deepEqual(uidsOf(null), []);
  assert.deepEqual(uidsOf('not-an-array'), []);
});

// ── COH-007 A5 / review H2 — the canonical uid arrays govern ────────────────
// DEC-2026-012 made assigneeUids/sharedWithUids canonical for authorization, but
// this predicate kept reading the [{uid, name}] presentation arrays. That is a
// LIVE defect on the active board, not merely an archive concern: a task whose
// object array has gone stale is hidden from someone the rules authorize.

test('canonical assignee remains visible when the presentation array is stale', () => {
  const t = {
    _docId: 'x', type: 'task', visibility: 'private', createdBy: 'creator',
    assigneeUids: ['assignee'], assignees: [], archived: true,
  };
  assert.equal(canSeeTask(t, 'assignee'), true);
});

test('canonical recipient remains visible when the presentation array is stale', () => {
  const t = {
    visibility: 'shared', createdBy: 'creator',
    sharedWithUids: ['recipient'], sharedWith: [],
  };
  assert.equal(canSeeTask(t, 'recipient'), true);
});

test('canSeeTask falls back only when the canonical projection is absent', () => {
  const staleObject = [{ uid: 'old-recipient' }];
  // A genuine pre-projection document: no canonical array exists to consult.
  assert.equal(canSeeTask({ visibility: 'shared', sharedWith: staleObject }, 'old-recipient'), true);
  // An EMPTY canonical array is an answer, not a gap. It means nobody.
  assert.equal(canSeeTask({ visibility: 'shared', sharedWithUids: [], sharedWith: staleObject }, 'old-recipient'), false);
  assert.equal(canSeeTask({ visibility: 'private', createdBy: 'creator', assignees: staleObject }, 'old-recipient'), true);
  assert.equal(canSeeTask({ visibility: 'private', createdBy: 'creator', assigneeUids: [], assignees: staleObject }, 'old-recipient'), false);
});

test('a malformed map projection grants nobody, mirroring the rules', () => {
  assert.equal(canSeeTask({ visibility: 'shared', sharedWithUids: { recipient: true } }, 'recipient'), false);
  assert.equal(canSeeTask({ visibility: 'private', createdBy: 'c', assigneeUids: 'assignee' }, 'assignee'), false);
});

test('archiving changes nothing about who can see a task', () => {
  const t = { visibility: 'shared', createdBy: 'creator', sharedWithUids: ['recipient'] };
  assert.equal(canSeeTask({ ...t, archived: true }, 'recipient'), canSeeTask(t, 'recipient'));
  assert.equal(canSeeTask({ ...t, archived: true }, 'stranger'), canSeeTask(t, 'stranger'));
});
