import { getFunctions, httpsCallable } from 'firebase/functions';

// Fire-and-forget in-app + push notification. Email stays owned by the existing
// per-event email CFs — this only adds the two new channels. Called from client
// producers (reservation decision, ticket/task assignment, @mention) right
// alongside their existing email CF call. Never blocks the underlying action.
//   payload: { churchId, recipientUids: string[], type, title, body, link }
export function notify(payload) {
  try {
    const fn = httpsCallable(getFunctions(), 'notify');
    return fn(payload).catch((err) => { console.error('[ChurchOpsHub] notify failed', err); });
  } catch (e) {
    console.error('[ChurchOpsHub] notify failed', e);
    return Promise.resolve();
  }
}
