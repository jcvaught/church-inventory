// Shepherd Hub — elder roster (single source of truth).
//
// The roster drives THREE things that must never drift:
//   1. claimElderRole's sign-in email allow-list (who gets the `elder` claim),
//   2. the PCO "Elder Assigned" name-matching in the sync (dirty free-text →
//      elder key, which yields each person's elderKeys / orphaned status),
//   3. the admin roster-management UI.
//
// At runtime the roster lives in Firestore at
// `churches/{churchId}/config/shepherdRoster` (editable via the admin UI). This
// file holds the DEFAULT used to seed that doc and as a safety fallback if the
// doc is missing/malformed — so a bad/absent config can never blank everyone's
// assignments on the next sync.
//
// Elder entry: { key, name, surname, emails[], match[], active, sabbatical }
//   key       — stable internal id, also the value stored in shepherdPeople.elderKeys
//   surname   — canonical token written back to PCO (joined by '/' for shared)
//   emails    — sign-in email(s) that grant the elder claim (lowercased on compare)
//   match     — substring patterns (lowercased, non-alpha stripped) recognized in
//               the dirty PCO field; include typo aliases (e.g. 'bingam')
//   active    — false = rolled off (no claim, not matched as a current elder)
//   sabbatical— still an elder, flagged in the UI; counts toward coverage
// Former entry: { key, match[] } — rolled-off elders still dirtying the field;
//   recognized so their people are correctly classed ORPHANED, not UNKNOWN.

const DEFAULT_ROSTER = {
  elders: [
    { key: 'bell',    name: 'David Bell',    surname: 'Bell',    emails: ['davidbell@fxcc.org'],            match: ['bell'],              active: true, sabbatical: false },
    { key: 'boyd',    name: 'Lance Boyd',    surname: 'Boyd',    emails: ['lboyd@fxcc.org'],                match: ['boyd'],              active: true, sabbatical: false },
    { key: 'bingham', name: 'Ray Bingham',   surname: 'Bingham', emails: ['rbingham@fxcc.org'],             match: ['bingham', 'bingam'], active: true, sabbatical: true  },
    { key: 'watkins', name: 'Steve Watkins', surname: 'Watkins', emails: ['steve@fxcc.org', 'swatkins@fxcc.org'], match: ['watkins'],     active: true, sabbatical: false },
    { key: 'reiman',  name: 'Paul Reiman',   surname: 'Reiman',  emails: ['preiman@fxcc.org'],              match: ['reiman'],            active: true, sabbatical: false },
    { key: 'reed',    name: 'Joel Reed',     surname: 'Reed',    emails: ['jreed@fxcc.org'],                match: ['reed'],              active: true, sabbatical: false },
    { key: 'mills',   name: 'Ivan Mills',    surname: 'Mills',   emails: ['imills@fxcc.org'],               match: ['mills'],             active: true, sabbatical: false },
    { key: 'cesone',  name: 'Dennis Cesone', surname: 'Cesone', emails: ['dennis@fxcc.org'],               match: ['cesone', 'ceso'],    active: true, sabbatical: false },
  ],
  former: [
    { key: 'coffman',  match: ['coffman'] },
    { key: 'reynolds', match: ['reynolds'] },
    { key: 'renner',   match: ['renner'] },
    { key: 'kerr',     match: ['kerr'] },   // also catches 'bakerr'
    { key: 'palmer',   match: ['palmer'] },
    { key: 'baither',  match: ['baither'] },
    { key: 'beckner',  match: ['beckner'] },
  ],
};

// Validate a Firestore roster doc; fall back to DEFAULT if missing/malformed.
function resolveRoster(docData) {
  if (docData && Array.isArray(docData.elders) && docData.elders.length > 0) {
    return {
      elders: docData.elders,
      former: Array.isArray(docData.former) ? docData.former : [],
    };
  }
  return DEFAULT_ROSTER;
}

// Lowercased sign-in emails of ACTIVE elders → the claim allow-list.
function rosterElderEmails(roster) {
  const out = [];
  for (const e of roster.elders || []) {
    if (e.active === false) continue;
    for (const em of e.emails || []) out.push(String(em).trim().toLowerCase());
  }
  return out;
}

function isElderEmail(roster, email) {
  return rosterElderEmails(roster).includes((email || '').trim().toLowerCase());
}

// Build the dirty-value normalizer from a roster. Mirrors the original
// substring approach from .scratch/pco-coverage.mjs but data-driven: active
// elders first (→ their key), then former (→ 'FORMER'), else 'UNKNOWN'.
function buildNormalizer(roster) {
  const patterns = []; // [substr, key|'FORMER']
  for (const e of roster.elders || []) {
    if (e.active === false) continue;
    for (const m of e.match || []) patterns.push([String(m).toLowerCase(), e.key]);
  }
  for (const f of roster.former || []) {
    for (const m of f.match || []) patterns.push([String(m).toLowerCase(), 'FORMER']);
  }
  const activeKeys = new Set((roster.elders || []).filter(e => e.active !== false).map(e => e.key));

  function mapSegment(seg) {
    const s = String(seg).toLowerCase().replace(/[^a-z]/g, '');
    for (const [pat, key] of patterns) if (s.includes(pat)) return key;
    return 'UNKNOWN';
  }

  function normalize(rawValue) {
    const raw = (rawValue ?? '').toString().trim();
    if (raw === '') return { elderKeys: [], orphaned: false, hasAssignment: false, unknown: false };
    const segKeys = raw.split('/').map(mapSegment);
    const elderKeys = [...new Set(segKeys.filter(k => activeKeys.has(k)))];
    return { elderKeys, orphaned: elderKeys.length === 0, hasAssignment: true, unknown: segKeys.includes('UNKNOWN') };
  }

  return { normalize, mapSegment, activeKeys: [...activeKeys] };
}

module.exports = { DEFAULT_ROSTER, resolveRoster, rosterElderEmails, isElderEmail, buildNormalizer };
