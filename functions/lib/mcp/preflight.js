// COH-016 — the checks the rules do NOT make. The app enforces these in UI code
// only, so the MCP server re-checks them before any Firestore REST call
// (spec §1). Pure: the caller reads users/{uid} and config/subscription with the
// Admin SDK (the only permitted Admin reads here) and hands the data in.

/**
 * @returns {{ok:true, canCreate:boolean} | {ok:false, status:number, message:string}}
 * `deps.subHasHub(sub, hub)` and `deps.canCreate(sub)` are the server
 * entitlement helpers (functions/index.js subHasHub; lib/entitlement.canCreate).
 */
function checkActor({ profile, keyChurchId, sub }, deps) {
  // Profile: exists, not deactivated, same church as the key. 401 — the caller
  // is no longer an acceptable principal.
  if (!profile || profile.active === false || !profile.churchId || profile.churchId !== keyChurchId) {
    return { ok: false, status: 401, message: 'Unauthorized.' };
  }
  // Tasks hub: userCanSeeHub('tasks') from src/App.jsx — the church has the hub
  // AND (admin OR allowedHubs null/missing OR it lists 'tasks').
  const subDoc = sub && typeof sub === 'object' && Object.keys(sub).length > 0 ? sub : null;
  if (!deps.subHasHub(subDoc || {}, 'tasks')) {
    return { ok: false, status: 403, message: 'The Tasks hub is not available for this church.' };
  }
  const allowed = profile.allowedHubs;
  const seesTasks = profile.role === 'admin' || !Array.isArray(allowed) || allowed.includes('tasks');
  if (!seesTasks) {
    return { ok: false, status: 403, message: 'This account does not have access to the Tasks hub.' };
  }
  // Lapsed: updates and comments stay allowed; only CREATE is refused.
  return { ok: true, canCreate: !!deps.canCreate(subDoc) };
}

module.exports = { checkActor };
