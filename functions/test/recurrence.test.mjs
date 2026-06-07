// Tests the recurrence date math and — critically — asserts the two TWINS
// (src/utils/date.js and functions/lib/recurrence.js) produce identical output,
// so they can't silently drift. Run with: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { calculateNextDue as clientNextDue, generateRecurrenceDates as clientSeries } from '../../src/utils/date.js';

const require = createRequire(import.meta.url);
const { calculateNextDue: serverNextDue, generateRecurrenceDates: serverSeries } = require('../lib/recurrence.js');

const FREQS = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annually'];

test('calculateNextDue — simple steps', () => {
  assert.equal(clientNextDue('2026-06-07', 'weekly'), '2026-06-14');
  assert.equal(clientNextDue('2026-06-07', 'biweekly'), '2026-06-21');
  assert.equal(clientNextDue('2026-06-15', 'monthly'), '2026-07-15');
  assert.equal(clientNextDue('2026-06-15', 'quarterly'), '2026-09-15');
  assert.equal(clientNextDue('2026-06-15', 'annually'), '2027-06-15');
});

test('calculateNextDue — month-end footgun is clamped, not overflowed', () => {
  assert.equal(clientNextDue('2026-01-31', 'monthly'), '2026-02-28');   // Feb 2026 (non-leap) → 28, NOT Mar 3
  assert.equal(clientNextDue('2024-01-31', 'monthly'), '2024-02-29');   // Feb 2024 (leap) → 29
  assert.equal(clientNextDue('2026-03-31', 'monthly'), '2026-04-30');   // Apr has 30
  assert.equal(clientNextDue('2026-01-31', 'quarterly'), '2026-04-30'); // +3mo to Apr → 30
  assert.equal(clientNextDue('2026-11-30', 'quarterly'), '2027-02-28'); // +3mo to Feb 2027 → 28
  assert.equal(clientNextDue('2024-02-29', 'annually'), '2025-02-28');  // leap day +1yr → 28
  assert.equal(clientNextDue('2026-12-31', 'monthly'), '2027-01-31');   // year rollover
});

test('calculateNextDue — null/empty recurrence leaves the date unchanged', () => {
  assert.equal(clientNextDue('2026-06-07', null), '2026-06-07');
  assert.equal(clientNextDue('2026-06-07', ''), '2026-06-07');
});

test('generateRecurrenceDates — series + bounds', () => {
  assert.deepEqual(
    clientSeries('2026-06-07', 'weekly', '2026-06-28'),
    ['2026-06-07', '2026-06-14', '2026-06-21', '2026-06-28'],
  );
  assert.deepEqual(clientSeries('2026-06-07', 'weekly', '2026-06-01'), []); // inverted range
  assert.deepEqual(clientSeries('', 'weekly', '2026-06-28'), []);           // missing start
  assert.deepEqual(clientSeries('2026-06-07', null, '2026-06-28'), []);     // missing freq
  assert.equal(clientSeries('2026-01-01', 'weekly', '2030-01-01', 5).length, 5); // cap honored
});

test('TWIN PARITY — client (date.js) and server (recurrence.js) agree exactly', () => {
  const dates = ['2026-01-31', '2024-01-31', '2026-02-28', '2024-02-29', '2026-03-31',
    '2026-04-30', '2026-11-30', '2026-12-31', '2027-01-01', '2026-06-15'];
  for (const d of dates) {
    for (const f of FREQS) {
      assert.equal(serverNextDue(d, f), clientNextDue(d, f), `nextDue mismatch for ${d} / ${f}`);
    }
    assert.equal(serverNextDue(d, null), clientNextDue(d, null), `nextDue mismatch for ${d} / null`);
  }
  // Series parity across a multi-year window that crosses every month-end.
  for (const f of FREQS) {
    assert.deepEqual(
      serverSeries('2026-01-31', f, '2027-12-31'),
      clientSeries('2026-01-31', f, '2027-12-31'),
      `series mismatch for ${f}`,
    );
  }
});
