import { useState, useMemo, useContext } from 'react';
import { B, f1, f2, btnS } from '../components/brand/tokens.js';
import { localDateStr } from '../utils/date.js';
import { formatTimeRange } from '../utils/time.js';
import { getOccurrences } from '../lib/occurrences.js';
import { MobileCtx } from '../hooks/useMobile.js';
import { EmojiIcon } from '../components/primitives/EmojiIcon.jsx';

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
  const nothingAtAll = (!showJobs || shiftOccs.length === 0) && reservationOccs.length === 0 && (!showDue || dueOccs.length === 0);

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
            return (
              <div key={o.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderTop: '1px solid ' + B.sand }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: f1, fontWeight: 600, fontSize: 15, color: B.navy }}>{o.title}</div>
                  <div style={{ fontSize: 13, color: B.textMid, marginTop: 2 }}>
                    {o.startTime ? formatTimeRange(o.startTime, o.endTime) : 'All day'}{o.location ? ' · ' + o.location : ''}
                  </div>
                </div>
                {full
                  ? statusPill(`${filled}/${total} full`, '#DCFCE7', '#166534')
                  : statusPill(`${filled}/${total} · needs ${total - filled}`, '#FEF3E8', '#9A5E10')}
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
