# COH-006 Gate 1 Re-review

## Review target

- Branch: `claude/coh-006-task-visibility`
- Reviewed tip: `855ed87`
- Fix commit: `0247791`
- Prior review: `f2f6b8f` (`docs/COH-006-GATE1-REVIEW-2026-08-31.md`)
- Reviewer: Codex
- Date: 2026-08-31

## Verdict

**Changes requested, for one low-severity repository artifact only.** The three
substantive findings from the first Gate-1 review are resolved. The corrected
five-query design is rule-compatible under both the deployed-at-Gate-1
transitional predicate and the final predicate specified for Gate 4, and the
declared shared-query composite index has the right scope and field modes.

Gate 1 is security-sound on the reviewed design. It is not ready to merge or
deploy from this tip because `0247791` also commits a machine-specific
`node_modules` symlink. Remove that tracked entry; it is the only requested
change from this re-review.

## Finding

### Low — L-1: the fix commit accidentally tracks an absolute `node_modules` symlink

`0247791` adds repository entry `node_modules` as a symlink whose committed
target is:

```text
/Users/johnvaught/apps/church-inventory/node_modules
```

The path is already intentionally ignored by `.gitignore`, and the reviewer
worktree guidance permits a temporary local dependency symlink, not a committed
one. This absolute target is specific to one machine and will be broken in a
normal checkout elsewhere; it can also interfere with a clean package install
or deployment build. Remove the tracked symlink from the branch while
preserving any local ignored `node_modules` arrangement needed for development.

No source, rules, index, or documentation change beyond removing that repository
entry is requested.

## Disposition of the prior findings

### H-1 — resolved

The planned shared-recipient listener is now:

```js
query(
  workItemsRef,
  where('visibility', '==', 'shared'),
  where('sharedWithUids', 'array-contains', uid),
)
```

That shape is compatible with the transitional rule because every potential
result proves `resource.data.visibility == 'shared'`; the recipient constraint
only narrows that already-authorized set. It is compatible with the planned
Gate-4 rule because every potential result proves both parts of the final
shared-recipient arm: Shared visibility and recipient membership.

The stale-recipient test correctly locks the important document-level negative:
a private task carrying `sharedWithUids: [uid]` does not authorize that recipient.
The exact compound listener does not exist in client code until Gate 3, so its
positive query execution and production index probe remain Gate-3 prerequisites,
not a Gate-1 blocker.

### M-1 — resolved

The premature Help Centre sentence is removed. The workboard and DEC-2026-012
now schedule the capability claim for Gate 4 and correctly require a specific
audit event before claiming that the log identifies the person added.

### L-1 — resolved

The transitional assignee arm now requires `assigneeUids is list`. The coverage
includes an absent field, an empty list, and a malformed map; the malformed map
therefore cannot exploit Rules' map-key behavior for `in`.

## Requested query compatibility analysis

Firestore evaluates a list query against its potential result set, so each
listener must prove at least one authorization arm for every result. The planned
set does:

| Listener constraint | Transitional Gate-1 rule | Planned Gate-4 rule |
| --- | --- | --- |
| `type == 'maintenance'` | Proves the maintenance arm | Proves the retained maintenance arm |
| `visibility == 'team'` | Proves the team arm | Proves the retained team arm |
| `createdBy == uid` | Proves the creator arm | Proves the retained creator arm |
| `assigneeUids array-contains uid` | Proves list shape and membership for the new assignee arm | Proves the authoritative assignee arm, which intentionally applies regardless of visibility |
| `visibility == 'shared'` plus `sharedWithUids array-contains uid` | The visibility constraint proves the transitional Shared arm | Together they prove the final shared-recipient arm |

The assigned-to-me listener does **not** repeat the former shared-listener bug.
Assignment is intentionally visibility-independent: the product promise is that
assignees always see their tasks. `array-contains` matches array fields, so it
also satisfies the rule's list-type guard; it cannot select the malformed-map
shape covered by the new negative test.

This conclusion is about the final predicate specified in the workboard. Gate 4
must still be reviewed against its actual rule text when implemented.

## Requested index analysis

The declaration is correct for the planned query:

```json
{
  "collectionGroup": "workItems",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "visibility", "order": "ASCENDING" },
    { "fieldPath": "sharedWithUids", "arrayConfig": "CONTAINS" }
  ]
}
```

- `COLLECTION` is the right scope because the client queries one concrete
  `churches/{churchId}/workItems` collection, not a `collectionGroup()` across
  churches.
- `visibility` uses an ordered index segment for the equality predicate;
  ascending is valid.
- `sharedWithUids` correctly uses `arrayConfig: "CONTAINS"` for
  `array-contains`.
- No `orderBy` is planned, so no additional ordered segment is needed.

The workboard correctly retains the production probe. A syntactically correct
declaration is not evidence that the collection-scope index was actually
provisioned, particularly given this repository's recorded deploy behavior.

## Verification and confidence

- Reviewed the complete diffs for `0247791` and `855ed87`, the Gate-1 rules,
  rules tests, index declaration, amended workboard, DEC-2026-012, and the
  DEC-2026-011 addendum.
- Confirmed with `git ls-tree` that `node_modules` is committed as mode `120000`
  with an absolute machine-local target.
- `git diff --check f2f6b8f..855ed87`: clean.
- `npm run test:rules`: **not run**. This sandbox cannot bind the emulator ports.
  The owner's reported **40 pass, 0 fail** therefore stands unreproduced.
- An exact-tip attempt at `npm run test:unit`, `npm run lint`, and `npm run build`
  could not reproduce the owner's toolchain because the reusable dependency tree
  available to this worktree lacks `@sentry/node`, `eslint`, and `vite`. The
  failures occurred in dependency/tool resolution, not in an assertion, lint
  diagnostic, or build compilation. The prior review independently reproduced
  **118 unit tests passing** at `b222240`; the reviewed fix changes no unit-tested
  production logic.
- No emulator, production E2E, deploy, production read, or production write was
  performed.

The unreproduced rules run lowers confidence from high to **moderate-high**. The
rule/query proof is straightforward and the new direct-get cases are well
targeted, but I cannot claim behavioral verification of the Rules engine. The
required Gate-3 exact-query test and owner-authorized production probe remain
important before the old reader is removed.
