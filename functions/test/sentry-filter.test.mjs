// main.jsx beforeSend code filter (2026-10-18).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldDropForCode, isMissingIndexError } from '../../src/lib/sentryFilter.js';

const INDEX_MSG = 'The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/x/firestore/indexes?create_composite=abc';

test('rule/user codes are dropped (unchanged behaviour)', () => {
  for (const c of ['permission-denied', 'failed-precondition', 'unauthenticated', 'not-found',
    'functions/permission-denied', 'functions/failed-precondition', 'functions/unauthenticated', 'functions/not-found']) {
    assert.equal(shouldDropForCode(c, 'whatever'), true, c);
  }
});

test('a missing-index failed-precondition is NOT dropped', () => {
  assert.equal(isMissingIndexError('failed-precondition', INDEX_MSG), true);
  assert.equal(shouldDropForCode('failed-precondition', INDEX_MSG), false);
});

test('a callable failed-precondition mentioning an index is still dropped (not a Firestore index error)', () => {
  assert.equal(shouldDropForCode('functions/failed-precondition', INDEX_MSG), true);
});

test('other codes and missing codes pass through', () => {
  assert.equal(shouldDropForCode('internal', 'x'), false);
  assert.equal(shouldDropForCode('', 'x'), false);
  assert.equal(shouldDropForCode(undefined, undefined), false);
  assert.equal(shouldDropForCode('failed-precondition', undefined), true);
});
