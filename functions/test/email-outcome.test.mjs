// Jobs Hub email outcome helpers (2026-10-18). Runs under `npm run test:unit`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMAIL_UNCONFIRMED, NO_EMAIL_OUTCOME, tallyEmailResults, emailOutcomeNote, emailOutcomeIsProblem } from '../../src/lib/emailOutcome.js';

const ok = (value) => ({ status: 'fulfilled', value });

test('tally separates failed (null), unconfirmed (sentinel) and sent', () => {
  const r = [ok({ sent: 3 }), ok(null), ok(EMAIL_UNCONFIRMED), ok(EMAIL_UNCONFIRMED), ok({ skipped: true })];
  assert.deepEqual(tallyEmailResults(r), { failed: 1, unconfirmed: 2, total: 5 });
});

test('a rejected invoke counts as failed', () => {
  assert.deepEqual(tallyEmailResults([{ status: 'rejected', reason: new Error('x') }]), { failed: 1, unconfirmed: 0, total: 1 });
});

test('a lookalike object is not the sentinel', () => {
  assert.deepEqual(tallyEmailResults([ok({ unconfirmed: true })]), { failed: 0, unconfirmed: 0, total: 1 });
});

test('no recipients → empty note, not a problem', () => {
  assert.equal(emailOutcomeNote(NO_EMAIL_OUTCOME), '');
  assert.equal(emailOutcomeIsProblem(NO_EMAIL_OUTCOME), false);
  assert.equal(emailOutcomeNote(undefined), '');
  assert.equal(emailOutcomeIsProblem(undefined), false);
});

test('all sent → empty note', () => {
  assert.equal(emailOutcomeNote({ failed: 0, unconfirmed: 0, total: 4 }), '');
});

test('failures only: says admins were notified', () => {
  assert.equal(emailOutcomeNote({ failed: 1, unconfirmed: 0, total: 3 }), ' 1 of 3 cancellation emails failed to send. Admins were notified.');
  assert.equal(emailOutcomeIsProblem({ failed: 1, unconfirmed: 0, total: 3 }), true);
});

test('unconfirmed only: never claims admins were notified', () => {
  const note = emailOutcomeNote({ failed: 0, unconfirmed: 1, total: 1 });
  assert.equal(note, " 1 of 1 cancellation email couldn't be confirmed (the app was in the background).");
  assert.ok(!note.includes('Admins'));
});

test('mixed: both sentences', () => {
  assert.equal(emailOutcomeNote({ failed: 1, unconfirmed: 2, total: 5 }),
    " 1 of 5 cancellation emails failed to send. Admins were notified. 2 of 5 cancellation emails couldn't be confirmed (the app was in the background).");
});
