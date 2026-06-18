import { useState, useMemo, useContext, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase.js';
import { B, f1, f2, btnS } from '../components/brand/tokens.js';
import { localDateStr } from '../utils/date.js';
import { formatTimeRange } from '../utils/time.js';
import { getOccurrences } from '../lib/occurrences.js';
import { getPerson, makeRef, shiftReadiness } from '../lib/people.js';
import { MobileCtx } from '../hooks/useMobile.js';
import { EmojiIcon } from '../components/primitives/EmojiIcon.jsx';

const ACCESS_TYPE_LABELS = { background_check: 'Background Check', key_assignment: 'Key Assignment', certification: 'Certification', custom: 'Custom' };

// UI for each shiftReadiness level (the logic lives in src/lib/people.js).
const READINESS = {
  ok: { emoji: '✅', bg: '#DCFCE7', tx: '#166534', label: 'Cleared' },
  soon: { emoji: '⚠️', bg: '#FEF3E8', tx: '#9A5E10', label: 'Expiring soon' },
  blocked: { emoji: '⛔', bg: '#FEE8E8', tx: '#B42318', label: 'Not cleared' },
};

// Event-Day Ops view — a single-screen admin/manager console for one day,
// cross-sourcing everything happening that day from the F5 getOccurrences
// aggregator (shifts + rooms + due work). Roster + per-volunteer compliance
// readiness land under each shift in Phase 2. See docs/EVENT-DAY-OPS-PLAN-2026-06-18.md.

function parseLocal(ymd) { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(ymd, n) { const d = parseLocal(ymd); d.setDate(d.getDate() + n); return localDateStr(d); }
// The upcoming Sunday — today if today is already Sunday.
function upcomingSunday(ymd) { const d = parseLocal(ymd); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return localDateStr(d); }
function prettyDate(ymd) { return parseLocal(ymd).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }

const byTime = (a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99');

function Section({ icon, title, count, children }) {
  return (
    <div style={{ background: B.white, border: '1px solid ' + B.sand, borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <EmojiIcon emoji={icon} label="" decorative style={{ fontSize: 18 }} />
        <span style={{ fontFamily: f1, fontWeight: 700, fontSize: 16, color: B.navy }}>{title}</span>
        {count != null && <span style={{ fontSize: 13, color: B.textLight, fontFamily: f1 }}>({count})</span>}
      </div>
      {children}
    </div>
  );
}

const empty = (text) => <div style={{ fontSize: 14, color: B.textLight, fontFamily: f2, padding: '4px 0' }}>{text}</div>;
const statusPill = (label, bg, tx) => <span style={{ fontSize: 11, fontWeight: 700, fontFamily: f1, padding: '2px 8px', borderRadius: 999, background: bg, color: tx, whiteSpace: 'nowrap' }}>{label}</span>;

export function EventDayPage({ store, userProfile, hasHub }) {
  const isMobile = useContext(MobileCtx);
  const today = localDateStr(new Date());
  const [day, setDay] = useState(today);

  const occ = useMemo(() => getOccurrences(
    { reservations: store.reservations, jobListings: store.jobListings, tasks: store.tasks, maintenance: store.maintenanceTickets },
    { range: { start: day, end: day } },
  ), [store.reservations, store.jobListings, store.tasks, store.maintenanceTickets, day]);

  const jobById = useMemo(() => new Map((store.jobListings || []).map(j => [j._docId, j])), [store.jobListings]);

  const shiftOccs = useMemo(() => occ.filter(o => o.sourceType === 'shift').sort(byTime), [occ]);
  const reservationOccs = useMemo(() => occ.filter(o => o.sourceType === 'reservation').sort(byTime), [occ]);
  const dueOccs = useMemo(() => occ
    .filter(o => (o.sourceType === 'work' && hasHub('tasks')) || (o.sourceType === 'maintenance_due' && hasHub('maintenance')))
    .sort((a, b) => a.title.localeCompare(b.title)), [occ, hasHub]);

  const showJobs = hasHub('jobs');
  const showDue = hasHub('tasks') || hasHub('maintenance');
  const showCompliance = hasHub('people_access');
  const nothingAtAll = (!showJobs || shiftOccs.length === 0) && reservationOccs.length === 0 && (!showDue || dueOccs.length === 0);

  // People resolver ctx for readiness (today = the viewed day, not the wall clock).
  const peopleCtx = useMemo(() => ({
    users: store.users, accessPeople: store.accessPeople, accessRecords: store.accessRecords, today: parseLocal(day),
  }), [store.users, store.accessPeople, store.accessRecords, day]);

  // Roster reads: one bounded getDocs per shift-with-signups on the viewed day.
  // The tab is admin/manager-only, so canSeeJobRoster is always satisfied via the
  // church-scoped path (a church-wide collectionGroup query is NOT rule-allowed).
  const churchId = userProfile?.churchId;
  const [rostersByJob, setRostersByJob] = useState(new Map());
  useEffect(() => {
    if (!churchId || !showJobs) { setRostersByJob(prev => (prev.size ? new Map() : prev)); return undefined; }
    const fetchable = shiftOccs.map(o => jobById.get(o.sourceId)).filter(j => j && (j.signupCount || 0) > 0);
    if (fetchable.length === 0) { setRostersByJob(prev => (prev.size ? new Map() : prev)); return undefined; }
    let cancelled = false;
    Promise.all(fetchable.map(async (j) => {
      try {
        const snap = await getDocs(collection(db, 'churches', churchId, 'jobListings', j._docId, 'signups'));
        return [j._docId, snap.docs.map(d => ({ uid: d.id, name: d.data().name }))];
      } catch { return [j._docId, null]; } // rule denial / network — skip
    })).then(entries => { if (!cancelled) setRostersByJob(new Map(entries.filter(([, v]) => v !== null))); });
    return () => { cancelled = true; };
  }, [shiftOccs, jobById, churchId, showJobs]);

  // Day-scoped attention strip. Derived from the SAME shifts + rosters +
  // readiness the sections render below, so the banner can't disagree with the
  // rows. (F4's collectors are church/this-week scoped — a different question —
  // so the per-day flags reuse F2's shiftReadiness + the unfilled predicate.)
  const flags = useMemo(() => {
    const out = { unfilled: 0, notCleared: 0, expiring: 0 };
    if (!showJobs) return out;
    for (const o of shiftOccs) {
      const job = jobById.get(o.sourceId) || {};
      if ((job.signupCount || 0) < (job.spotsTotal || 1)) out.unfilled++;
      const reqTypes = job.requiredAccessTypes || [];
      if (!showCompliance || reqTypes.length === 0) continue;
      for (const m of rostersByJob.get(o.sourceId) || []) {
        const r = shiftReadiness(getPerson(makeRef('user', m.uid), peopleCtx), reqTypes, store.accessRecords, peopleCtx.today);
        if (r?.level === 'blocked') out.notCleared++;
        else if (r?.level === 'soon') out.expiring++;
      }
    }
    return out;
  }, [shiftOccs, jobById, rostersByJob, peopleCtx, store.accessRecords, showJobs, showCompliance]);

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const flagChips = [
    flags.unfilled && { bg: '#FEF3E8', tx: '#9A5E10', text: flags.unfilled === 1 ? '1 shift needs volunteers' : `${flags.unfilled} shifts need volunteers` },
    flags.notCleared && { bg: '#FEE8E8', tx: '#B42318', text: `${plural(flags.notCleared, 'volunteer', 'volunteers')} signed up but not cleared` },
    flags.expiring && { bg: '#FEF3E8', tx: '#9A5E10', text: `${plural(flags.expiring, 'volunteer', 'volunteers')} cleared but expiring soon` },
  ].filter(Boolean);

  const navBtn = { ...btnS, padding: '6px 12px', fontSize: 13 };

  return (
    <div>
      {/* Header + day navigator */}
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontFamily: f1, fontWeight: 800, fontSize: 24, color: B.navy, margin: '0 0 4px' }}>Event Day</h2>
        <p style={{ fontFamily: f2, fontSize: 14, color: B.textMid, margin: '0 0 14px' }}>Everything happening on one day — shifts, rooms, and what's due — in one place.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setDay(addDays(day, -1))} aria-label="Previous day" style={{ ...navBtn, fontSize: 16, lineHeight: 1 }}>‹</button>
          <button onClick={() => setDay(addDays(day, 1))} aria-label="Next day" style={{ ...navBtn, fontSize: 16, lineHeight: 1 }}>›</button>
          <div style={{ fontFamily: f1, fontWeight: 700, fontSize: isMobile ? 15 : 17, color: B.navy, minWidth: isMobile ? 0 : 280 }}>
            {prettyDate(day)}{day === today && <span style={{ color: B.teal, fontWeight: 800 }}> · Today</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginLeft: isMobile ? 0 : 'auto', flexWrap: 'wrap' }}>
            <button onClick={() => setDay(today)} style={{ ...navBtn, ...(day === today ? { border: '1px solid ' + B.teal, color: B.teal } : {}) }}>Today</button>
            <button onClick={() => setDay(upcomingSunday(today))} style={navBtn}>Sunday</button>
            <input type="date" value={day} onChange={e => e.target.value && setDay(e.target.value)}
              style={{ ...navBtn, cursor: 'pointer', fontFamily: f2 }} aria-label="Jump to date" />
          </div>
        </div>
      </div>

      {flagChips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {flagChips.map((c, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, fontFamily: f1, padding: '6px 12px', borderRadius: 999, background: c.bg, color: c.tx }}>
              <EmojiIcon emoji="⚠️" label="" decorative /> {c.text}
            </span>
          ))}
        </div>
      )}

      {nothingAtAll && (
        <div style={{ textAlign: 'center', color: B.textLight, fontSize: 15, fontFamily: f2, padding: '48px 16px', background: B.white, border: '1px solid ' + B.sand, borderRadius: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}><EmojiIcon emoji="🗓️" label="" decorative /></div>
          Nothing scheduled for this day.
        </div>
      )}

      {/* Serving today (shifts) */}
      {showJobs && (
        <Section icon="💼" title="Serving today" count={shiftOccs.length}>
          {shiftOccs.length === 0 ? empty('No shifts scheduled.') : shiftOccs.map(o => {
            const job = jobById.get(o.sourceId) || {};
            const filled = job.signupCount || 0;
            const total = job.spotsTotal || 1;
            const full = filled >= total;
            const reqTypes = job.requiredAccessTypes || [];
            const roster = rostersByJob.get(o.sourceId) || [];
            return (
              <div key={o.id} style={{ padding: '12px 0', borderTop: '1px solid ' + B.sand }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: f1, fontWeight: 600, fontSize: 15, color: B.navy }}>{o.title}</div>
                    <div style={{ fontSize: 13, color: B.textMid, marginTop: 2 }}>
                      {o.startTime ? formatTimeRange(o.startTime, o.endTime) : 'All day'}{o.location ? ' · ' + o.location : ''}
                    </div>
                    {reqTypes.length > 0 && (
                      <div style={{ fontSize: 12, color: B.textLight, marginTop: 3 }}>
                        Requires: {reqTypes.map(t => ACCESS_TYPE_LABELS[t] || t).join(', ')}
                      </div>
                    )}
                  </div>
                  {full
                    ? statusPill(`${filled}/${total} full`, '#DCFCE7', '#166534')
                    : statusPill(`${filled}/${total} · needs ${total - filled}`, '#FEF3E8', '#9A5E10')}
                </div>
                {/* Roster */}
                <div style={{ marginTop: 8, paddingLeft: 2 }}>
                  {filled === 0 ? (
                    <div style={{ fontSize: 13, color: B.textLight, fontStyle: 'italic' }}>No signups yet.</div>
                  ) : roster.length === 0 ? (
                    <div style={{ fontSize: 13, color: B.textLight }}>Loading roster…</div>
                  ) : roster.map(m => {
                    const readiness = showCompliance
                      ? shiftReadiness(getPerson(makeRef('user', m.uid), peopleCtx), reqTypes, store.accessRecords, peopleCtx.today)
                      : null;
                    const rs = readiness && READINESS[readiness.level];
                    return (
                      <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: B.textLight, flexShrink: 0 }} />
                        <span style={{ fontSize: 14, color: B.textDark, fontFamily: f2, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name || 'Volunteer'}</span>
                        {rs && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, fontFamily: f1, padding: '2px 8px', borderRadius: 999, background: rs.bg, color: rs.tx, whiteSpace: 'nowrap' }}>
                            <EmojiIcon emoji={rs.emoji} label="" decorative /> {rs.label}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {/* Rooms & reservations (free base — always shown) */}
      <Section icon="📅" title="Rooms & reservations" count={reservationOccs.length}>
        {reservationOccs.length === 0 ? empty('No reservations.') : reservationOccs.map(o => (
          <div key={o.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderTop: '1px solid ' + B.sand }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: f1, fontWeight: 600, fontSize: 15, color: B.navy }}>{o.title}</div>
              {o.location && <div style={{ fontSize: 13, color: B.textMid, marginTop: 2 }}>{o.location}</div>}
            </div>
            {o.status && statusPill(o.status, '#E0F2FE', '#075985')}
          </div>
        ))}
      </Section>

      {/* Due today (work + maintenance) */}
      {showDue && (
        <Section icon="✅" title="Due today" count={dueOccs.length}>
          {dueOccs.length === 0 ? empty('Nothing due.') : dueOccs.map(o => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid ' + B.sand }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: f1, fontWeight: 600, fontSize: 15, color: B.navy }}>{o.title}</div>
                <div style={{ fontSize: 12, color: B.textLight, marginTop: 2 }}>{o.sourceType === 'maintenance_due' ? 'Maintenance' : 'Task'}</div>
              </div>
              {o.status && statusPill(o.status, B.cream, B.textMid)}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
