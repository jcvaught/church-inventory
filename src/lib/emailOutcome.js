// Jobs Hub email-callable outcomes (2026-10-18). invokeEmailCF returns the
// callable's data on success, null when it failed (and was reported to Sentry),
// or EMAIL_UNCONFIRMED when the client timed out while the tab was backgrounded
// — the server may well have sent it, and nothing was reported. Pure;
// functions/test/email-outcome.test.mjs.
export const EMAIL_UNCONFIRMED = Object.freeze({ unconfirmed: true });

export const NO_EMAIL_OUTCOME = Object.freeze({ failed: 0, unconfirmed: 0, total: 0 });

export function tallyEmailResults(results, total = results.length) {
  let failed = 0;
  let unconfirmed = 0;
  for (const r of results) {
    const v = r && r.status === 'fulfilled' ? r.value : null; // a rejected invoke counts as failed
    if (v === null) failed++;
    else if (v === EMAIL_UNCONFIRMED) unconfirmed++;
  }
  return { failed, unconfirmed, total };
}

// ' …' sentence(s) to append to the caller's one final toast, or ''.
export function emailOutcomeNote({ failed = 0, unconfirmed = 0, total = 0 } = {}) {
  const of = (n) => `${n} of ${total} cancellation email${total !== 1 ? 's' : ''}`;
  let note = '';
  if (failed > 0) note += ` ${of(failed)} failed to send. Admins were notified.`;
  if (unconfirmed > 0) note += ` ${of(unconfirmed)} couldn't be confirmed (the app was in the background).`;
  return note;
}

export function emailOutcomeIsProblem(o) {
  return !!o && (o.failed > 0 || o.unconfirmed > 0);
}
