// Shepherd Hub — elders-only congregation view (read-only directory, P3 slice 1).
//
// Reads the Cloud-Function-synced cache (churches/{id}/shepherdPeople) + the
// elder roster (config/shepherdRoster). Access is enforced by Firestore rules
// (isElder() || isChurchAdmin); this page just renders. Notes, the assignment
// editor, and the worklist arrive in later slices.
//
// "My Flock" = people whose elderKeys contains the logged-in elder's key.
// Admins have no flock of their own, so they get a "View as [elder]" picker to
// preview any elder's flock (and demo the hub before elders log in).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection, getDocs, getDoc, query, where, orderBy, doc, setDoc, addDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as Sentry from '@sentry/react';
import { db } from '../../firebase.js';
import { B, f1, f2, inp, btnP, btnS, btnD } from '../../components/brand/tokens.js';
import { Modal } from '../../components/primitives/Modal.jsx';
import { exportShepherdPeopleCSV } from '../../utils/csv.js';

const SHEPHERD_CHURCH_ID = '6cksNI9Uv8h0jXptdTESnXTXFgF3-church';
// Only non-elder allowed into the hub (admin side) — mirrors firestore.rules
// isShepherdAdmin() + functions OWNER_EMAILS.
const SHEPHERD_ADMIN_EMAILS = ['jcvaught@gmail.com', 'jvaught@fxcc.org'];

// Append a row to the shepherd audit log. Best-effort — never block the UI.
async function logShepherdAudit(action, person, userProfile, detail) {
  try {
    await addDoc(collection(db, `churches/${SHEPHERD_CHURCH_ID}/shepherdAudit`), {
      action,
      personId: person?._id || person?.pcoId || null,
      personName: person?.name || null,
      actorUid: userProfile.uid,
      actorName: userProfile.name || null,
      actorEmail: userProfile.email || null,
      at: serverTimestamp(),
      ...(detail ? { detail } : {}),
    });
  } catch (e) {
    Sentry.captureException(e, { tags: { area: 'shepherd-hub', fn: 'audit' } });
  }
}

function fmtTime(ts) {
  const d = ts?.toDate?.() || (ts ? new Date(ts) : null);
  if (!d) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Match a search query against name, email, or phone (UX-5) — elders often look
// someone up from a missed call or an email, not just by name.
function personMatches(p, q) {
  if (!q) return true;
  if ((p.name || '').toLowerCase().includes(q)) return true;
  if ((p.emails || []).some(e => (e.address || '').toLowerCase().includes(q))) return true;
  const digits = q.replace(/\D/g, '');
  if (digits && (p.phones || []).some(ph => (ph.number || '').replace(/\D/g, '').includes(digits))) return true;
  return false;
}

// Client-side text-file download (used for an elder's "Export my notes").
function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

const chip = (bg, color) => ({
  display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11,
  fontWeight: 700, fontFamily: f1, background: bg, color, letterSpacing: 0.2,
});

function StatusBadge({ status }) {
  const active = status === 'active';
  return <span style={chip(active ? B.tealPale : B.warmGray, active ? B.teal : B.textLight)}>
    {active ? 'Active' : (status || 'unknown')}
  </span>;
}

export function ShepherdHubPage({ userProfile, isElder }) {
  const [people, setPeople] = useState([]);
  const [roster, setRoster] = useState({ elders: [], former: [] });
  const [syncInfo, setSyncInfo] = useState(null);   // config/shepherdSync (freshness + collisions)
  const [fullyLoaded, setFullyLoaded] = useState(false); // false during the flock-first paint
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [visibleCount, setVisibleCount] = useState(100); // render cap (UX-1)

  const [view, setView] = useState('flock');        // 'flock' | 'all'
  const [viewAsKey, setViewAsKey] = useState(null); // admin: which elder's flock to preview
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'inactive' | 'all'
  const [assignFilter, setAssignFilter] = useState('all');    // 'all' | 'assigned' | 'unassigned' | 'orphaned'
  const [sortBy, setSortBy] = useState('first');              // 'first' | 'last' (last groups families)
  const [selected, setSelected] = useState(null);
  const [showRoster, setShowRoster] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [exportingNotes, setExportingNotes] = useState(false);
  const [exportMsg, setExportMsg] = useState(null);
  const isAdmin = SHEPHERD_ADMIN_EMAILS.includes((userProfile?.email || '').toLowerCase());

  // Let an elder download their own private notes (e.g. before rolling off the
  // eldership — their notes are purged when an admin removes them). Server-side
  // gather so we don't need a client collectionGroup index.
  async function exportMyNotes() {
    setExportingNotes(true); setExportMsg(null);
    try {
      const res = await httpsCallable(getFunctions(), 'exportMyShepherdNotes')();
      const notes = res.data?.notes || [];
      if (!notes.length) { setExportMsg('You have no private notes to export.'); return; }
      const body = notes.map(n =>
        `=== ${n.personName} ===\n${n.text}${n.updatedAt ? `\n(updated ${fmtTime(n.updatedAt)})` : ''}`
      ).join('\n\n');
      downloadText('my-shepherd-notes.txt', `My Shepherd Notes\n\n${body}\n`);
      logShepherdAudit('export_my_notes', null, userProfile, { count: notes.length });
    } catch (e) {
      setExportMsg(e?.message || 'Could not export your notes.');
      Sentry.captureException(e, { tags: { area: 'shepherd-hub', fn: 'export-my-notes' } });
    } finally { setExportingNotes(false); }
  }

  // Merge a reassignment result into local state (list + open detail).
  function patchPerson(personId, patch) {
    setPeople(ps => ps.map(p => p._id === personId ? { ...p, ...patch } : p));
    setSelected(s => (s && s._id === personId ? { ...s, ...patch } : s));
  }

  const myEmail = (userProfile?.email || '').trim().toLowerCase();
  const myUid = userProfile?.uid;

  // Load roster + sync status + congregation cache. Flock-first (UX-1): an elder
  // sees their own flock almost instantly (a small array-contains query — no
  // composite index since we don't orderBy), then the full congregation streams
  // in behind it for the All / worklist / departed views and the coverage counts.
  // Reusable so "Save & re-sync" can refetch (UX-4). React 18 makes a post-unmount
  // setState a no-op, so no cancelled guard is needed.
  const load = useCallback(async () => {
    setErr(null); setFullyLoaded(false);
    try {
      const base = `churches/${SHEPHERD_CHURCH_ID}`;
      // Read single docs directly — NOT a list over the config collection (denied).
      const [rosterSnap, syncSnap] = await Promise.all([
        getDoc(doc(db, `${base}/config/shepherdRoster`)),
        getDoc(doc(db, `${base}/config/shepherdSync`)).catch(() => null),
      ]);
      const r = rosterSnap.exists() ? rosterSnap.data() : { elders: [], former: [] };
      setRoster({ elders: r.elders || [], former: r.former || [] });
      if (syncSnap && syncSnap.exists()) setSyncInfo(syncSnap.data());
      const myRow = (r.elders || []).find(e => (e.emails || []).some(em => String(em).toLowerCase() === myEmail));
      const key = myRow?.key || null;
      if (key) {
        const flockSnap = await getDocs(query(collection(db, `${base}/shepherdPeople`), where('elderKeys', 'array-contains', key)));
        setPeople(flockSnap.docs.map(d => ({ _id: d.id, ...d.data() })));
        setLoading(false); // paint the flock now
      }
      const allSnap = await getDocs(query(collection(db, `${base}/shepherdPeople`), orderBy('name')));
      setPeople(allSnap.docs.map(d => ({ _id: d.id, ...d.data() })));
      setFullyLoaded(true);
    } catch (e) {
      setErr(e?.message || 'Failed to load Shepherd Hub.');
      Sentry.captureException(e, { tags: { area: 'shepherd-hub', fn: 'load' } });
    } finally {
      setLoading(false);
    }
  }, [myEmail]);

  useEffect(() => { load(); }, [load]);

  // Reset the render cap whenever the visible set changes (UX-1). Depends on
  // viewAsKey (state, declared above) rather than the derived activeKey to avoid
  // a TDZ on the dep array, which React evaluates during render.
  useEffect(() => { setVisibleCount(100); }, [view, search, statusFilter, assignFilter, sortBy, viewAsKey]);

  // The logged-in elder's own key (null for a non-elder admin).
  const myKey = useMemo(() => {
    const mine = (roster.elders || []).find(e => (e.emails || []).some(em => String(em).toLowerCase() === myEmail));
    return mine?.key || null;
  }, [roster, myEmail]);

  // Whose flock are we showing? Elder → own key; admin → the picked elder.
  const activeKey = myKey || viewAsKey;
  const activeElder = (roster.elders || []).find(e => e.key === activeKey) || null;
  const elderName = (key) => (roster.elders || []).find(e => e.key === key)?.name || key;

  // Default an admin's "view as" to the first elder so the picker isn't empty.
  useEffect(() => {
    if (!myKey && !viewAsKey && (roster.elders || []).length) setViewAsKey(roster.elders[0].key);
  }, [myKey, viewAsKey, roster]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = people.filter(p => {
      // Departed view: people no longer in PCO that the *logged-in* elder has
      // pastoral notes on (independent of any admin "view as"). Every other view
      // hides departed people entirely so they never pollute the active roster.
      if (view === 'departed') {
        if (!p.removedFromPco || !(p.pastoralStakeholderUids || []).includes(myUid)) return false;
        if (!personMatches(p, q)) return false;
        return true;
      }
      if (p.removedFromPco) return false;
      if (view === 'flock') {
        if (!activeKey || !(p.elderKeys || []).includes(activeKey)) return false;
      }
      if (view === 'worklist' && !p.orphaned) return false;
      if (statusFilter === 'active' && p.status !== 'active') return false;
      if (statusFilter === 'inactive' && p.status === 'active') return false;
      if (view === 'all') {
        if (assignFilter === 'assigned' && !p.hasAssignment) return false;
        if (assignFilter === 'unassigned' && p.hasAssignment) return false;
        if (assignFilter === 'orphaned' && !p.orphaned) return false;
      }
      if (!personMatches(p, q)) return false;
      return true;
    });
    // Sort key. 'last' groups families together (last name, then first as
    // tiebreak); 'first' keeps the original given-name order. Fall back to the
    // full name when the split first/last fields are missing.
    const lastOf = (p) => (p.lastName || (p.name || '').trim().split(/\s+/).slice(-1)[0] || '').toLowerCase();
    const firstOf = (p) => (p.firstName || p.name || '').toLowerCase();
    result.sort(sortBy === 'last'
      ? (a, b) => lastOf(a).localeCompare(lastOf(b)) || firstOf(a).localeCompare(firstOf(b))
      : (a, b) => firstOf(a).localeCompare(firstOf(b)) || lastOf(a).localeCompare(lastOf(b)));
    return result;
  }, [people, view, activeKey, statusFilter, assignFilter, search, sortBy, myUid]);

  // Coverage counts (present, active people only) for the header strip — departed
  // people are excluded so they don't inflate the congregation totals.
  const coverage = useMemo(() => {
    const present = people.filter(p => !p.removedFromPco);
    const active = present.filter(p => p.status === 'active');
    return {
      total: present.length,
      active: active.length,
      assigned: active.filter(p => p.hasAssignment).length,
      orphaned: active.filter(p => p.orphaned).length,
    };
  }, [people]);

  // Departed people the logged-in elder still holds notes on — drives the
  // "No longer in PCO" tab (shown only when there's something to review).
  const myDeparted = useMemo(
    () => people.filter(p => p.removedFromPco && (p.pastoralStakeholderUids || []).includes(myUid)),
    [people, myUid]
  );

  // Upcoming birthdays/anniversaries in the active flock within the next week
  // (UX-3) — the data is already synced; this just surfaces it where an elder
  // will act on it. Year-agnostic: compares month/day against the next 7 days.
  const flockUpcoming = useMemo(() => {
    if (!activeKey) return [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const out = [];
    const consider = (p, dateStr, icon, label) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '');
      if (!m) return;
      const mo = +m[2] - 1, da = +m[3];
      let next = new Date(today.getFullYear(), mo, da);
      if (next < today) next = new Date(today.getFullYear() + 1, mo, da);
      const days = Math.round((next - today) / 86400000);
      if (days <= 6) out.push({ key: `${p._id}-${label}`, name: p.name, icon, when: next, days });
    };
    people.forEach(p => {
      if (p.removedFromPco || p.status !== 'active' || !(p.elderKeys || []).includes(activeKey)) return;
      consider(p, p.birthdate, '🎂', 'b');
      consider(p, p.anniversary, '💍', 'a');
    });
    return out.sort((a, b) => a.days - b.days);
  }, [people, activeKey]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: B.textLight, fontFamily: f2 }}>Loading Shepherd Hub…</div>;
  if (err) return <div style={{ padding: 24, color: B.red, fontFamily: f2 }}>{err}</div>;

  const Tab = ({ id, label }) => (
    <button onClick={() => setView(id)} style={{
      padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
      fontSize: 13, fontWeight: 700, fontFamily: f1,
      background: view === id ? B.teal : B.white, color: view === id ? B.white : B.textMid,
      boxShadow: view === id ? 'none' : `inset 0 0 0 1px ${B.sand}`,
    }}>{label}</button>
  );

  return (
    <div style={{ fontFamily: f2 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontFamily: f1, fontSize: 22, fontWeight: 800, color: B.navy, margin: 0 }}>🐑 Shepherd Hub</h2>
          <p style={{ margin: '4px 0 0', color: B.textLight, fontSize: 13 }}>
            {coverage.active} active · {coverage.assigned} shepherded · {coverage.orphaned} need reassignment
            {syncInfo?.lastSyncAt && <> · <span title="Last Planning Center sync">updated {fmtTime(syncInfo.lastSyncAt)}</span></>}
            {!fullyLoaded && <> · <span style={{ color: B.teal }}>loading congregation…</span></>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {!myKey && (
            <>
              <span style={{ fontSize: 12, fontWeight: 700, color: B.textMid, fontFamily: f1 }}>View as</span>
              <select value={viewAsKey || ''} onChange={e => setViewAsKey(e.target.value)} style={{ ...inp, width: 'auto', padding: '8px 12px' }}>
                {(roster.elders || []).map(e => (
                  <option key={e.key} value={e.key}>{e.name}{e.sabbatical ? ' (sabbatical)' : ''}</option>
                ))}
              </select>
            </>
          )}
          {isElder && <button onClick={exportMyNotes} disabled={exportingNotes} style={{ ...btnS, padding: '8px 14px', opacity: exportingNotes ? 0.5 : 1 }}>{exportingNotes ? 'Exporting…' : '⬇ Export my notes'}</button>}
          <button onClick={() => setShowPrivacy(true)} style={{ ...btnS, padding: '8px 14px' }}>🔒 Privacy</button>
          {isAdmin && <button onClick={() => setShowRoster(true)} style={{ ...btnS, padding: '8px 14px' }}>⚙ Manage elders</button>}
        </div>
      </div>

      {exportMsg && (
        <div onClick={() => setExportMsg(null)} style={{ background: B.tealPale, border: `1px solid ${B.teal}33`, borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: B.textMid, cursor: 'pointer' }}>
          {exportMsg} <span style={{ color: B.textLight }}>(tap to dismiss)</span>
        </div>
      )}

      {isAdmin && syncInfo?.collisions?.length > 0 && (
        <div style={{ background: B.goldLight, border: '1px solid #E7C66B', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#7A5E0A' }}>
          ⚠ {syncInfo.collisions.length} Planning Center assignment{syncInfo.collisions.length > 1 ? 's' : ''} could match more than one elder — review in Planning Center: {syncInfo.collisions.slice(0, 6).join(', ')}{syncInfo.collisions.length > 6 ? '…' : ''}
        </div>
      )}

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <Tab id="flock" label={myKey ? 'My Flock' : `${activeElder ? activeElder.name + "'s" : ''} Flock`} />
        <Tab id="all" label="All Congregation" />
        <Tab id="worklist" label={`Needs Reassignment${coverage.orphaned ? ` (${coverage.orphaned})` : ''}`} />
        {myDeparted.length > 0 && <Tab id="departed" label={`No longer in PCO (${myDeparted.length})`} />}
        {view === 'flock' && activeElder?.sabbatical && (
          <span style={chip(B.goldLight, '#96750E')}>On sabbatical</span>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, or phone…" style={{ ...inp, flex: '1 1 220px', maxWidth: 360 }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inp, width: 'auto' }}>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
          <option value="all">All statuses</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...inp, width: 'auto' }} aria-label="Sort by">
          <option value="first">Sort: First name</option>
          <option value="last">Sort: Last name</option>
        </select>
        {view === 'all' && (
          <select value={assignFilter} onChange={e => setAssignFilter(e.target.value)} style={{ ...inp, width: 'auto' }}>
            <option value="all">All</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
            <option value="orphaned">Orphaned (former elders)</option>
          </select>
        )}
      </div>

      {view === 'worklist' && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#991B1B' }}>
          These people are assigned only to former elders. Open each to reassign a current elder — that writes a clean value back to Planning Center.
        </div>
      )}

      {view === 'departed' && (
        <div style={{ background: B.goldLight, border: '1px solid #E7C66B', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#7A5E0A' }}>
          These people are no longer in Planning Center, but you kept notes on them. Open each to review your note and the care thread, then keep or delete them. Once your notes are removed, the record clears out automatically on the next sync.
        </div>
      )}

      {view === 'flock' && flockUpcoming.length > 0 && (
        <div style={{ background: B.tealPale, border: `1px solid ${B.teal}33`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: B.textMid }}>
          <strong style={{ fontFamily: f1, color: B.navy }}>This week in your flock:</strong>{' '}
          {flockUpcoming.map((u, i) => (
            <span key={u.key}>{i > 0 ? ' · ' : ''}{u.icon} {u.name} ({u.when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})</span>
          ))}
        </div>
      )}

      {/* Results */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: B.textLight, fontFamily: f1, fontWeight: 600 }}>{filtered.length} {filtered.length === 1 ? 'person' : 'people'}</div>
        <button
          onClick={() => {
            exportShepherdPeopleCSV(filtered, {
              elderName,
              label: view === 'flock' ? `flock-${activeElder?.name || 'elder'}`
                : view === 'worklist' ? 'needs-reassignment'
                : view === 'departed' ? 'no-longer-in-pco' : 'congregation',
            });
            // SEC-5: exports are now audited (contact-list only — never notes/medical).
            logShepherdAudit('export_csv', null, userProfile, { count: filtered.length, view });
          }}
          disabled={!filtered.length}
          style={{ ...btnS, padding: '7px 14px', fontSize: 13, opacity: filtered.length ? 1 : 0.5 }}
        >⬇ Export CSV</button>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {filtered.slice(0, visibleCount).map(p => (
          <button key={p._id} onClick={() => setSelected(p)} style={{
            display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer',
            background: B.white, border: `1px solid ${B.sand}`, borderRadius: 12, padding: '10px 14px', width: '100%',
          }}>
            <Avatar person={p} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontFamily: f1, color: B.textDark, fontSize: 15 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: B.textLight, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                {p.membership && <span>{p.membership}</span>}
                <StatusBadge status={p.status} />
                {p.removedFromPco && <span style={chip(B.goldLight, '#96750E')}>No longer in PCO</span>}
                {p.orphaned && <span style={chip('#FEF2F2', B.red)}>Orphaned</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 200 }}>
              {(p.elderKeys || []).map(k => <span key={k} style={chip(B.tealPale, B.teal)}>{elderName(k)}</span>)}
              {!p.hasAssignment && <span style={chip(B.warmGray, B.textLight)}>Unassigned</span>}
            </div>
          </button>
        ))}
        {filtered.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: B.textLight }}>No one matches these filters.</div>}
      </div>
      {filtered.length > visibleCount && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={() => setVisibleCount(c => c + 100)} style={{ ...btnS, padding: '8px 20px' }}>
            Show more ({filtered.length - visibleCount} more)
          </button>
        </div>
      )}

      {selected && <PersonDetail
        person={selected} elderName={elderName} userProfile={userProfile} isElder={isElder}
        activeElders={(roster.elders || []).filter(e => e.active !== false)}
        canEdit={isElder || isAdmin}
        onPatch={patchPerson}
        onClose={() => setSelected(null)} />}

      {showRoster && <RosterManager roster={roster} onClose={() => setShowRoster(false)} onSaved={setRoster} onResynced={load} />}
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}

// Plain-language privacy + confidentiality promise for the elders (P4). Honest
// about the Level-1 limits (rules + audit, not yet encrypted). Mirrors
// docs/SHEPHERD-HUB-PRIVACY.md — keep the two in sync.
function PrivacyModal({ onClose }) {
  const h = { fontFamily: f1, fontWeight: 800, color: B.navy, fontSize: 14, margin: '16px 0 4px' };
  const p = { fontSize: 14, color: B.textDark, lineHeight: 1.55, margin: '0 0 6px' };
  const li = { fontSize: 14, color: B.textDark, lineHeight: 1.5, marginBottom: 4 };
  return (
    <Modal open onClose={onClose} title="🔒 Privacy & confidentiality" maxWidth={600}>
      <p style={p}>This hub holds confidential pastoral information. Please read how it's protected — and what's expected of you.</p>

      <div style={h}>What this is</div>
      <p style={p}>A private, always-current view of our congregation, drawn from Planning Center, so you can shepherd the people in your care and keep your own notes.</p>

      <div style={h}>Where the data comes from</div>
      <p style={p}>People and contact details sync <strong>read-only</strong> from Planning Center (the church's system of record). The hub never changes Planning Center — with one exception you control: reassigning who shepherds someone writes that one field back, so the assignment stays accurate everywhere.</p>

      <div style={h}>Who can see what</div>
      <ul style={{ margin: '0 0 6px', paddingLeft: 20 }}>
        <li style={li}><strong>Your private note</strong> on a person — <strong>only you.</strong> No other elder, and not the administrator, can read it through the app.</li>
        <li style={li}><strong>The shared care thread</strong> — every elder can read it and add to it.</li>
        <li style={li}><strong>The directory, contact info, and medical notes</strong> — elders and John (administrator) only. No other staff or members.</li>
      </ul>

      <div style={h}>The honest limit</div>
      <p style={p}>Your private note is protected by access rules — only you can open it through the app. It is <strong>not encrypted in the database</strong>, so a system administrator with direct database access (the person who runs the app) could technically read it. Treat your notes as private <em>from the church</em> and well-protected by the app, but not cryptographically sealed.</p>

      <div style={h}>What the app records</div>
      <p style={p}>When you open a person's record or edit a note <em>in the app</em>, it records who did it and when — for accountability, not surveillance. Only the administrator can read that log.</p>

      <div style={h}>Your responsibility</div>
      <p style={p}>This is confidential pastoral data, including medical and other sensitive details. Keep it within the eldership. You may export a <strong>contact list</strong> (names and contact info) for your own flock — but never export, screenshot, or forward <strong>notes, medical details, or the full directory</strong>. Sign out on shared devices.</p>

      <div style={h}>Access</div>
      <p style={p}>You're given access when you sign in with your church Google account. When you roll off the eldership, access is removed.</p>

      <div style={h}>Questions or concerns</div>
      <p style={p}>Contact John.</p>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={onClose} style={btnP}>Got it</button>
      </div>
    </Modal>
  );
}

// Admin-only editor for config/shepherdRoster — the single source feeding the
// claim grant + the sync's name-matching. Changes to match patterns / active
// flags re-classify people only on the next sync (offer "Save & re-sync").
function RosterManager({ roster, onClose, onSaved, onResynced }) {
  const toRow = (e) => ({
    key: e.key, name: e.name || '', surname: e.surname || '',
    emailsStr: (e.emails || []).join(', '), matchStr: (e.match || []).join(', '),
    active: e.active !== false, sabbatical: !!e.sabbatical,
  });
  const [rows, setRows] = useState((roster.elders || []).map(toRow));
  const [formerStr, setFormerStr] = useState((roster.former || []).flatMap(f => f.match || [f.key]).join(', '));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [confirmRemoval, setConfirmRemoval] = useState(null); // { built, resync, removed:[{name,emails}] }

  const setRow = (i, patch) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));
  const removeRow = (i) => setRows(rs => rs.filter((_, j) => j !== i));
  const addRow = () => setRows(rs => [...rs, { key: '', name: '', surname: '', emailsStr: '', matchStr: '', active: true, sabbatical: false }]);

  function buildRoster() {
    const splitList = (s) => s.split(/[,\n]/).map(x => x.trim()).filter(Boolean);
    const elders = rows.map(r => {
      const surname = r.surname.trim();
      const key = (r.key || surname).toLowerCase().replace(/[^a-z]/g, '');
      const match = r.matchStr.trim() ? splitList(r.matchStr).map(m => m.toLowerCase()) : [surname.toLowerCase()];
      return {
        key, name: r.name.trim(), surname,
        emails: splitList(r.emailsStr).map(e => e.toLowerCase()),
        match, active: r.active, sabbatical: r.sabbatical,
      };
    });
    const former = splitList(formerStr).map(s => ({ key: s.toLowerCase().replace(/[^a-z]/g, ''), match: [s.toLowerCase()] }));
    return { elders, former };
  }

  function validate(r) {
    if (!r.elders.length) return 'Add at least one elder. (Saving an empty roster would restore the built-in defaults on the next sync.)';
    if (r.elders.some(e => !e.name || !e.surname)) return 'Every elder needs a name and surname.';
    if (r.elders.some(e => !e.key)) return 'Surname must contain letters (used as the elder key).';
    const keys = r.elders.map(e => e.key);
    if (new Set(keys).size !== keys.length) return 'Two elders resolve to the same key (surname). Make them distinct.';
    return null;
  }

  // Elders whose email(s) are entirely gone from the new roster = removed.
  // Email-based (not key/surname-based) so renaming an elder never looks like a
  // removal and never triggers a purge. An elder with no email can't be matched
  // to an account, so they're skipped (nothing to purge).
  function removedElders(built) {
    const builtEmails = new Set(built.elders.flatMap(e => (e.emails || []).map(s => String(s).toLowerCase())));
    return (roster.elders || [])
      .filter(orig => {
        const ems = (orig.emails || []).map(s => String(s).toLowerCase());
        return ems.length > 0 && !ems.some(em => builtEmails.has(em));
      })
      .map(e => ({ name: e.name, emails: e.emails || [] }));
  }

  function attemptSave(resync) {
    const built = buildRoster();
    const v = validate(built);
    if (v) { setErr(v); return; }
    const removed = removedElders(built);
    if (removed.length) { setErr(null); setConfirmRemoval({ built, resync, removed }); return; }
    doSave(built, resync, []);
  }

  async function doSave(built, resync, removed) {
    setSaving(true); setErr(null);
    try {
      await setDoc(doc(db, `churches/${SHEPHERD_CHURCH_ID}/config/shepherdRoster`), { ...built, updatedAt: serverTimestamp() });
      onSaved(built);
      // Purge each removed elder's private notes (shared care-thread entries stay).
      for (const r of removed) {
        await httpsCallable(getFunctions(), 'purgeElderShepherdNotes')({ emails: r.emails, elderName: r.name });
      }
      if (resync) {
        await httpsCallable(getFunctions(), 'refreshShepherdPeople')();
        onResynced?.(); // UX-4: refetch people + sync freshness after the re-sync
      }
      onClose();
    } catch (e) {
      setErr(e?.message || 'Could not save the roster.');
      Sentry.captureException(e, { tags: { area: 'shepherd-hub', fn: 'roster-save' } });
      setConfirmRemoval(null);
    } finally { setSaving(false); }
  }

  const cell = { ...inp, padding: '7px 9px', fontSize: 13 };
  const lbl = { fontSize: 10, fontWeight: 700, color: B.textLight, fontFamily: f1, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 };

  return (
    <Modal open onClose={onClose} title="Manage elders" maxWidth={680}>
      <p style={{ fontSize: 13, color: B.textMid, marginTop: 0 }}>
        Drives hub access (sign-in emails) and how Planning Center's "Elder Assigned" text maps to each elder. Match = the surname(s)/typo aliases to recognize.
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ border: `1px solid ${B.sand}`, borderRadius: 12, padding: 12, background: r.active ? B.white : B.warmGray }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><div style={lbl}>Name</div><input value={r.name} onChange={e => setRow(i, { name: e.target.value })} style={cell} /></div>
              <div><div style={lbl}>Surname (PCO + key)</div><input value={r.surname} onChange={e => setRow(i, { surname: e.target.value })} style={cell} /></div>
            </div>
            <div style={{ marginTop: 8 }}><div style={lbl}>Sign-in email(s) — comma-separated</div><input value={r.emailsStr} onChange={e => setRow(i, { emailsStr: e.target.value })} style={cell} placeholder="name@fxcc.org" /></div>
            <div style={{ marginTop: 8 }}><div style={lbl}>PCO match patterns — comma-separated (defaults to surname)</div><input value={r.matchStr} onChange={e => setRow(i, { matchStr: e.target.value })} style={cell} placeholder="bingham, bingam" /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={r.active} onChange={e => setRow(i, { active: e.target.checked })} /> Active</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={r.sabbatical} onChange={e => setRow(i, { sabbatical: e.target.checked })} /> On sabbatical</label>
              <button onClick={() => removeRow(i)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: B.red, cursor: 'pointer', fontSize: 12, fontFamily: f1, fontWeight: 700 }}>Remove</button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={addRow} style={{ ...btnS, marginTop: 12, padding: '8px 16px' }}>+ Add elder</button>

      <div style={{ marginTop: 16 }}>
        <div style={lbl}>Former elders (recognized so their people show as orphaned) — comma-separated surnames</div>
        <textarea value={formerStr} onChange={e => setFormerStr(e.target.value)} rows={2} style={{ ...cell, resize: 'vertical' }} />
      </div>

      <div style={{ background: B.warmGray, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: B.textMid, marginTop: 14 }}>
        Email changes take effect on the elder's next sign-in. Match/active changes re-classify people on the next sync — use <strong>Save &amp; re-sync</strong> to apply immediately (~1 min). Removing an elder revokes access on their next sign-in.
      </div>
      {err && <div style={{ color: B.red, fontSize: 13, marginTop: 8 }}>{err}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button onClick={onClose} disabled={saving} style={btnS}>Cancel</button>
        <button onClick={() => attemptSave(false)} disabled={saving} style={{ ...btnS, opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={() => attemptSave(true)} disabled={saving} style={{ ...btnP, opacity: saving ? 0.5 : 1 }}>{saving ? 'Working…' : 'Save & re-sync'}</button>
      </div>

      {confirmRemoval && (
        <Modal open onClose={() => !saving && setConfirmRemoval(null)} title="⚠ Remove elder — notes will be deleted" maxWidth={520}>
          <p style={{ fontSize: 14, color: B.textDark, lineHeight: 1.55, marginTop: 0 }}>
            You're removing {confirmRemoval.removed.length === 1 ? <strong>{confirmRemoval.removed[0].name}</strong> : `${confirmRemoval.removed.length} elders`} from the roster. This <strong>permanently deletes their private pastoral notes</strong> on every person. Shared care-thread entries are kept.
          </p>
          {confirmRemoval.removed.length > 1 && (
            <ul style={{ margin: '0 0 10px', paddingLeft: 20, fontSize: 14, color: B.textDark }}>
              {confirmRemoval.removed.map(r => <li key={r.name}>{r.name}</li>)}
            </ul>
          )}
          <p style={{ fontSize: 13, color: B.textMid, lineHeight: 1.5 }}>
            Make sure they've saved anything they want to keep first — each elder can do that from <strong>⬇ Export my notes</strong> in the hub header. <strong>This cannot be undone.</strong>
          </p>
          {err && <div style={{ color: B.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button onClick={() => setConfirmRemoval(null)} disabled={saving} style={btnS}>Cancel</button>
            <button onClick={() => doSave(confirmRemoval.built, confirmRemoval.resync, confirmRemoval.removed)} disabled={saving} style={{ ...btnD, opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Removing…' : 'Remove & delete notes'}
            </button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

function Avatar({ person, size = 40 }) {
  const initials = (person.firstName?.[0] || person.name?.[0] || '?') + (person.lastName?.[0] || '');
  if (person.avatarUrl) {
    return <img src={person.avatarUrl} alt="" width={size} height={size} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: B.warmGray }} onError={e => { e.currentTarget.style.display = 'none'; }} />;
  }
  return <div style={{ width: size, height: size, borderRadius: '50%', background: B.tealPale, color: B.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontFamily: f1, fontSize: size / 2.6, flexShrink: 0 }}>{initials.toUpperCase()}</div>;
}

function Row({ label, children }) {
  if (children == null || (Array.isArray(children) && !children.length)) return null;
  return (
    <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: `1px solid ${B.warmGray}` }}>
      <div style={{ width: 130, flexShrink: 0, fontSize: 12, fontWeight: 700, color: B.textLight, fontFamily: f1, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ flex: 1, fontSize: 14, color: B.textDark }}>{children}</div>
    </div>
  );
}

function PersonDetail({ person: p, elderName, userProfile, isElder, activeElders, canEdit, onPatch, onClose }) {
  const addr = (p.addresses || [])[0];
  const [editing, setEditing] = useState(false);
  // Audit the view once per open (covers "every note view" for elders).
  useEffect(() => { logShepherdAudit('view_person', p, userProfile); }, [p._id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open onClose={onClose} title={p.name} maxWidth={560}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <Avatar person={p} size={56} />
        <div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusBadge status={p.status} />
            {p.membership && <span style={chip(B.warmGray, B.textMid)}>{p.membership}</span>}
            {p.child && <span style={chip(B.goldLight, '#96750E')}>Child</span>}
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {(p.elderKeys || []).map(k => <span key={k} style={chip(B.tealPale, B.teal)}>{elderName(k)}</span>)}
            {!p.hasAssignment && <span style={chip(B.warmGray, B.textLight)}>No elder assigned</span>}
            {p.orphaned && <span style={chip('#FEF2F2', B.red)}>Orphaned</span>}
            {p.removedFromPco && <span style={chip(B.goldLight, '#96750E')}>No longer in PCO</span>}
            {canEdit && !editing && !p.removedFromPco && (
              <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: B.teal, cursor: 'pointer', fontSize: 12, fontFamily: f1, fontWeight: 700, padding: 0 }}>✎ Edit</button>
            )}
          </div>
        </div>
      </div>

      {p.removedFromPco && (
        <div style={{ background: B.goldLight, border: '1px solid #E7C66B', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#96750E', fontFamily: f1, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>⚠ No longer in Planning Center</div>
          <div style={{ fontSize: 13, color: B.textDark }}>
            This person was removed from Planning Center{p.removedAt ? ` on ${fmtTime(p.removedAt)}` : ''}. They no longer appear in your flock or the congregation. Decide what to do with your notes below — keep them, or delete them to clear this record on the next sync.
          </div>
        </div>
      )}

      {editing && (
        <AssignmentEditor
          person={p} activeElders={activeElders}
          onClose={() => setEditing(false)}
          onSaved={(patch) => { onPatch(p._id, patch); setEditing(false); }}
        />
      )}

      {p.medicalNotes && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: B.red, fontFamily: f1, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>⚕ Medical notes</div>
          <div style={{ fontSize: 14, color: B.textDark, whiteSpace: 'pre-wrap' }}>{p.medicalNotes}</div>
        </div>
      )}

      <Row label="Email">{(p.emails || []).map((e, i) => <div key={i}><a href={`mailto:${e.address}`} style={{ color: B.teal }}>{e.address}</a>{e.location ? ` · ${e.location}` : ''}</div>)}</Row>
      <Row label="Phone">{(p.phones || []).map((ph, i) => <div key={i}><a href={`tel:${ph.number}`} style={{ color: B.teal }}>{ph.number}</a>{ph.location ? ` · ${ph.location}` : ''}</div>)}</Row>
      <Row label="Address">{addr ? <span>{[addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ')}</span> : null}</Row>
      <Row label="Birthday">{p.birthdate}</Row>
      <Row label="Anniversary">{p.anniversary}</Row>
      <Row label="Gender">{p.gender}</Row>

      <div style={{ marginTop: 14, marginBottom: 6, fontSize: 12, fontWeight: 800, color: B.navy, fontFamily: f1, textTransform: 'uppercase', letterSpacing: 0.4 }}>Pastoral</div>
      <Row label="Elder Assigned">{p.pastoral?.elderAssigned}</Row>
      <Row label="Date Baptized">{p.pastoral?.dateBaptized}</Row>
      <Row label="Growth Group">{p.pastoral?.growthGroupMember}</Row>
      <Row label="Discipleship">{p.pastoral?.discipleship}</Row>
      <Row label="Strengths">{(p.pastoral?.strengths || []).join(', ') || null}</Row>
      <Row label="Gifts">{(p.pastoral?.gifts || []).join(', ') || null}</Row>

      {isElder
        ? <NotesSection person={p} userProfile={userProfile} />
        : <div style={{ marginTop: 16, padding: 12, background: B.warmGray, borderRadius: 10, fontSize: 13, color: B.textLight }}>Pastoral notes are visible to elders only.</div>}

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btnS}>Close</button>
      </div>
    </Modal>
  );
}

// Reassign who shepherds this person — writes a clean canonical value back to
// PCO via the setElderAssignment callable (server validates + verifies).
function AssignmentEditor({ person, activeElders, onClose, onSaved }) {
  const [picked, setPicked] = useState(new Set(person.elderKeys || []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const toggle = (key) => setPicked(s => {
    const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n;
  });

  async function save() {
    if (picked.size === 0) { setError('Select at least one elder.'); return; }
    setSaving(true); setError(null);
    try {
      const fn = httpsCallable(getFunctions(), 'setElderAssignment');
      const res = await fn({ personId: person._id, elderKeys: [...picked] });
      const d = res.data || {};
      onSaved({
        elderKeys: d.elderKeys || [],
        orphaned: !!d.orphaned,
        hasAssignment: !!d.hasAssignment,
        pastoral: { ...(person.pastoral || {}), elderAssigned: d.value },
      });
    } catch (e) {
      setError(e?.message || 'Could not save. Try again.');
      Sentry.captureException(e, { tags: { area: 'shepherd-hub', fn: 'reassign' } });
    } finally { setSaving(false); }
  }

  return (
    <div style={{ background: B.tealPale, border: `1px solid ${B.teal}33`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: B.navy, fontFamily: f1, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 }}>Reassign elder(s)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
        {activeElders.map(e => (
          <label key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: B.textDark, cursor: 'pointer', background: B.white, borderRadius: 8, padding: '7px 10px', border: `1px solid ${B.sand}` }}>
            <input type="checkbox" checked={picked.has(e.key)} onChange={() => toggle(e.key)} />
            {e.name}{e.sabbatical ? ' (sab)' : ''}
          </label>
        ))}
      </div>
      <div style={{ fontSize: 11, color: B.textLight, marginTop: 8 }}>Writes back to Planning Center as <strong>{activeElders.filter(e => picked.has(e.key)).map(e => e.surname).join('/') || '—'}</strong>.</div>
      {error && <div style={{ color: B.red, fontSize: 12, marginTop: 6 }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button onClick={onClose} disabled={saving} style={{ ...btnS, padding: '8px 16px' }}>Cancel</button>
        <button onClick={save} disabled={saving || picked.size === 0} style={{ ...btnP, padding: '8px 16px', opacity: (saving || picked.size === 0) ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save to PCO'}</button>
      </div>
    </div>
  );
}

// Private note (owner-only) + shared care thread for one person.
function NotesSection({ person, userProfile }) {
  const base = `churches/${SHEPHERD_CHURCH_ID}/shepherdPeople/${person._id}`;
  const [privateText, setPrivateText] = useState('');
  const [privateSaved, setPrivateSaved] = useState('');
  const [savingPrivate, setSavingPrivate] = useState(false);
  const [undoText, setUndoText] = useState(null); // UX-6: one-level undo of the last save/delete
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pn, ct] = await Promise.all([
          getDoc(doc(db, `${base}/privateNotes/${userProfile.uid}`)),
          getDocs(query(collection(db, `${base}/careThread`), orderBy('createdAt', 'asc'))),
        ]);
        if (cancelled) return;
        const t = pn.exists() ? (pn.data().text || '') : '';
        setPrivateText(t); setPrivateSaved(t);
        setThread(ct.docs.map(d => ({ _id: d.id, ...d.data() })));
      } catch (e) {
        Sentry.captureException(e, { tags: { area: 'shepherd-hub', fn: 'notes-load' } });
      } finally { if (!cancelled) setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [person._id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function savePrivate() {
    const prior = privateSaved; // capture for one-level undo (UX-6)
    setSavingPrivate(true);
    try {
      await setDoc(doc(db, `${base}/privateNotes/${userProfile.uid}`), {
        text: privateText, authorName: userProfile.name || null, updatedAt: serverTimestamp(),
      });
      setPrivateSaved(privateText);
      setUndoText(prior !== privateText ? prior : null);
      logShepherdAudit('edit_private_note', person, userProfile);
    } catch (e) {
      Sentry.captureException(e, { tags: { area: 'shepherd-hub', fn: 'notes-save-private' } });
    } finally { setSavingPrivate(false); }
  }

  async function deletePrivate() {
    const prior = privateSaved; // capture for one-level undo (UX-6)
    setSavingPrivate(true);
    try {
      // Delete the doc outright (not just blank the text) so a departed person
      // with no remaining pastoral data gets cleaned up by the next sync.
      await deleteDoc(doc(db, `${base}/privateNotes/${userProfile.uid}`));
      setPrivateText(''); setPrivateSaved('');
      setUndoText(prior || null);
      logShepherdAudit('delete_private_note', person, userProfile);
    } catch (e) {
      Sentry.captureException(e, { tags: { area: 'shepherd-hub', fn: 'notes-del-private' } });
    } finally { setSavingPrivate(false); }
  }

  // Restore the pre-save/-delete text into the editor (not yet persisted — the
  // elder re-saves to commit). One level, cleared once used.
  function undoNote() {
    if (undoText == null) return;
    setPrivateText(undoText);
    setUndoText(null);
  }

  async function postEntry() {
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    try {
      const ref = await addDoc(collection(db, `${base}/careThread`), {
        text, authorUid: userProfile.uid, authorName: userProfile.name || null, createdAt: serverTimestamp(),
      });
      setThread(t => [...t, { _id: ref.id, text, authorUid: userProfile.uid, authorName: userProfile.name, createdAt: new Date() }]);
      setDraft('');
      logShepherdAudit('append_care', person, userProfile);
    } catch (e) {
      Sentry.captureException(e, { tags: { area: 'shepherd-hub', fn: 'notes-post-care' } });
    } finally { setPosting(false); }
  }

  async function deleteEntry(entry) {
    try {
      await deleteDoc(doc(db, `${base}/careThread/${entry._id}`));
      setThread(t => t.filter(x => x._id !== entry._id));
      logShepherdAudit('delete_care', person, userProfile);
    } catch (e) {
      Sentry.captureException(e, { tags: { area: 'shepherd-hub', fn: 'notes-del-care' } });
    }
  }

  const heading = (txt) => <div style={{ marginTop: 18, marginBottom: 6, fontSize: 12, fontWeight: 800, color: B.navy, fontFamily: f1, textTransform: 'uppercase', letterSpacing: 0.4 }}>{txt}</div>;

  return (
    <div>
      {heading('🔒 My Private Note')}
      <div style={{ fontSize: 11, color: B.textLight, marginBottom: 6 }}>Only you can see this.</div>
      <textarea value={privateText} onChange={e => setPrivateText(e.target.value)} rows={3} placeholder={loaded ? 'Your private note about this person…' : 'Loading…'} disabled={!loaded}
        style={{ ...inp, resize: 'vertical', minHeight: 70 }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
        {undoText != null && (
          <button onClick={undoNote} disabled={savingPrivate} style={{ ...btnS, padding: '8px 16px', marginRight: 'auto', opacity: savingPrivate ? 0.5 : 1 }}>↩ Undo</button>
        )}
        {privateSaved.trim() && (
          <button onClick={deletePrivate} disabled={savingPrivate} style={{ ...btnS, padding: '8px 16px', color: B.red, opacity: savingPrivate ? 0.5 : 1 }}>
            Delete note
          </button>
        )}
        <button onClick={savePrivate} disabled={savingPrivate || privateText === privateSaved} style={{ ...btnP, padding: '8px 18px', opacity: (savingPrivate || privateText === privateSaved) ? 0.5 : 1 }}>
          {savingPrivate ? 'Saving…' : privateText === privateSaved ? 'Saved' : 'Save note'}
        </button>
      </div>

      {heading('👥 Shared Care Thread')}
      <div style={{ fontSize: 11, color: B.textLight, marginBottom: 8 }}>Visible to all elders.</div>
      <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
        {thread.map(en => (
          <div key={en._id} style={{ background: B.warmGray, borderRadius: 10, padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: f1, color: B.textDark }}>{en.authorName || 'Elder'}</span>
              <span style={{ fontSize: 11, color: B.textLight }}>{fmtTime(en.createdAt)}</span>
            </div>
            <div style={{ fontSize: 14, color: B.textDark, whiteSpace: 'pre-wrap', marginTop: 2 }}>{en.text}</div>
            {en.authorUid === userProfile.uid && (
              <button onClick={() => deleteEntry(en)} style={{ background: 'none', border: 'none', color: B.red, cursor: 'pointer', fontSize: 11, fontFamily: f1, fontWeight: 600, padding: '4px 0 0' }}>Delete</button>
            )}
          </div>
        ))}
        {loaded && thread.length === 0 && <div style={{ fontSize: 13, color: B.textLight }}>No entries yet.</div>}
      </div>
      <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} placeholder="Add to the care thread…" style={{ ...inp, resize: 'vertical', minHeight: 56 }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
        <button onClick={postEntry} disabled={posting || !draft.trim()} style={{ ...btnP, padding: '8px 18px', opacity: (posting || !draft.trim()) ? 0.5 : 1 }}>{posting ? 'Posting…' : 'Post'}</button>
      </div>
    </div>
  );
}
