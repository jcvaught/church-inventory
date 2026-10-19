// Listener resilience unit tests (2026-10-18). Runs under `npm run test:unit`.
// Drives the PURE src/lib/resilientListener.js with a fake subscribe, fake
// timers and fake visibility. Plus a source guard: no raw onSnapshot( call in
// src/ outside the binding — a missed site keeps the permanent-drop failure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createResilientListener, MAX_FAILURES, backoffMs } from '../../src/lib/resilientListener.js';

function harness({ hidden = false, throwOnOpen = [], throwCode } = {}) {
  const opens = [];      // one entry per successful subscribe(): { next, error, unsubbed }
  opens.thrown = 0;      // subscribe() calls that threw
  const timers = [];     // { fn, ms, cleared }
  const reports = [];
  const nexts = [];
  const errors = [];
  let visibleCbs = [];
  const state = { hidden };
  const env = {
    setTimeout: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
    clearTimeout: (t) => { t.cleared = true; },
    isHidden: () => state.hidden,
    onVisible: (cb) => { visibleCbs.push(cb); return () => { visibleCbs = visibleCbs.filter(c => c !== cb); }; },
    report: (e) => reports.push(e),
    random: () => 0,
  };
  const subscribe = (next, error) => {
    const n = opens.length;
    if (throwOnOpen.includes(n + opens.thrown)) { opens.thrown++; throw Object.assign(new Error('boom'), throwCode ? { code: throwCode } : {}); }
    const o = { next, error, unsubbed: false };
    opens.push(o);
    return () => { o.unsubbed = true; };
  };
  const unsub = createResilientListener({
    label: 't', subscribe, onNext: (s) => nexts.push(s), onError: (e) => errors.push(e), env,
  });
  const fire = () => { const t = timers.find(x => !x.cleared && !x.fired); t.fired = true; t.fn(); return t; };
  const becomeVisible = () => { state.hidden = false; [...visibleCbs].forEach(cb => cb()); };
  return { opens, timers, reports, nexts, errors, unsub, fire, state, becomeVisible, visibleCbs: () => visibleCbs };
}

const err = (code) => Object.assign(new Error(code), { code });

test('delivers snapshots', () => {
  const h = harness();
  h.opens[0].next('s1');
  assert.deepEqual(h.nexts, ['s1']);
});

test('retryable error: onError runs, then resubscribes after backoff', () => {
  const h = harness();
  h.opens[0].error(err('unavailable'));
  assert.equal(h.errors.length, 1);
  assert.equal(h.opens[0].unsubbed, true);
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].ms, 2000);
  assert.deepEqual(h.reports[0], { level: 'warning', label: 't', code: 'unavailable', outcome: 'retry', attempt: 1 });
  h.fire();
  assert.equal(h.opens.length, 2);
  h.opens[1].next('s2');
  assert.deepEqual(h.nexts, ['s2']);
});

test('backoff doubles and caps at 60s including jitter', () => {
  assert.equal(backoffMs(1, () => 0), 2000);
  assert.equal(backoffMs(3, () => 0), 8000);
  assert.equal(backoffMs(10, () => 0), 60000);
  assert.equal(backoffMs(10, () => 0.999), 60000);
  assert.equal(backoffMs(1, () => 0.5), 2500);
});

test('a snapshot resets the failure count', () => {
  const h = harness();
  h.opens[0].error(err('unavailable')); h.fire();
  h.opens[1].error(err('unavailable')); h.fire();
  assert.equal(h.timers[1].ms, 4000);
  h.opens[2].next('ok');
  h.opens[2].error(err('unavailable'));
  assert.equal(h.timers[2].ms, 2000);
});

test(`gives up after ${MAX_FAILURES} consecutive failures and reports it`, () => {
  const h = harness();
  for (let i = 0; i < MAX_FAILURES; i++) { h.opens[i].error(err('deadline-exceeded')); h.fire(); }
  h.opens[MAX_FAILURES].error(err('deadline-exceeded'));
  assert.equal(h.opens.length, MAX_FAILURES + 1);
  assert.equal(h.timers.length, MAX_FAILURES);
  assert.deepEqual(h.reports.at(-1), { level: 'error', label: 't', code: 'deadline-exceeded', outcome: 'gave-up', attempt: MAX_FAILURES });
});

test('permanent error: no resubscribe, reported as permanent', () => {
  const h = harness();
  h.opens[0].error(err('invalid-argument'));
  assert.equal(h.timers.length, 0);
  assert.equal(h.errors.length, 1);
  assert.deepEqual(h.reports, [{ level: 'error', label: 't', code: 'invalid-argument', outcome: 'permanent' }]);
});

for (const code of ['permission-denied', 'failed-precondition', 'unauthenticated', 'not-found']) {
  test(`${code}: no resubscribe and no report (mirrors beforeSend)`, () => {
    const h = harness();
    h.opens[0].error(err(code));
    assert.equal(h.timers.length, 0);
    assert.equal(h.reports.length, 0);
    assert.equal(h.errors.length, 1);
  });
}

test('a retryable throw from subscribe ON A RETRY keeps retrying', () => {
  const h = harness({ throwOnOpen: [1], throwCode: 'unavailable' });
  h.opens[0].error(err('unavailable'));
  h.fire();                        // retry #1 throws synchronously
  assert.equal(h.opens.thrown, 1);
  assert.equal(h.errors.length, 2);
  assert.equal(h.timers.length, 2);
  assert.equal(h.timers[1].ms, 4000);
  h.fire();                        // retry #2 succeeds
  assert.equal(h.opens.length, 2);
  h.opens[1].next('back');
  assert.deepEqual(h.nexts, ['back']);
});

test('env.random is optional', () => {
  const timers = [];
  const opens = [];
  createResilientListener({
    label: 't', subscribe: (n, e) => { opens.push(e); return () => {}; }, onNext() {}, onError() {},
    env: { setTimeout: (fn, ms) => { timers.push(ms); return 1; }, clearTimeout() {}, isHidden: () => false, onVisible: () => () => {}, report() {} },
  });
  opens[0](err('unavailable'));
  assert.ok(timers[0] >= 2000 && timers[0] < 3000);
});

test('aborted is not retried (terminate) and is reported', () => {
  const h = harness();
  h.opens[0].error(err('aborted'));
  assert.equal(h.timers.length, 0);
  assert.equal(h.reports[0].outcome, 'permanent');
});

test('hidden tab: waits for visible before resubscribing', () => {
  const h = harness({ hidden: true });
  h.opens[0].error(err('unavailable'));
  h.fire();
  assert.equal(h.opens.length, 1);
  assert.equal(h.visibleCbs().length, 1);
  h.becomeVisible();
  assert.equal(h.opens.length, 2);
  assert.equal(h.visibleCbs().length, 0);
});

test('unsubscribe during backoff cancels the retry', () => {
  const h = harness();
  h.opens[0].error(err('unavailable'));
  h.unsub();
  assert.equal(h.timers[0].cleared, true);
  h.timers[0].fn(); // even if a timer slipped through
  assert.equal(h.opens.length, 1);
});

test('unsubscribe while waiting for visibility removes the hook', () => {
  const h = harness({ hidden: true });
  h.opens[0].error(err('unavailable'));
  h.fire();
  h.unsub();
  assert.equal(h.visibleCbs().length, 0);
  h.becomeVisible();
  assert.equal(h.opens.length, 1);
});

test('unsubscribe closes the live listener and silences it', () => {
  const h = harness();
  h.unsub();
  assert.equal(h.opens[0].unsubbed, true);
  h.opens[0].next('late');
  assert.deepEqual(h.nexts, []);
});

test('stale callbacks from a superseded subscription are ignored', () => {
  const h = harness();
  h.opens[0].error(err('unavailable'));
  h.fire();
  h.opens[0].next('stale');
  h.opens[0].error(err('unavailable'));
  assert.deepEqual(h.nexts, []);
  assert.equal(h.errors.length, 1);
  assert.equal(h.timers.length, 1);
});

test('a synchronous throw from subscribe is handled, not thrown', () => {
  const h = harness({ throwOnOpen: [0] });
  assert.equal(h.opens.length, 0);
  assert.equal(h.errors.length, 1);
  assert.equal(h.timers.length, 0);
  assert.equal(h.reports[0].outcome, 'permanent');
  assert.equal(h.reports[0].code, 'none');
});

test('a throwing onError does not wedge the retry', () => {
  const opens = [];
  const timers = [];
  createResilientListener({
    label: 't',
    subscribe: (n, e) => { opens.push(e); return () => {}; },
    onNext: () => {},
    onError: () => { throw new Error('caller bug'); },
    env: { setTimeout: (fn) => { timers.push(fn); return 1; }, clearTimeout() {}, isHidden: () => false, onVisible: () => () => {}, report() {}, random: () => 0 },
  });
  opens[0](err('unavailable'));
  timers[0]();
  assert.equal(opens.length, 2);
});

test('a throwing report does not block the retry', () => {
  const opens = [];
  const timers = [];
  createResilientListener({
    label: 't', subscribe: (n, e) => { opens.push(e); return () => {}; }, onNext() {}, onError() {},
    env: { setTimeout: (fn) => { timers.push(fn); return 1; }, clearTimeout() {}, isHidden: () => false, onVisible: () => () => {}, report() { throw new Error('sentry down'); }, random: () => 0 },
  });
  opens[0](err('unavailable'));
  assert.equal(timers.length, 1);
  timers[0]();
  assert.equal(opens.length, 2);
});

test('an error delivered synchronously inside subscribe closes that listener', () => {
  const unsubbed = [];
  const timers = [];
  let calls = 0;
  createResilientListener({
    label: 't',
    subscribe: (n, e) => { const id = calls++; if (id === 0) e(err('unavailable')); return () => unsubbed.push(id); },
    onNext() {}, onError() {},
    env: { setTimeout: (fn) => { timers.push(fn); return 1; }, clearTimeout() {}, isHidden: () => false, onVisible: () => () => {}, report() {}, random: () => 0 },
  });
  assert.deepEqual(unsubbed, [0]);
  timers[0]();
  assert.equal(calls, 2);
  assert.deepEqual(unsubbed, [0]);
});

test('onError receives willRetry: true while a resubscribe is scheduled', () => {
  const seen = [];
  const opens = [];
  const timers = [];
  createResilientListener({
    label: 't', subscribe: (n, e) => { opens.push(e); return () => {}; }, onNext() {},
    onError: (e, info) => seen.push(info),
    env: { setTimeout: (fn) => { timers.push(fn); return 1; }, clearTimeout() {}, isHidden: () => false, onVisible: () => () => {}, report() {}, random: () => 0 },
  });
  for (let i = 0; i < MAX_FAILURES; i++) { opens[i](err('unavailable')); timers[i](); }
  assert.deepEqual(seen.map(x => x.willRetry), Array(MAX_FAILURES).fill(true));
  opens[MAX_FAILURES](err('unavailable'));           // the give-up
  assert.equal(seen.at(-1).willRetry, false);
  assert.equal(timers.length, MAX_FAILURES);          // nothing new scheduled
});

test('onError receives willRetry: false for a permanent code', () => {
  const seen = [];
  const opens = [];
  createResilientListener({
    label: 't', subscribe: (n, e) => { opens.push(e); return () => {}; }, onNext() {},
    onError: (e, info) => seen.push(info),
    env: { setTimeout() { throw new Error('must not schedule'); }, clearTimeout() {}, isHidden: () => false, onVisible: () => () => {}, report() {}, random: () => 0 },
  });
  opens[0](err('permission-denied'));
  assert.deepEqual(seen, [{ willRetry: false }]);
});

test('unsubscribing from inside onError schedules nothing and reports nothing', () => {
  let unsub;
  const timers = [];
  const reports = [];
  const opens = [];
  unsub = createResilientListener({
    label: 't', subscribe: (n, e) => { opens.push(e); return () => {}; }, onNext() {},
    onError: () => unsub(),
    env: { setTimeout: (fn) => { timers.push(fn); return 1; }, clearTimeout() {}, isHidden: () => false, onVisible: () => () => {}, report: (r) => reports.push(r), random: () => 0 },
  });
  opens[0](err('unavailable'));
  assert.equal(timers.length, 0);
  assert.equal(reports.length, 0);
});

test('a missing-index failed-precondition IS reported (not a rules code)', () => {
  const h = harness();
  h.opens[0].error(Object.assign(new Error('The query requires an index. You can create it here: https://console.firebase.google.com/x'), { code: 'failed-precondition' }));
  assert.equal(h.timers.length, 0);
  assert.deepEqual(h.reports, [{ level: 'error', label: 't', code: 'failed-precondition', outcome: 'permanent' }]);
});

// ── Source guard ────────────────────────────────────────────────────────────
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
const BINDING = join('utils', 'resilientSnapshot.js');
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

test('no raw onSnapshot( in src/ outside the binding', () => {
  const offenders = [];
  for (const f of walk(SRC)) {
    if (f.endsWith(BINDING)) continue;
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (/(^|[^\w.])onSnapshot\s*\(/.test(code)) offenders.push(`${f.slice(SRC.length + 1)}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], 'use onSnapshotResilient(label, …) from src/utils/resilientSnapshot.js');
});
