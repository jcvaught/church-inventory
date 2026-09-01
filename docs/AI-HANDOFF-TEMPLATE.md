# Agent Handoff Template

Copy this template into the task record, pull-request description, or a dated
handoff document. Do not include secrets, tokens, customer data, or production
credentials.

## Task

- Task ID and title:
- Owner:
- Reviewer:
- Branch:
- Commit(s):
- Status:

## Outcome

Briefly state what is now true. Lead with user or system behavior rather than a
file list.

## Changes

- Behavior changed:
- Files/components changed:
- Data, rules, or API changes:
- Documentation changed:

## Decisions and Assumptions

- Approved decisions applied:
- New decisions requiring owner confirmation:
- Assumptions made:

## Verification

List the exact commands, results, and any manual checks. Explicitly identify
tests that were not run and why.

```text
command — result
```

## Risk and Rollback

- Main risks:
- Compatibility or migration concerns:
- Rollback procedure:
- Production actions still requiring approval:

## Known Limitations

- Remaining limitations or follow-up tasks:

## Review Focus

Tell the reviewer where independent scrutiny is most valuable. For security
work, include direct API/SDK abuse cases. For UI work, include mobile,
accessibility, empty, loading, and failure states.

Ask for findings as test cases wherever one can be written — the fixture and the
assertion, not a description of them. The implementation owner integrates and
runs them. A reviewer who cannot execute the suite can still design the attack.

## Reviewer Findings

- Critical:
- High:
- Medium:
- Low:
- Questions:
- Verdict: Changes requested | Approved with follow-up | Approved

