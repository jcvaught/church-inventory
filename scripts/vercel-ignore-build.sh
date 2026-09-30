#!/usr/bin/env bash
# Vercel "Ignored Build Step" — skip production builds when nothing but docs changed
# SINCE THE LAST SUCCESSFUL DEPLOYMENT.
#
# Exit 0 = SKIP the build. Exit 1 = BUILD.
#
# WHY: docs-only commits were triggering full production deploys, and Vercel bills
# retained build output as Deployment Storage. COH made 20 such deploys in two days.
#
# THE BASE IS THE LAST DEPLOYED COMMIT, NOT HEAD^ (fixed 2026-09-30, ES S252). The
# first version diffed HEAD^..HEAD, so a push of several commits whose LAST one was
# docs-only skipped the build and silently dropped every code commit beneath it —
# seven commits of the partial-verse feature sat unshipped for hours while "pushed"
# read as "live". Vercel exposes VERCEL_GIT_PREVIOUS_SHA (the SHA of the last
# successful deployment) only to an Ignored Build Step; diffing from it covers every
# commit in the push.
#
# FAILS OPEN: any time the diff cannot be determined (variable unset, commit not
# fetchable from the shallow clone, git error) this exits 1 and builds. A missed
# skip costs a few MB of storage; a missed build ships nothing. Never make this fail
# closed.
#
# SEMANTICS (verified in a production build log 2026-09-30: the variable held the last
# successful PRODUCTION deployment's commit on main). Vercel scopes it per branch, so on a
# preview branch it is that branch's last successful deployment — skipping a docs-only
# preview is intended. The diff compares the DEPLOYED tree with the NEW tree, not a commit
# range, so it stays correct after a force-push or history rewrite (no ancestry needed —
# and ancestry can't be checked in Vercel's shallow clone anyway).
#
# WHAT COUNTS AS DOCS is deliberately narrow: `docs/`, top-level `*.md`, and `README.md`
# files anywhere. Any other markdown (e.g. a future `content/post.md` read at build time)
# counts as code and builds.
#
# NOTE: a skipped push means "pushed to main" does not imply "a new deployment
# exists". Verify a content marker on the live site before announcing anything.
set -u

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ]; then
  echo "vercel-ignore-build: no VERCEL_GIT_PREVIOUS_SHA (first deploy, or not set) — building."
  exit 1
fi

# Vercel clones shallow, so the previous deployment's commit may be absent.
# `git diff A B` needs only the two commits' trees, so fetching the base alone suffices.
if ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=1 origin "$base" 2>/dev/null || true
fi
if ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo "vercel-ignore-build: last deployed commit $base not reachable — building."
  exit 1
fi

# `git diff --quiet` exits 1 on changes and 128 on error, so any error falls to BUILD.
if git diff --quiet "$base" HEAD -- . \
     ':(exclude)docs/' \
     ':(top,glob,exclude)*.md' \
     ':(glob,exclude)**/README.md' 2>/dev/null; then
  echo "vercel-ignore-build: only docs changed since $base — skipping build."
  exit 0
fi

echo "vercel-ignore-build: code changed since $base — building."
exit 1
