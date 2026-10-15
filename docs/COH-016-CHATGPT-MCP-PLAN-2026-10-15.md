# COH-016 — Personal MCP server so ChatGPT can work John's tasks (2026-10-15)

**Owner ask:** "an API for ChurchOpsHub so that ChatGPT can log in as me and view my tasks and make
updates." Owner decisions (2026-10-15): ChatGPT may **change status, update fields and create
tasks**; it may **not reassign**. **John only** for now. Client = the ChatGPT desktop app,
Settings → Plugins → Add → **Add MCP server**, type **Streamable HTTP** (`URL` + `Bearer token env
var` + headers). Screenshot-verified; no OAuth. Two Codex plan passes (REWORK ×2, all findings
verified against code and folded in below).

**Acting account:** `jvaught@fxcc.org`, uid `RCFuTSK9ARfGF83v6TOS1Yf4Cnn2`, role admin, church
`6cksNI9Uv8h0jXptdTESnXTXFgF3-church` (FXCC). 124 tasks created and 66 assigned, measured
2026-10-15. His other account `jcvaught@gmail.com` (`DTd95wkCIpeYRnqP39dtU0VyNvU2`, role user) has
0 tasks and is NOT used.

## 1. Security model (read this first)

Cloud Functions' Admin SDK **skips Firestore rules**. Every task read and write therefore goes
through the **Firestore REST API using an ID token for the key's owner**, so `firestore.rules`
enforce membership, deactivation (`isMember` → `active`), COH-006 visibility, immutable fields and
COH-007 archive state exactly as they do for the browser. **Never use the Admin SDK for task,
comment, config/main or activityLog data in this feature.** The Admin SDK is only for the
`apiKeys` / `apiKeyUsage` collections (which clients cannot touch at all), minting the custom
token, and reading `users/{uid}` + `config/subscription` for the pre-checks below.

**The rules are not the whole boundary** (Codex pass 1). The app also enforces these in UI code only, so
the server re-checks them **before any Firestore call**:
1. Profile: `users/{uid}` exists, `active !== false`, `churchId` === key's churchId.
2. Tasks hub: `userCanSeeHub('tasks')` semantics from `src/App.jsx:779`: `subHasHub(sub,'tasks')`
   (the existing server helper in functions/index.js), AND (`role === 'admin'` OR `allowedHubs`
   null/missing OR includes `'tasks'`).
3. Lapsed: no **create** when the church is lapsed. Mirror `createBlocked` in
   `src/useFirestore.js` (read it, and use `functions/lib/entitlement.js` for the predicate).
   Updates and comments stay allowed (lapsed churches finish what they started).
4. Strict input schema (zod), unknown keys rejected:
   - `status` ∈ `Backlog | Planning | In Progress | On Hold | Complete | Cancelled`
     (`src/components/board/boardUI.jsx:10`)
   - `priority` ∈ the values the board offers (read WorkBoard/boardUI; `Medium` is the default)
   - `dueDate` `YYYY-MM-DD` or `''`; `recurrence` ∈ `RECURRENCE_FREQS` (`src/utils/date.js`) or `''`
   - `name` 1–200 chars; `description`/`notes` ≤ 10k; comment `text` 1–5k
   - `checklist`: array ≤ 100 of exactly the item shape the board writes (read WorkBoard
     checklist code; at minimum `{ text, done }`, plus whatever id field it uses)
   - **Never accepted:** assignees, assigneeUids, sharedWith, sharedWithUids, visibility,
     createdBy*, taskNumber, createdAt, archived*, type, photos, links, recurrence markers.
5. PATCH writes use a Firestore REST **`updateMask`** listing only the fields being written, so no
   other field can change even by mistake.

## 2. Keys

Collection **`apiKeys/{sha256hex}`** (top level):
`{ uid, churchId, label, createdAt, expiresAt, lastUsedAt, revokedAt }`. `expiresAt` = createdAt +
90 days and is immutable. Plaintext = `coh_` + 32 random bytes base64url, **shown once**, never
stored or logged.

`firestore.rules`: add explicit `match /apiKeys/{id} { allow read, write: if false; }` and the
same for `apiKeyUsage/{id}`. The global default may already deny; be explicit anyway.

Callables (all `wrapCall` + `assertActiveCaller` from functions/index.js):
- `createApiKey({ label })`: refuses unless `request.auth.uid` is in
  `API_KEY_ALLOWLIST = ['RCFuTSK9ARfGF83v6TOS1Yf4Cnn2']` (a constant with a comment; widening
  later = edit it). Max 5 unrevoked, unexpired keys per uid. Returns `{ key, id, expiresAt }`.
- `listApiKeys()`: the caller's own keys, without hashes beyond a short id prefix
  (label, createdAt, expiresAt, lastUsedAt, revoked).
- `revokeApiKey({ id })`: the caller's own keys only. Sets `revokedAt`.

Per-request key check: hash the Bearer value → get doc → 401 if missing, revoked or expired, or
if the uid is no longer in the allowlist. Update `lastUsedAt` at most once per minute.

## 3. Acting as the user

`createCustomToken(uid)` → POST
`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=<web apiKey from
src/firebase.js>` `{ token, returnSecureToken:true }` → `idToken`. Cache per uid in memory for
50 minutes. **Risk to verify at deploy:** `createCustomToken` on Gen-2 needs the runtime
service account to hold `iam.serviceAccounts.signBlob` (Service Account Token Creator on itself).
If the first prod call fails with a signBlob/IAM error, STOP and report. Granting IAM is an owner
call, not a build step.

Firestore REST base:
`https://firestore.googleapis.com/v1/projects/church-inventory-9615c/databases/(default)/documents`
with `Authorization: Bearer <idToken>`. Write a small `functions/lib/firestoreRest.js` with
value encode/decode (string, integer, double, boolean, null, map, array, timestamp), `get`,
`runQuery`, `beginTransaction`, `commit` (writes with `updateMask`, `currentDocument` preconditions,
and `updateTransforms` for `REQUEST_TIME`), `createDocument`. Unit-test the codec.

Map REST errors: 403/PERMISSION_DENIED → tool error "not permitted", 404 → "not found", and
anything else → Sentry + a generic error. Never echo Firestore error bodies to the client.

## 4. Tools (MCP)

Package: `@modelcontextprotocol/sdk` (+ `zod`). Add both to `functions/package.json` and the lockfile.
Stateless Streamable HTTP: a fresh `McpServer` + `StreamableHTTPServerTransport({
sessionIdGenerator: undefined })` per request, mounted in one
`exports.mcp = onRequest({ invoker:'public', cors:false, memory:'256MiB' }, …)`. Handle POST
(JSON-RPC); GET/DELETE → 405. Authenticate **before** handing the request to the transport.
Body limit 64 KB → 413. Logs carry key id prefix, tool name and task ids only, never content or
the key.

Tool ids: expose the **bare** id (no `task_` prefix); map internally to `workItems/task_<bare>`.
Reject anything whose fetched `type !== 'task'`.

- **`list_tasks({ status?, assignedToMe?, dueBefore?, includeComplete? })`**: run the board's
  four arms from `src/utils/workQueries.js:36-49` (team; own `createdBy==uid`; assigned
  `assigneeUids array-contains uid`; shared `visibility=='shared'` + `sharedWithUids
  array-contains uid`), each also `archived == false`, each `limit(300)`. Merge, dedupe by doc
  id, **filter `type === 'task'` after the merge** (as `src/utils/workMerge.js:27`), then apply
  filters (default excludes Complete and Cancelled unless `includeComplete` or an explicit status
  is given). Sort `createdAt` desc, return the first 100 + `truncated: boolean`. Each row: id,
  taskNumber, name, status, priority, dueDate, assignee names, visibility, tags, a
  short description snippet. If an arm needs a composite index that doesn't exist, the REST call
  fails. Report it; never fall back to the Admin SDK.
- **`get_task({ id })`**: full task fields (minus photos binary data) + comments (author,
  text, createdAt), via REST.
- **`create_task({ name, description?, priority?, status?, dueDate?, recurrence?, notes?,
  tags?, checklist? })`**: copy `addTask` (`src/useFirestore.js:881-924`) **exactly** in ONE REST
  transaction: read `churches/{c}/config/main` → `maxTaskNumber+1` → `TSK-###` → commit
  [update config/main (`updateMask: maxTaskNumber`), create `workItems/task_<newId>` with
  `currentDocument.exists=false`]. Read `newTaskDocRef` to get the id format. Document fields as
  in addTask: `type:'task'`, taskNumber, createdBy, createdByName (profile name), status default
  `Backlog`, priority default `Medium`, assignees = `[{ uid, name }]` in the exact
  object shape the board writes (read it), `assigneeUids:[uid]`, **visibility =
  `profile.taskDefaultVisibility || 'private'`, sharedWith = `profile.taskDefaultSharedWith || []`**
  (`WorkBoard.jsx:713-714`, the app's own new-task default; this is not reassignment),
  `sharedWithUids` derived from sharedWith, createdAt/updatedAt ISO strings, `completedAt:null`,
  `archived:false`, `archivedAt:null`, plus the remaining `getEmptyTask` defaults
  (`WorkBoard.jsx:586`). Then the activity log (§5) `add_task`, with the name only when visibility is
  not private/shared.
- **`update_task({ id, name?, description?, notes?, priority?, status?, dueDate?, recurrence?,
  tags?, checklist? })`**: get first (REST, as the user) → 404 or not a task → error. Mirror
  `updateTask` (`src/useFirestore.js:928-950`): `updatedAt` = now ISO; completedAt per
  `WorkBoard.jsx:1325-1329` (newly Complete → now; still Complete → keep; otherwise null when
  status changes). Commit with `updateMask` = exactly the written fields plus a
  `currentDocument.updateTime` precondition from the get. Activity log `complete_task` or
  `update_task` with `{status?}` (+ name only if visibility is not private/shared), itemId =
  taskNumber.
  **Recurrence** (when it becomes newly Complete and `recurrence` is set): port
  `createNextRecurringTask` (`WorkBoard.jsx:972-1016`): a transaction setting
  `nextRecurrenceCreatedAt` (ISO) on the source **only if absent**; if this call set it, build
  the successor exactly like `base` + the task branch (lines 984-1009: name, description,
  priority, tags, dueDate = `calculateNextDue` from `functions/lib/recurrence.js`, recurrence,
  assignees, checklist reset `done:false`, notes, photos [], visibility, sharedWith rule) and create
  it via the SAME numbering transaction as create_task. If the successor create fails, **roll back**
  the marker (delete field via updateMask with the field omitted) and return an error. Two
  concurrent Completes → exactly one successor.
- **`add_comment({ id, text })`**: create `workItems/task_<id>/comments/<auto>` with exactly
  `{ text, authorId: uid, authorName: profile.name, createdAt: ISO }` (rule at
  `firestore.rules:532-540`: keys hasOnly/hasAll, `isOwnDisplayName`).

## 5. Activity log

`churches/{c}/activityLog/<auto>`: `{ action, itemId, performedBy: uid, performedByName:
profile.name, timestamp: REQUEST_TIME transform, details: { ...as above, via: 'chatgpt' } }`.
The rule pins all three of performedBy, performedByName and `timestamp == request.time`
(`firestore.rules:404-411`). Use a commit with an `updateTransforms` `setToServerValue:
REQUEST_TIME` on `timestamp`. A failed log write is captured to Sentry and does not fail the tool,
matching `logActivity`.

## 6. Rate limit

`apiKeyUsage/{hash}` via an **Admin SDK transaction**: `{ windowStart, count }`. If more than 60
seconds have passed, reset; if `count >= 60` → 429; else increment. One doc per key; nothing piles up.

## 7. Settings UI

`src/pages/SettingsPage.jsx` (My Account area): a "Connect ChatGPT" card **rendered only when
`user.uid === 'RCFuTSK9ARfGF83v6TOS1Yf4Cnn2'`** (the server allowlist is the real gate). It offers:
create (label) → a modal showing the key once with Copy, plus "you won't see this again"; a list
(label, created, expires, last used, Revoke via ConfirmDialog); the MCP URL with Copy; and short setup
steps (Plugins → Add MCP server → Streamable HTTP → URL; Bearer token env var
`CHURCHOPSHUB_KEY`). Inline styles with `B` tokens like the rest of the page.

## 8. Tests (all must pass; add to existing scripts)

- `functions/test/firestore-rest.test.mjs` (unit): codec round-trips for every value type;
  updateMask building; REQUEST_TIME transform shape.
- `functions/test/mcp-schema.test.mjs` (unit): zod schemas reject a bad status, an extra key, any
  assignee/visibility field, an oversize name, and a malformed checklist.
- Handler tests (`functions/test/handlers/apiKeys.test.mjs`, auth emulator + firestore emulator,
  following `setup.mjs`): allowlist refuses other uids; 5-key cap; revoke is own keys only; the stored doc
  holds a hash, never the plaintext; expired and revoked keys → 401; the rate limiter's 61st → 429.
- Rules test: clients cannot read or write `apiKeys` / `apiKeyUsage`.
- Run: `npm run test:unit`, `npm run test:rules`, `npm run test:handlers`, `npm run lint`,
  `npm run build`, `node -c functions/index.js`.

## 9. Production verification (orchestrator, after Codex diff review — not the builder)

A one-off script `scripts/verify-coh016.mjs` using **e2e-test-church accounts** (temporarily
allowlisted in a test-only way that never ships, e.g. an env-gated second allowlist entry read
only when `COH016_VERIFY=1` is set at deploy. Or, simpler, mint a key doc directly with the
Admin SDK for the e2e member uid, delete it after). Checks:
member A's key cannot get/update a private task of member B (not permitted); a task A created
but isn't assigned to appears in list_tasks; bad status → error, nothing written; create gives
the next TSK number; a recurring Complete twice in parallel → one successor; a comment's author is
A; the activity log carries `via:'chatgpt'`; a deactivated user → 401; a revoked key → 401; a lapsed
test church refuses create and allows update. Clean up everything created.
Deploy: `firebase deploy --only functions:mcp,functions:createApiKey,functions:listApiKeys,functions:revokeApiKey --project church-inventory-9615c`, then `firestore:rules`, then curl the endpoint
without a key → 401 (invoker intact). Then John creates a key and does one real ChatGPT
round trip.
