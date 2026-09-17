#!/bin/zsh
# COH-012 A.4.0 — the entitlement consumer inventory, generated, not remembered.
#
# Four plan revisions each carried a hand-written table of "every file that
# reads the subscription model", and each table was incomplete (COH-012 plan,
# rounds 1–3 and 5). This script IS the inventory. Run it at every A.4 commit;
# the A.4 grep gate is "every file printed here has a disposition in the plan".
#
#   scripts/entitlement-inventory.sh            # file-level counts per symbol
#   scripts/entitlement-inventory.sh -l         # every matching line
#
# Excluded on purpose:
#   functions/test/rules/fixtures/transitional-archive-2026-09-07.rules — a
#   frozen snapshot of the pre-COH-007 rules kept for the cutover-sentinel
#   test. It must NOT change when the live rules do; that is its whole job.
set -e
cd "$(dirname "$0")/.."

mode=count
[[ "$1" == "-l" ]] && mode=lines

# The fields, constants, and functions that together ARE the entitlement
# model today. `hubs` alone is too noisy (UI prose), so its load-bearing
# forms are matched instead of the bare word.
symbols=(
  freeHubsSelected
  trialHubs
  trialEndsAt
  trialExpiredAt
  trialWarningEmailSentAt
  grandfathered
  'pro_monthly\|pro_annual'
  'TRIAL_HUBS\|PRO_HUBS'
  'hasHub\|subHasHub'
  'canAddUser\|FREE_PLAN_MAX_USERS\|maxUsers'
  'isTrialing\|trialDaysRemaining'
  'UPGRADE_PRICES\|hubPrice'
  "plan === 'pro'\|plan === 'all_in'\|plan == 'pro'\|plan == 'all_in'\|plan: 'pro'\|plan: 'all_in'"
  'update\.hubs\|hubs: \[\]\|hubs: PRO_HUBS\|subscription?\.hubs\|sub\.hubs\|s\.hubs'
)

roots=(src functions/index.js functions/lib functions/test firestore.rules scripts e2e docs/BUSINESS_MODEL.md)
exclude='--exclude-dir=node_modules --exclude-dir=dist --exclude=transitional-archive-2026-09-07.rules --exclude=entitlement-inventory.sh'

for sym in "${symbols[@]}"; do
  echo "## $sym"
  if [[ $mode == lines ]]; then
    grep -rn ${=exclude} -e "$sym" "${roots[@]}" || true
  else
    grep -rc ${=exclude} -e "$sym" "${roots[@]}" 2>/dev/null | grep -v ':0$' | sort -t: -k2 -nr || true
  fi
  echo
done
