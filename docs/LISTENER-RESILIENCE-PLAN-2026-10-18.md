# Listener resilience: a Firestore listener error is permanent (2026-10-18)

## Problem (verified)
`useFirestore.handleErr`'s 2026-06-11 comment says the SDK "auto-reconnects the listener" after
`deadline-exceeded` / `unavailable` / … reach an `onSnapshot` error callback. **That is false for the
installed SDK (`@firebase/firestore` 4.14.1, `firebase` 12.13.0).** In `dist/common-7a7519be.esm.js`, every path
that calls a listener's `onError` also discards that listener:

1. Server removes a watch target with a cause → `handleTargetError` → `syncEngineRejectListen` →
   `__PRIVATE_eventManagerOnWatchError`: `for (const e of i.va) e.onError(n); r.queries.delete(t);`
2. Listen initialization fails → `__PRIVATE_eventManagerListen` catch → `t.onError(n); return` (never registered).
3. `terminate()` → `__PRIVATE_errorAllTargets` → `onError(ABORTED "Firestore shutting down")`.

Transport blips (stream drop, backgrounded iOS tab) restart the watch stream inside the SDK and never
reach `onError`. So **any error our callback sees means that listener has stopped for good** until the
component remounts or the page reloads. Today that's silent: transient codes log at `console.warn`, and
`permission-denied` / `failed-precondition` / `not-found` are dropped in `main.jsx` `beforeSend`.

**Frequency is unmeasured.** Sentry keeps 90 days: 9 COH issues and 36 events, with zero listener
errors in breadcrumbs. The June entry's "traced to onSnapshot listeners" was attributed through captureConsole,
which pulls out any Error argument (`captureconsole.js:80`), so it couldn't tell a listener from a callable.
Both callable cases measured today (1K, 17) were `functions/*`. Impact if it happens: a hub's data
(items, work items, jobs, subscription → hub gates) goes stale for the rest of the session, and nobody can see it.

## Goal
1. A listener that drops on a retryable code resubscribes itself (bounded backoff).
2. Every drop becomes **measurable**: one grouped Sentry issue, so frequency stops being a guess.
3. Permanent codes stop as today, with one deliberate change. `aborted` (only possible from `terminate()`, which the app
   never calls) moves from warn-level to full `handleErr` reporting, because it would be unexpected (Codex diff review B1).

## Design

### `src/lib/resilientListener.js` (pure, no firebase/Sentry/DOM imports; node-testable)
`createResilientListener({ label, subscribe, onNext, onError, env })` → `unsubscribe()`.
- `subscribe(next, error)` opens one underlying listener and returns its unsubscribe (the binding wraps `onSnapshot(target, …)`).
- `env = { setTimeout, clearTimeout, isHidden(), onVisible(cb) → off(), report(event) }`, all injected.
- `RETRYABLE = {'deadline-exceeded','unavailable','internal','unknown','resource-exhausted','cancelled'}`.
  `aborted` is excluded: the only SDK source is `terminate()`, and resubscribing to a terminated
  instance would throw. The app never calls terminate, so an `aborted` here would be unexpected → report it.
- On `next(snap)`: reset `failures = 0`, call `onNext(snap)`.
- On `error(err)`:
  - Always call `onError(err)` first, so callers' existing settle logic still runs
    (`checkDone`, `workStore.fail`, comments error UI, `setLoading(false)`).
  - If `err.code` isn't retryable → `report({level:'error', label, code, outcome:'permanent'})` unless the code is in
    `UNREPORTED_LISTENER_CODES` (permission-denied, failed-precondition, unauthenticated, not-found, the codes `beforeSend`
    drops, main.jsx:57-58), then stop. Same terminal state as today (Codex diff review B3).
  - If retryable: `failures++`. If `failures > MAX_FAILURES (6)` → `report({level:'error', label, code, gaveUp:true})`, stop.
    Otherwise `report({level:'warning', label, code, attempt: failures})` and schedule a resubscribe after
    `min(60s, 2s·2^(failures-1) + jitter(0–1s))` (the jitter goes inside the cap; Codex diff review B2). When the timer fires: if `isHidden()`, wait for `onVisible`, then resubscribe.
- `unsubscribe()`: sets `closed`, clears any timer and visibility hook, calls the current underlying unsubscribe. After `closed`, no callbacks and no resubscribes.
- `subscribe()` throwing (sync), on the first open or on a retry, is caught and routed into the same `error(err)`
  path. A throw with no `code` counts as permanent, so the state machine can't wedge (Codex GAP 3).
- Guard against stale callbacks: each subscription gets a generation number, so events from a superseded subscription are ignored.

### `src/utils/resilientSnapshot.js` (binding)
`onSnapshotResilient(label, target, onNext, onError)`: same shape as `onSnapshot` plus a leading label.
Wires `subscribe = (n, e) => onSnapshot(target, n, e)`, real timers, `document.visibilityState` /
`visibilitychange`, and `report` →
`Sentry.captureMessage('Firestore listener dropped', { level, tags: { listener: label, code, outcome }, fingerprint: ['firestore-listener-dropped', outcome] })`.
A `permanent` drop is also reported by the caller's own handler (handleErr / console.error), which is
accepted for codes that shouldn't occur, since the wrapper's event adds the listener label (Codex round 2). That gives **three** groups, one per `outcome` ∈ `retry|gave-up|permanent`. `captureMessage` has no
`originalException`, so `beforeSend`'s rule-code filter can't see these. The `permission-denied` skip happens
inside `report`'s caller (the lib) instead (Codex GAP 4).

### Call sites: mechanical swap, label per site
`onSnapshot(` → `onSnapshotResilient('<label>', ` at every realtime listener in:
`src/useFirestore.js` (18 core + 5 work arms + people-access set), `src/hooks/useSubscription.js`,
`useNotifications.js`, `useGlobalBanner.js`, `src/pages/VolunteerHome.jsx`, `SettingsPage.jsx` (banner; it has no
error callback today, so pass a no-op), `src/pages/hubs/JobsPage.jsx` (2), `WorkBoard.jsx` (comments, detail sync, …),
`src/components/board/ArchivedTasks.jsx`. Labels look like `items`, `work:shared`, `subscription`, `wb:comments`.
Error callbacks are unchanged.

### Supporting edits
- `handleErr`: rewrite the 2026-06-11 comment to say what the SDK does. **Its listener path imports
  `RETRYABLE_LISTENER_CODES` from `src/lib/resilientListener.js`** (Codex plan review B1/B2): one list, so
  `resource-exhausted` is warn-level there too, and `aborted` (not retried) gets full reporting. The local
  `TRANSIENT_LISTENER_CODES` set is deleted.
- `useSubscription`: the error path becomes `console.warn` for retryable codes (the wrapper reports), `console.error` otherwise.
- Docs, same commit: `src/CLAUDE.md` pitfall "a listener error is permanent; use `onSnapshotResilient`,
  never a raw `onSnapshot`", plus a `docs/CHANGELOG.md` entry correcting the 2026-06-11 one.

### Known, not fixing here
`checkDone()` counts every callback, not one per listener, so `loading` can clear before every
listener has delivered. That's existing behaviour. A resubscribe adds more counts, which can only make it clear sooner,
never hang it. Noted for the backlog.

## Tests
`functions/test/resilient-listener.test.mjs` (node --test, fake subscribe/timers/visibility). It covers: next resets failures;
a retryable error calls onError and then resubscribes after the backoff; a permanent error doesn't resubscribe and reports
`permanent` (except permission-denied); give-up after 6 consecutive failures; hidden → waits for visible; unsubscribe during the
backoff cancels it and no resubscribe happens; stale-generation callbacks are ignored; an aborted error is reported, not retried; a sync throw from subscribe is handled.
Plus a **guard test**: no raw `onSnapshot(` call in `src/` outside `src/utils/resilientSnapshot.js` (Codex GAP 2).
The binding stays a thin adapter with no logic; it's covered by the real-app check, not a unit test (GAP 1, accepted).

## Verification (scope stated)
- `npm run test:unit`, `npm run build`, `npm run lint` (0 errors).
- **Real-app check after deploy** (unit tests don't prove page lifecycle): on churchopshub.com as the e2e
  account, the app loads, hubs show data, and a live edit propagates between two tabs. That shows the wrapper didn't break
  normal delivery. **It doesn't exercise a real drop.** That can't be triggered on demand; the Sentry
  `firestore-listener-dropped` issue is how we'll learn whether, and how often, it happens.

## Results (2026-10-18)
- Codex: plan ×1 (REWORK, all folded in), diff ×2 (REWORK → SHIP WITH FIXES; fixes applied, the rest dismissed with reasons in
  the commit message). `npm run test:unit` 239/239, build clean, lint warnings identical before/after (52 → 52).
- **Real app on the local emulator** (Vite + Auth/Firestore emulators, seed account):
  1. Normal delivery: dashboard populated; an outside REST write to a supply showed up live (2 → 7 left).
  2. **Transport outage** (Firestore emulator killed for 45s): the SDK logged 7 `Listen stream transport errored`
     reconnect attempts with growing gaps, and **no app listener error callback fired**. That measures the SDK claim: blips don't reach `onError`.
  3. **Server-rejected targets on reconnect** (the emulator came back without the user profile, so rules failed): the SDK delivered the error
     to every listener's callback. The wrapper ran each caller's handler, didn't retry (rule codes), and the work-items banner showed. The
     supply card stayed at "7 left" while the database said 3: a listener that hits `onError` is dead, confirmed through the real SDK.
- Not exercised: a real **retryable** drop through the wrapper (can't be produced on demand). Production evidence will come
  from the Sentry `Firestore listener dropped` issues.
