// Shepherd Hub — Phase 1 PCO → Firestore read-sync (server-side only).
//
// Pulls the FXCC congregation from the Planning Center (PCO) People API into a
// minimized, elder-indexed Firestore cache. READ-ONLY against PCO; the only
// thing written is our own cache. No UI / notes / elder auth-gate yet — those
// are P2/P3 (see docs/SHEPHERD-HUB-PLAN.md).
//
// Mirrors the functions/lib/ics.js pattern: pure logic here, thin exports in
// index.js. The caller passes in `db` + `FieldValue` (admin SDK) and the
// already-resolved PCO secret values, so this module never touches secrets or
// initializes firebase-admin itself.
//
// Data minimization: we read an explicit allow-list of person attributes (never
// a spread) + emails/phones/addresses + medical_notes + a CLOSED set of 6
// pastoral custom fields. Everything else PCO exposes — MinistrySafe, background
// checks (incl. the `passed_background_check` person attribute), training
// scores, SOS, FSM, G6 Volunteer Status — is deliberately ignored.

const Sentry = require('@sentry/node');
const { DEFAULT_ROSTER, buildNormalizer } = require('./roster');

const PCO_BASE = 'https://api.planningcenteronline.com/people/v2';
const PCO_API_VERSION = '2026-06-04';

// Elder-assignment normalization is now data-driven from the roster (see
// lib/roster.js) — the caller passes opts.roster (the config/shepherdRoster
// doc) and we build the normalizer from it, falling back to DEFAULT_ROSTER.

// ── PCO REST client (Node 22 global fetch, no SDK) ─────────────────────────
function makePcoClient(appId, secret) {
  const auth = 'Basic ' + Buffer.from(`${appId}:${secret}`).toString('base64');
  const headers = { Authorization: auth, 'X-PCO-API-Version': PCO_API_VERSION };
  return async function get(url) {
    // PCO rate limit is generous (~100 req / 20s); still honor 429 backoff.
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, { headers });
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '2', 10);
        await new Promise(r => setTimeout(r, Math.max(1, retryAfter) * 1000));
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`PCO ${res.status} on ${url}: ${body.slice(0, 300)}`);
      }
      return res.json();
    }
    throw new Error(`PCO rate-limited (429) after retries on ${url}`);
  };
}

// Resolve the field-definition ids we care about, by name. The nested
// /field_definitions/{id}/field_data route 404s, so we read field data off the
// people page instead and match on these ids.
//
// Field names below are FXCC's ACTUAL PCO schema (verified against the live
// field_definitions list 2026-06-10). The plan's conceptual "Service Areas"
// has no backing field (the ministry selects Family Life/Worship/Coordination/
// Outreach are unpopulated), so it's dropped. "Strengths & Gifts" is two
// separate `checkboxes` fields, stored as string arrays (see PASTORAL_MULTI).
const PASTORAL_SINGLE = {  // single-value (string/select) → stored as a string
  'Elder Assigned':      'elderAssigned',
  'Date Baptized':       'dateBaptized',
  'Growth Group Member': 'growthGroupMember',
  'Discipleship':        'discipleship',
};
const PASTORAL_MULTI = {   // checkboxes → multiple FieldDatum rows → stored as string[]
  'Strengths':                    'strengths',
  'Gifts, Interests, & Abilities':'gifts',
};

async function resolveFieldDefs(get) {
  const defs = await get(`${PCO_BASE}/field_definitions?per_page=100`);
  const nameToId = {};
  const idToKey = {};      // pco field def id -> our key
  const multiKeys = new Set(); // our keys that accumulate into arrays
  const fieldDefs = {};    // ourKey -> { id, name } (stored in the status doc)
  for (const d of defs.data || []) {
    const name = (d.attributes?.name || '').trim();
    if (name) nameToId[name] = d.id;
  }
  for (const [pcoName, ourKey] of Object.entries(PASTORAL_SINGLE)) {
    const id = nameToId[pcoName];
    if (id) { idToKey[id] = ourKey; fieldDefs[ourKey] = { id, name: pcoName }; }
  }
  for (const [pcoName, ourKey] of Object.entries(PASTORAL_MULTI)) {
    const id = nameToId[pcoName];
    if (id) { idToKey[id] = ourKey; multiKeys.add(ourKey); fieldDefs[ourKey] = { id, name: pcoName }; }
  }
  // Hard guard: Elder Assigned is the spine. If PCO renamed/removed it, abort —
  // do NOT proceed and write a cache with everyone unassigned (which the
  // delete-missing pass would then treat as churn).
  if (!fieldDefs.elderAssigned) {
    const err = new Error('PCO field definition "Elder Assigned" not found — aborting sync (schema drift?).');
    Sentry.captureException(err, { tags: { area: 'shepherd-sync', reason: 'missing-elder-field' } });
    throw err;
  }
  return { idToKey, multiKeys, fieldDefs };
}

// ── Per-page included-object grouping ──────────────────────────────────────
function indexIncluded(included, idToKey, multiKeys) {
  const fieldByPerson = {};   // personId -> { ourKey: value | value[] }
  const emailsByPerson = {};
  const phonesByPerson = {};
  const addrsByPerson = {};
  for (const inc of included || []) {
    if (inc.type === 'FieldDatum') {
      const personId = inc.relationships?.customizable?.data?.id;
      const defId = inc.relationships?.field_definition?.data?.id;
      const ourKey = idToKey[defId];
      if (!personId || !ourKey) continue; // ignore every non-pastoral field (minimization)
      const val = inc.attributes?.value ?? null;
      const bag = (fieldByPerson[personId] ||= {});
      if (multiKeys.has(ourKey)) {
        // checkboxes arrive as one FieldDatum row per checked value — accumulate.
        if (val != null && val !== '') (bag[ourKey] ||= []).push(val);
      } else {
        bag[ourKey] = val;
      }
    } else if (inc.type === 'Email') {
      const pid = inc.relationships?.person?.data?.id;
      if (!pid) continue;
      (emailsByPerson[pid] ||= []).push({
        address: inc.attributes?.address || '',
        location: inc.attributes?.location || null,
        primary: !!inc.attributes?.primary,
      });
    } else if (inc.type === 'PhoneNumber') {
      const pid = inc.relationships?.person?.data?.id;
      if (!pid) continue;
      (phonesByPerson[pid] ||= []).push({
        number: inc.attributes?.number || inc.attributes?.national || '',
        location: inc.attributes?.location || null,
        primary: !!inc.attributes?.primary,
      });
    } else if (inc.type === 'Address') {
      const pid = inc.relationships?.person?.data?.id;
      if (!pid) continue;
      const a = inc.attributes || {};
      const street = [a.street_line_1, a.street_line_2].filter(Boolean).join(', ');
      (addrsByPerson[pid] ||= []).push({
        street, city: a.city || '', state: a.state || '', zip: a.zip || '',
        location: a.location || null, primary: !!a.primary,
      });
    }
  }
  return { fieldByPerson, emailsByPerson, phonesByPerson, addrsByPerson };
}

// Build the minimized cache doc for one person. Explicit allow-list of
// attributes — never spread PCO's attribute object.
function buildPersonDoc(person, grouped, syncGeneration, normalizer) {
  const a = person.attributes || {};
  const id = person.id;
  const pastoralRaw = grouped.fieldByPerson[id] || {};
  const pastoral = {
    elderAssigned:     pastoralRaw.elderAssigned ?? null,
    dateBaptized:      pastoralRaw.dateBaptized ?? null,
    growthGroupMember: pastoralRaw.growthGroupMember ?? null,
    discipleship:      pastoralRaw.discipleship ?? null,
    strengths:         pastoralRaw.strengths ?? [],   // StrengthsFinder themes (checkboxes)
    gifts:             pastoralRaw.gifts ?? [],        // spiritual gifts / interests / abilities (checkboxes)
  };
  const norm = normalizer.normalize(pastoral.elderAssigned);
  return {
    doc: {
      pcoId: id,
      firstName: a.first_name || null,
      lastName: a.last_name || null,
      nickname: a.nickname || null,
      name: a.name || [a.first_name, a.last_name].filter(Boolean).join(' ') || '(no name)',
      avatarUrl: a.avatar || null,
      birthdate: a.birthdate || null,
      anniversary: a.anniversary || null,
      gender: a.gender || null,
      membership: a.membership || null,
      status: a.status || null,                 // 'active' | 'inactive' — powers the "no longer attends" filter
      directoryStatus: a.directory_status || null,
      child: !!a.child,
      inactivatedAt: a.inactivated_at || null,
      emails: grouped.emailsByPerson[id] || [],
      phones: grouped.phonesByPerson[id] || [],
      addresses: grouped.addrsByPerson[id] || [],
      medicalNotes: a.medical_notes || null,    // sensitive, in-scope per spec
      pastoral,
      elderKeys: norm.elderKeys,
      orphaned: norm.orphaned,
      hasAssignment: norm.hasAssignment,
      syncGeneration,
    },
    norm,
  };
}

// ── Main orchestrator ──────────────────────────────────────────────────────
// db: admin Firestore; FieldValue: admin FieldValue; opts: { churchId, appId,
// secret, source }. Returns a summary object (also written to config/shepherdSync).
async function syncShepherdPeople(db, FieldValue, opts) {
  const { churchId, appId, secret, source = 'unknown', roster } = opts;
  if (!churchId) throw new Error('syncShepherdPeople: churchId required');
  if (!appId || !secret) throw new Error('syncShepherdPeople: PCO credentials required');

  const normalizer = buildNormalizer(roster || DEFAULT_ROSTER);
  const get = makePcoClient(appId, secret);
  const { idToKey, multiKeys, fieldDefs } = await resolveFieldDefs(get);

  const syncGeneration = Date.now();
  const peopleCol = db.collection(`churches/${churchId}/shepherdPeople`);

  // Count the existing cache up front for the delete-missing safety valve.
  const priorCount = (await peopleCol.count().get()).data().count;

  const writer = db.bulkWriter();
  writer.onWriteError((err) => {
    // Retry transient errors a few times; otherwise surface.
    if (err.failedAttempts < 5) return true;
    Sentry.captureException(err, { tags: { area: 'shepherd-sync', reason: 'bulkwriter' } });
    return false;
  });

  const perElderLoad = Object.fromEntries(normalizer.activeKeys.map(k => [k, 0]));
  const unmapped = new Set();
  let totalFetched = 0, assigned = 0, orphaned = 0;

  let url = `${PCO_BASE}/people?per_page=100&include=field_data,emails,phone_numbers,addresses`;
  while (url) {
    const page = await get(url);
    const grouped = indexIncluded(page.included, idToKey, multiKeys);
    for (const person of page.data || []) {
      totalFetched++;
      const { doc, norm } = buildPersonDoc(person, grouped, syncGeneration, normalizer);
      if (norm.hasAssignment) {
        assigned++;
        if (norm.orphaned) orphaned++;
        norm.elderKeys.forEach(k => { perElderLoad[k]++; });
        if (norm.unknown) unmapped.add((doc.pastoral.elderAssigned || '').toString().trim());
      }
      // Full overwrite (not merge): each run writes the complete intended
      // document, and these docs are CF-only-written, so a plain set keeps the
      // stored schema exactly current and auto-drops any retired fields.
      writer.set(peopleCol.doc(person.id), { ...doc, updatedAt: FieldValue.serverTimestamp() });
    }
    url = page.links?.next || null;
  }

  await writer.close(); // flush all upserts

  // Delete-missing: docs not touched this run = removed from PCO (or filtered out).
  let deleted = 0;
  const staleSnap = await peopleCol.where('syncGeneration', '<', syncGeneration).get();
  const staleCount = staleSnap.size;
  // Safety valve: never let a partial fetch nuke the cache.
  if (priorCount > 0 && staleCount > priorCount * 0.5) {
    Sentry.captureMessage(
      `shepherd-sync: delete-missing aborted — ${staleCount}/${priorCount} stale (>50%); likely a partial PCO fetch`,
      { level: 'warning', tags: { area: 'shepherd-sync', reason: 'delete-valve' } }
    );
  } else if (staleCount > 0) {
    const delWriter = db.bulkWriter();
    staleSnap.forEach(d => { delWriter.delete(d.ref); });
    await delWriter.close();
    deleted = staleCount;
  }

  const summary = {
    lastSyncAt: FieldValue.serverTimestamp(),
    source,
    totalFetched,
    stored: totalFetched,
    deleted,
    assigned,
    orphaned,
    perElderLoad,
    unmappedValues: [...unmapped].slice(0, 50),
    fieldDefs,
  };

  await db.doc(`churches/${churchId}/config/shepherdSync`).set(summary, { merge: true });

  // The withScheduledRun heartbeat stores the returned object as lastSummary;
  // serverTimestamp sentinels can't be returned cleanly, so swap to a number.
  return { ...summary, lastSyncAt: syncGeneration };
}

module.exports = {
  syncShepherdPeople,
};
