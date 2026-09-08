#!/usr/bin/env bash
# Vercel "Ignored Build Step" — skip production builds for docs-only commits.
#
# Exit 0 = SKIP the build. Exit 1 = BUILD.
#
# WHY: docs-only commits were triggering full production deploys, and Vercel bills
# retained build output as Deployment Storage. COH made 20 such deploys in two days.
#
# FAILS OPEN: any time the diff cannot be determined (shallow clone, first commit,
# git error) this exits 1 and builds. A missed skip costs a few MB of storage; a
# missed build ships nothing. Never make this fail closed.
#
# NOTE: a skipped commit means "pushed to main" no longer implies "a new deployment
# exists". See the staged-deploy-ordering rule.
set -u

# Vercel clones shallow by default, so HEAD^ often does not exist.
if ! git rev-parse --verify --quiet 'HEAD^' >/dev/null 2>&1; then
  echo "vercel-ignore-build: no parent commit reachable (shallow clone or first commit) — building."
  exit 1
fi

# For a merge commit HEAD^ is the first parent, so everything the merge brought in
# reads as changed and the build proceeds. That is the behaviour we want.
if git diff --quiet 'HEAD^' HEAD -- . \
     ':(exclude)docs/' \
     ':(exclude)*.md' \
     ':(exclude)**/*.md' 2>/dev/null; then
  echo "vercel-ignore-build: only docs/ and markdown changed — skipping build."
  exit 0
fi

echo "vercel-ignore-build: code changed — building."
exit 1
