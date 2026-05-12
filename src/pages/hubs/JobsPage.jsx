import { useState, useMemo, useContext, useEffect, useRef, memo } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { B, f1, f2, inp, btnP, btnS, btnD } from '../../components/brand/tokens.js';
import { Modal } from '../../components/primitives/Modal.jsx';
import { FF } from '../../components/primitives/FF.jsx';
import { MobileCtx } from '../../hooks/useMobile.js';
import { localDateStr, generateRecurrenceDates } from '../../utils/date.js';
import { printJobRoster } from '../../utils/print.js';
import { exportJobsICS } from '../../utils/ical.js';

function formatJobDate(dateStr) {
  if (!dateStr) return '—';
  // Slice to YYYY-MM-DD first so ISO datetime strings don't produce NaN
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

const JOB_STATUS_COLORS = {
  open:      { bg: '#DCFCE7', tx: '#166534', dot: '#16A34A' },
  closed:    { bg: '#FEF9C3', tx: '#854D0E', dot: '#EAB308' },
  completed: { bg: '#E0F2FE', tx: '#075985', dot: '#0EA5E9' },
  cancelled: { bg: '#F3F4F6', tx: '#6B7280', dot: '#9CA3AF' },
};

const emptyJob = () => ({ title: '', description: '', scheduledDate: '', scheduledTime: '', location: '', spotsTotal: 1, pay: '', status: 'open', jobLead: null, requiresWaiver: false, waiverText: '', requiredAccessTypes: [] });

const ACCESS_TYPE_LABELS = { background_check: 'Background Check', key_assignment: 'Key Assignment', certification: 'Certification', custom: 'Custom' };

const RECURRENCE_OPTIONS = [
  { v:'weekly', label:'Weekly' },
  { v:'biweekly', label:'Every 2 Weeks' },
  { v:'monthly', label:'Monthly' },
  { v:'quarterly', label:'Quarterly' },
  { v:'annually', label:'Annually' },
];

const emptyAnn = () => ({ title: '', body: '', expiresAt: '', pinned: false, repeatWeekly: false });

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const JobChip = memo(function JobChip({ job, onJobClick }) {
  const sc = JOB_STATUS_COLORS[job.status] || JOB_STATUS_COLORS.open;
  const filled = (job.signups || []).length;
  const total = job.spotsTotal || 1;
  const isFull = filled >= total && job.status === 'open';
  const chipBg = isFull ? '#FEF3E8' : sc.bg;
  const chipTx = isFull ? '#9A5E10' : sc.tx;
  const chipBorder = isFull ? '#F59E42' : sc.dot;
  return (
    <div
      role="button" tabIndex={0}
      onClick={e => { e.stopPropagation(); onJobClick(job); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onJobClick(job); } }}
      aria-label={`${job.title} — ${filled}/${total} spots filled, ${job.status}`}
      style={{ display:'flex', alignItems:'center', gap:4, padding:'2px 5px', borderRadius:5, background:chipBg, borderLeft:'3px solid '+chipBorder, cursor:'pointer', marginBottom:2, overflow:'hidden' }}
      title={job.title}>
      <span style={{ fontSize:11, color:chipTx, fontWeight:600, fontFamily:f1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1 }}>{job.title}</span>
      <span style={{ fontSize:10, color:chipTx, flexShrink:0 }}>{filled}/{total}</span>
    </div>
  );
});

function JobCalendar({ jobs, onJobClick, isMobile, todayStr: todayStrProp }) {
  // Derive 'now' at render time via useMemo so "Today" button stays correct after midnight.
  // Re-derived whenever the viewed month changes so the highlighted day follows the real clock.
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [expandedDay, setExpandedDay] = useState(null);

  // todayStr is passed down from the parent which also computes it via useMemo([]);
  // if not provided fall back to computing here (shouldn't happen in practice).
  const todayStr = todayStrProp || localDateStr(new Date());

  const jobsByDate = useMemo(() => {
    const map = new Map();
    jobs.forEach(j => {
      if (!j.scheduledDate) return;
      const key = j.scheduledDate.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(j);
    });
    return map;
  }, [jobs]);

  function prevMonth() {
    setExpandedDay(null);
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    setExpandedDay(null);
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1);
  }
  function goToday() {
    const now = new Date();
    setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); setExpandedDay(null);
  }

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();
    const days = [];
    for (let i = firstDay - 1; i >= 0; i--) days.push({ date: new Date(viewYear, viewMonth - 1, daysInPrev - i), isCurrentMonth: false });
    for (let d = 1; d <= daysInMonth; d++) days.push({ date: new Date(viewYear, viewMonth, d), isCurrentMonth: true });
    while (days.length % 7 !== 0) { const last = days[days.length - 1].date; days.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), isCurrentMonth: false }); }
    return days;
  }, [viewYear, viewMonth]);

  // Mobile: grouped list — derive fresh 'now' so groups are correct after midnight
  if (isMobile) {
    const now = new Date();
    const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);
    const monthEnd = new Date(now); monthEnd.setDate(now.getDate() + 30);
    const weekEndStr = localDateStr(weekEnd);
    const monthEndStr = localDateStr(monthEnd);
    const withDate = [...jobs].filter(j => j.scheduledDate).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
    const groups = [
      { label:'Overdue', jobs: withDate.filter(j => j.scheduledDate < todayStr && j.status === 'open') },
      { label:'This Week', jobs: withDate.filter(j => j.scheduledDate >= todayStr && j.scheduledDate <= weekEndStr) },
      { label:'Next 30 Days', jobs: withDate.filter(j => j.scheduledDate > weekEndStr && j.scheduledDate <= monthEndStr) },
      { label:'Later', jobs: withDate.filter(j => j.scheduledDate > monthEndStr) },
    ];
    return (
      <div>
        {groups.map(g => g.jobs.length > 0 && (
          <div key={g.label} style={{ marginBottom:20 }}>
            <div style={{ fontFamily:f1, fontWeight:700, fontSize:13, color:g.label==='Overdue' ? B.red : B.textMid, textTransform:'uppercase', letterSpacing:.8, marginBottom:8 }}>{g.label}</div>
            {g.jobs.map(j => {
              const sc = JOB_STATUS_COLORS[j.status] || JOB_STATUS_COLORS.open;
              return (
                <div key={j._docId}
                  role="button" tabIndex={0}
                  onClick={() => onJobClick(j)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onJobClick(j); } }}
                  aria-label={j.title}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10, background:B.white, border:'1px solid '+B.sand, marginBottom:6, cursor:'pointer' }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:sc.dot, flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:B.navy, fontFamily:f1 }}>{j.title}</div>
                    <div style={{ fontSize:12, color:B.textLight, marginTop:2 }}>{j.scheduledDate}{j.scheduledTime ? ' · '+j.scheduledTime : ''}</div>
                  </div>
                  <span style={{ fontSize:12, color:sc.tx, fontFamily:f1 }}>{(j.signups||[]).length}/{j.spotsTotal||1}</span>
                </div>
              );
            })}
          </div>
        ))}
        {jobs.filter(j => j.scheduledDate).length === 0 && <div style={{ textAlign:'center', color:B.textLight, fontSize:14, padding:32 }}>No jobs with dates.</div>}
      </div>
    );
  }

  // Desktop: month grid
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
        <button onClick={prevMonth} aria-label="Previous month" style={{ ...btnS, padding:'6px 12px', fontSize:16, lineHeight:1 }}>‹</button>
        <span style={{ fontFamily:f1, fontWeight:700, fontSize:18, color:B.navy, minWidth:200, textAlign:'center' }}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} aria-label="Next month" style={{ ...btnS, padding:'6px 12px', fontSize:16, lineHeight:1 }}>›</button>
        <button onClick={goToday} style={{ ...btnS, padding:'6px 14px', fontSize:13, marginLeft:4 }}>Today</button>
        {(() => { const total = [...jobsByDate.values()].reduce((a, b) => a + b.length, 0); return (
          <span style={{ marginLeft:'auto', fontSize:13, color:B.textLight, fontFamily:f1 }}>{total} job{total !== 1 ? 's' : ''} with dates</span>
        ); })()}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:2, marginBottom:2 }}>
        {DAY_NAMES.map(d => <div key={d} style={{ textAlign:'center', fontSize:12, fontWeight:700, color:B.textLight, fontFamily:f1, padding:'4px 0', textTransform:'uppercase', letterSpacing:.6 }}>{d}</div>)}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:2 }}>
        {calendarDays.map((day, idx) => {
          const ds = localDateStr(day.date);
          const dayJobs = jobsByDate.get(ds) || [];
          const isToday = ds === todayStr;
          const isExpanded = expandedDay === ds;
          const CHIP_LIMIT = 3;
          const visible = dayJobs.slice(0, CHIP_LIMIT);
          const overflow = dayJobs.length - CHIP_LIMIT;
          return (
            <div key={idx}
              style={{ minHeight:88, background:day.isCurrentMonth ? B.white : '#F8F8FA', borderRadius:8, border:'1px solid '+(isToday ? B.teal : B.sand), padding:'5px 6px', outline:isToday ? '2px solid '+B.teal : 'none', outlineOffset:'-1px' }}>
              <div style={{ fontSize:12, fontWeight:isToday ? 800 : 500, color:isToday ? B.teal : day.isCurrentMonth ? B.textDark : B.textLight, fontFamily:f1, marginBottom:3, textAlign:'right' }}>{day.date.getDate()}</div>
              {(isExpanded ? dayJobs : visible).map(j => <JobChip key={j._docId} job={j} onJobClick={onJobClick}/>)}
              {!isExpanded && overflow > 0 && (
                <button
                  onClick={() => setExpandedDay(ds)}
                  aria-label={`Show all ${dayJobs.length} jobs on ${ds}`}
                  style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:B.teal, fontWeight:700, fontFamily:f1, textAlign:'center', marginTop:2, padding:0, width:'100%' }}>
                  +{overflow} more
                </button>
              )}
              {isExpanded && overflow > 0 && (
                <button
                  onClick={() => setExpandedDay(null)}
                  aria-label="Collapse day"
                  style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:B.textLight, fontFamily:f1, textAlign:'center', marginTop:2, padding:0, width:'100%' }}>
                  Show less
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JobStatusBadge({ status }) {
  const s = JOB_STATUS_COLORS[status] || JOB_STATUS_COLORS.open;
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Open';
  return (
    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: f1, background: s.bg, color: s.tx, display: 'inline-block' }}>
      {label}
    </span>
  );
}

function SpotsBar({ job }) {
  const filled = (job.signups || []).length;
  const total = job.spotsTotal || 1;
  const pct = Math.min(100, (filled / total) * 100);
  const full = filled >= total;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: B.textMid, fontFamily: f2 }}>
          {filled}/{total} spot{total !== 1 ? 's' : ''} filled
        </span>
        {full && <span style={{ fontSize: 11, fontWeight: 700, color: B.red, fontFamily: f1 }}>FULL</span>}
      </div>
      <div style={{ height: 6, borderRadius: 3, background: B.sand, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: full ? B.red : B.teal, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

const JobCard = memo(function JobCard({ job, todayStr, isAdminOrManager, savingJobId, signed, full, onWaitlist, showRoster, onDetail, onWithdraw, onSignUp }) {
  // M-3 from the 2026-05-12 audit: skip hover affordances on mobile.
  // Otherwise a tap triggers onMouseEnter and the card stays in "hover"
  // state ("stuck hover") until the user taps elsewhere.
  const isMobile = useContext(MobileCtx);
  const overdue = job.scheduledDate && job.scheduledDate < todayStr && job.status === 'open';
  const hoverHandlers = isMobile ? {} : {
    onMouseEnter: (e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(27,42,74,0.1)'; },
    onMouseLeave: (e) => { e.currentTarget.style.boxShadow = 'none'; },
  };
  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onDetail(job)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDetail(job); } }}
      aria-label={`${job.title} — ${job.status}`}
      style={{ background: B.white, borderRadius: 14, border: '1px solid ' + (overdue ? '#FECACA' : B.sand), padding: 18, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
      {...hoverHandlers}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: B.textLight, background: B.warmGray, padding: '2px 6px', borderRadius: 4 }}>{job.jobNumber}</span>
          {job.recurrenceGroupId && <span title="Recurring series" style={{ fontSize:11, color:B.teal }}>🔁</span>}
        </div>
        <JobStatusBadge status={job.status} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, fontFamily: f1, color: B.navy, marginBottom: 6 }}>{job.title}</div>
      <div style={{ fontSize: 12, color: B.textMid, fontFamily: f2, marginBottom: 2 }}>
        📅 {formatJobDate(job.scheduledDate)}{job.scheduledTime ? ' at ' + job.scheduledTime : ''}
      </div>
      {job.location && (
        <div style={{ fontSize: 12, color: B.textMid, fontFamily: f2, marginBottom: 8 }}>📍 {job.location}</div>
      )}
      {job.pay != null && (
        <div style={{ fontSize: 14, fontWeight: 700, color: '#16A34A', fontFamily: f1, marginBottom: 10 }}>
          ${Number(job.pay).toFixed(2)} per person
        </div>
      )}
      <div style={{ marginBottom: 10 }}><SpotsBar job={job} /></div>
      {showRoster && (job.signups || []).length > 0 && (
        <div style={{ fontSize: 12, color: B.textMid, fontFamily: f2, marginBottom: 10 }}>
          {(job.signups || []).map(s => s.name).join(', ')}
        </div>
      )}
      {!isAdminOrManager && signed && (
        <div style={{ fontSize: 12, fontWeight: 700, color: B.teal, fontFamily: f1, marginBottom: 10 }}>✓ You're signed up</div>
      )}
      {!isAdminOrManager && onWaitlist && (
        <div style={{ fontSize: 12, fontWeight: 700, color: '#D97706', fontFamily: f1, marginBottom: 10 }}>⏳ You're on the waitlist</div>
      )}
      {isAdminOrManager && (job.waitlist || []).length > 0 && (
        <div style={{ fontSize: 11, color: '#92400E', fontFamily: f1, marginBottom: 6 }}>{(job.waitlist || []).length} on waitlist</div>
      )}
      {job.status === 'open' && (
        <div onClick={e => e.stopPropagation()}>
          {(() => {
            const isSaving = savingJobId === job._docId;
            // Past-dated open jobs are awaiting the 2am closePastJobs cron.
            // Show a disabled "Past" indicator instead of an enabled Sign Up button.
            if (overdue && !signed && !onWaitlist) {
              return (
                <button disabled
                  style={{ ...btnS, fontSize: 12, padding: '6px 12px', color: B.textLight, width: '100%', cursor: 'default', opacity: 0.6 }}>
                  Past — signups closed
                </button>
              );
            }
            return signed ? (
              <button onClick={() => onWithdraw(job)} disabled={!!savingJobId}
                style={{ ...btnS, fontSize: 12, padding: '6px 12px', color: B.red, borderColor: '#FECACA', width: '100%' }}>
                {isSaving ? 'Withdrawing…' : 'Withdraw'}
              </button>
            ) : onWaitlist ? (
              <button onClick={() => onWithdraw(job)} disabled={!!savingJobId}
                style={{ ...btnS, fontSize: 12, padding: '6px 12px', color: '#92400E', borderColor: '#FDE68A', width: '100%' }}>
                {isSaving ? '…' : 'Leave Waitlist'}
              </button>
            ) : full ? (
              <button onClick={() => onSignUp(job)} disabled={!!savingJobId}
                style={{ ...btnS, fontSize: 12, padding: '6px 12px', color: B.textMid, width: '100%' }}>
                {isSaving ? '…' : 'Join Waitlist'}
              </button>
            ) : (
              <button onClick={() => onSignUp(job)} disabled={!!savingJobId}
                style={{ ...btnP, fontSize: 12, padding: '6px 12px', width: '100%' }}>
                {isSaving ? 'Signing up…' : 'Sign Up'}
              </button>
            );
          })()}
        </div>
      )}
    </div>
  );
});

const MobileScheduleRow = memo(function MobileScheduleRow({ job, showRoster, onDetail }) {
  const sc = JOB_STATUS_COLORS[job.status] || JOB_STATUS_COLORS.open;
  const filled = (job.signups || []).length;
  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onDetail(job)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDetail(job); } }}
      aria-label={job.title}
      style={{ background:B.white, borderRadius:12, border:'1px solid '+B.sand, padding:'12px 14px', cursor:'pointer' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:B.navy, fontFamily:f1 }}>{job.title}</div>
          <div style={{ fontSize:12, color:B.textMid, fontFamily:f2 }}>📅 {formatJobDate(job.scheduledDate)}{job.scheduledTime ? ' · '+job.scheduledTime : ''}</div>
        </div>
        <span style={{ fontSize:11, fontWeight:700, color:sc.tx, background:sc.bg, padding:'2px 8px', borderRadius:12 }}>{job.status}</span>
      </div>
      <div style={{ fontSize:12, color:B.textMid, fontFamily:f2 }}>{filled}/{job.spotsTotal||1} spots filled</div>
      {showRoster && (job.signups||[]).length > 0 && (
        <div style={{ fontSize:12, color:B.textLight, fontFamily:f2, marginTop:4 }}>{(job.signups||[]).map(s=>s.name).join(', ')}</div>
      )}
    </div>
  );
});

const DesktopScheduleRow = memo(function DesktopScheduleRow({ job, todayStr, isAdminOrManager, rosterVisibility, showRoster, onDetail, onEdit }) {
  const sc = JOB_STATUS_COLORS[job.status] || JOB_STATUS_COLORS.open;
  const filled = (job.signups || []).length;
  const pct = Math.min(100, (filled / (job.spotsTotal||1)) * 100);
  const isPast = job.scheduledDate && job.scheduledDate < todayStr;
  return (
    <tr
      tabIndex={0} role="button" aria-label={job.title}
      onClick={() => onDetail(job)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDetail(job); } }}
      style={{ borderBottom:'1px solid '+B.sand, cursor:'pointer', opacity:isPast ? .65 : 1 }}
      onMouseEnter={e => e.currentTarget.style.background=B.warmGray}
      onMouseLeave={e => e.currentTarget.style.background=''}>
      <td style={{ padding:'10px 14px', fontFamily:f2, color:B.textDark, whiteSpace:'nowrap' }}>
        {formatJobDate(job.scheduledDate)}{job.scheduledTime ? <div style={{ fontSize:11, color:B.textLight }}>{job.scheduledTime}</div> : null}
      </td>
      <td style={{ padding:'10px 14px', fontFamily:f2, color:B.navy, fontWeight:600 }}>
        <div>{job.title}</div>
        <div style={{ fontSize:11, color:B.textLight, fontFamily:'monospace' }}>{job.jobNumber}</div>
      </td>
      <td style={{ padding:'10px 14px', fontFamily:f2, color:B.textMid }}>{job.location || '—'}</td>
      <td style={{ padding:'10px 14px', minWidth:100 }}>
        <div style={{ fontSize:12, color:B.textMid, marginBottom:3 }}>{filled}/{job.spotsTotal||1}</div>
        <div style={{ height:5, borderRadius:3, background:B.sand, overflow:'hidden' }}>
          <div style={{ height:'100%', width:pct+'%', background:filled>=(job.spotsTotal||1) ? B.red : B.teal, borderRadius:3 }}/>
        </div>
      </td>
      <td style={{ padding:'10px 14px' }}>
        <span style={{ fontSize:11, fontWeight:700, color:sc.tx, background:sc.bg, padding:'2px 8px', borderRadius:12 }}>{job.status}</span>
      </td>
      {(isAdminOrManager || rosterVisibility !== 'admin') && (
        <td style={{ padding:'10px 14px', fontFamily:f2, color:B.textMid, maxWidth:220 }}>
          {showRoster
            ? ((job.signups||[]).length === 0 ? <span style={{ color:B.textLight, fontSize:12 }}>None</span> : (job.signups||[]).map(s=>s.name).join(', '))
            : <span style={{ color:B.textLight, fontSize:12 }}>—</span>
          }
        </td>
      )}
      {isAdminOrManager && (
        <td style={{ padding:'10px 14px' }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onEdit(job)} style={{ ...btnS, fontSize:11, padding:'4px 8px' }}>Edit</button>
        </td>
      )}
    </tr>
  );
});

const AnnouncementCard = memo(function AnnouncementCard({ ann, isAdminOrManager, onTogglePin, onEdit, onDelete }) {
  return (
    <div style={{ background: B.white, borderRadius: 12, border: '1px solid ' + (ann.pinned ? B.teal : B.sand), padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {ann.pinned && <span style={{ fontSize: 11, fontWeight: 700, color: B.teal, fontFamily: f1 }}>📌 PINNED</span>}
            <span style={{ fontSize: 15, fontWeight: 700, color: B.navy, fontFamily: f1 }}>{ann.title}</span>
          </div>
          <div style={{ fontSize: 14, color: B.textDark, fontFamily: f2, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{ann.body}</div>
          <div style={{ fontSize: 11, color: B.textLight, fontFamily: f2, marginTop: 8 }}>
            Posted by {ann.createdByName}{ann.createdAt ? ' · ' + ann.createdAt.slice(0, 10) : ''}
            {ann.expiresAt ? ' · Expires ' + ann.expiresAt : ''}
          </div>
        </div>
        {isAdminOrManager && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => onTogglePin(ann)}
              title={ann.pinned ? 'Unpin' : 'Pin to top'}
              aria-label={ann.pinned ? 'Unpin announcement' : 'Pin announcement to top'}
              style={{ ...btnS, padding: '5px 9px', fontSize: 13 }}>
              {ann.pinned ? '📌' : '📍'}
            </button>
            <button onClick={() => onEdit(ann)} style={{ ...btnS, padding: '5px 9px', fontSize: 13 }}>Edit</button>
            <button onClick={() => onDelete(ann)} style={{ ...btnD, padding: '5px 9px', fontSize: 13 }}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
});

export function JobsPage({ store, userProfile }) {
  const {
    jobListings, jobAnnouncements,
    addJobListing, addJobListingSeries, updateJobListing, deleteJobListing, updateJobListingSeries, deleteJobListingSeries, deleteJobListingSeriesFrom,
    signUpForJob, withdrawFromJob, updateJobSignupAttendance,
    addJobAnnouncement, updateJobAnnouncement, deleteJobAnnouncement,
    addTask, updateUser,
    accessPeople, accessRecords,
    getJobSwapRequests, addJobSwapRequest, deleteJobSwapRequest,
    users, notificationConfig, config, settings,
  } = store;
  const isMobile = useContext(MobileCtx);

  const userId = userProfile?.id || userProfile?.uid;
  const userName = userProfile?.name || 'Unknown';
  const isAdminOrManager = userProfile?.role === 'admin' || userProfile?.role === 'manager';
  const todayStr = useMemo(() => localDateStr(new Date()), []);

  // ── All state before any useEffect ──
  const [view, setView] = useState('jobs');
  const [statusFilter, setStatusFilter] = useState('open');
  const [showNewJob, setShowNewJob] = useState(false);
  const [jobForm, setJobForm] = useState(emptyJob());
  const [editJobId, setEditJobId] = useState(null);
  const [showJobDetail, setShowJobDetail] = useState(null);
  const [showNewAnn, setShowNewAnn] = useState(false);
  const [annForm, setAnnForm] = useState(emptyAnn());
  const [editAnnId, setEditAnnId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingJobId, setSavingJobId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [reportsScope, setReportsScope] = useState('90d'); // 'all' | '90d' | '30d'
  const [showPastJobs, setShowPastJobs] = useState(() => {
    try { return localStorage.getItem('jobs_showPast') === 'true'; } catch { return false; }
  });
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFreq, setRecurrenceFreq] = useState('weekly');
  const [recurrenceSeriesEndDate, setRecurrenceSeriesEndDate] = useState('');
  const [seriesEditScope, setSeriesEditScope] = useState('this');
  const [editJobSeriesGroupId, setEditJobSeriesGroupId] = useState(null);
  const [editJobFromDate, setEditJobFromDate] = useState('');
  const flashTimerRef = useRef(null);
  const [showConvertToTaskModal, setShowConvertToTaskModal] = useState(false);
  const [convertTaskForm, setConvertTaskForm] = useState({ name: '', dueDate: '', description: '' });
  const [convertTaskSaving, setConvertTaskSaving] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapNote, setSwapNote] = useState('');
  const [swapSaving, setSwapSaving] = useState(false);
  const [swapRequests, setSwapRequests] = useState([]);
  const [swapRequestsJobId, setSwapRequestsJobId] = useState(null);
  const [showDelegatesModal, setShowDelegatesModal] = useState(false);
  const [jobDelegates, setJobDelegates] = useState(() => userProfile?.jobPosterDelegates || []);
  const [savingDelegates, setSavingDelegates] = useState(false);
  const [showPrintRosterModal, setShowPrintRosterModal] = useState(false);
  const [printRosterSelectedIds, setPrintRosterSelectedIds] = useState(() => new Set());

  function flash(text, isError = false) {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setMsg({ text, isError });
    flashTimerRef.current = setTimeout(() => setMsg(null), 5000);
  }

  // Cleanup flash timer on unmount
  useEffect(() => () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); }, []);

  // Sync delegate list if userProfile updates (e.g. saved from another session or Settings)
  useEffect(() => { setJobDelegates(userProfile?.jobPosterDelegates || []); }, [userProfile?.jobPosterDelegates]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load swap requests when admin opens job detail
  useEffect(() => {
    if (!showJobDetail || !isAdminOrManager) { setSwapRequests([]); setSwapRequestsJobId(null); return; }
    if (showJobDetail._docId === swapRequestsJobId) return;
    setSwapRequestsJobId(showJobDetail._docId);
    getJobSwapRequests(showJobDetail._docId).then(setSwapRequests).catch(err => { console.error('[ChurchOpsHub] getJobSwapRequests failed', err); });
  }, [showJobDetail, isAdminOrManager, getJobSwapRequests, swapRequestsJobId]);

  // Persist showPastJobs toggle
  useEffect(() => {
    try { localStorage.setItem('jobs_showPast', String(showPastJobs)); } catch { /* ignore */ }
  }, [showPastJobs]);

  function sendAnnouncementEmails(title, body) {
    if (!(notificationConfig?.enabled)) return;
    const fn = httpsCallable(getFunctions(), 'sendJobAnnouncementEmails');
    // Note: postedBy is now derived server-side from the caller's user profile
    fn({ churchId: userProfile?.churchId, title, body }).catch(err => { console.error('[ChurchOpsHub] CF sendJobAnnouncementEmails failed', err); });
  }

  // ── Derived state ──
  const isSignedUp = (job) => (job.signups || []).some(s => s.uid === userId);
  const isOnWaitlist = (job) => (job.waitlist || []).some(w => w.uid === userId);
  const isFull = (job) => (job.signups || []).length >= (job.spotsTotal || 1);
  const rosterVisibility = settings?.jobsRosterVisibility ?? 'signups';
  const canSeeRoster = (job) => isAdminOrManager || rosterVisibility === 'all' || (rosterVisibility === 'signups' && isSignedUp(job));
  const recurrencePreviewCount = useMemo(() => generateRecurrenceDates(jobForm.scheduledDate, recurrenceFreq, recurrenceSeriesEndDate).length, [jobForm.scheduledDate, recurrenceFreq, recurrenceSeriesEndDate]);
  const adminManagerUsers = useMemo(() => (users || []).filter(u => (u.role === 'admin' || u.role === 'manager') && u.id !== userId), [users, userId]);

  async function handleSaveDelegates(next) {
    setSavingDelegates(true);
    try { await updateUser(userId, { jobPosterDelegates: next }); setJobDelegates(next); } catch { /* ignore */ }
    setSavingDelegates(false);
  }

  const leaderboard = useMemo(() => {
    const cutoff = (() => {
      if (reportsScope === 'all') return null;
      const d = new Date();
      d.setDate(d.getDate() - (reportsScope === '30d' ? 30 : 90));
      return localDateStr(d);
    })();
    const stats = {};
    (jobListings || []).forEach(job => {
      if (cutoff && job.scheduledDate && job.scheduledDate < cutoff) return;
      (job.signups || []).forEach(s => {
        if (!stats[s.uid]) stats[s.uid] = { uid: s.uid, name: s.name, jobs: 0, attended: 0, noShow: 0, totalPay: 0 };
        stats[s.uid].jobs++;
        if (s.attended === true) { stats[s.uid].attended++; stats[s.uid].totalPay += Number(job.pay || 0); }
        else if (s.attended === false) stats[s.uid].noShow++;
      });
    });
    return Object.values(stats).sort((a, b) => b.attended - a.attended || b.jobs - a.jobs || a.name.localeCompare(b.name));
  }, [jobListings, reportsScope]);

  const filteredJobs = useMemo(() => {
    let jobs = jobListings || [];
    if (statusFilter === 'mine') jobs = jobs.filter(j => isSignedUp(j));
    else if (statusFilter !== 'all') jobs = jobs.filter(j => j.status === statusFilter);
    // Open filter: hide past-dated open jobs (awaiting closePastJobs cron at 2am Central)
    // so members can't sign up for jobs that have already happened.
    if (statusFilter === 'open') jobs = jobs.filter(j => !j.scheduledDate || j.scheduledDate >= todayStr);
    return [...jobs].sort((a, b) =>
      (a.scheduledDate || '').localeCompare(b.scheduledDate || '') ||
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
  }, [jobListings, statusFilter, userId, todayStr]);

  const visibleAnnouncements = useMemo(() => {
    // >= means announcement is visible ON the expiry day (inclusive). Admins see it disappear the next day.
    const ann = (jobAnnouncements || []).filter(a => !a.expiresAt || a.expiresAt >= todayStr);
    return [...ann].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }, [jobAnnouncements, todayStr]);

  const scheduleJobs = useMemo(() => {
    const jobs = [...(jobListings || [])].sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));
    return showPastJobs ? jobs : jobs.filter(j => (j.scheduledDate || '') >= todayStr || !j.scheduledDate);
  }, [jobListings, showPastJobs, todayStr]);

  // Keep detail in sync with live store data; memoized to avoid re-running find() on every render
  const liveDetail = useMemo(
    () => showJobDetail ? (jobListings || []).find(j => j._docId === showJobDetail._docId) || showJobDetail : null,
    [jobListings, showJobDetail]
  );

  // Auto-close detail modal when the job is deleted by another user in real time
  useEffect(() => {
    if (!showJobDetail) return;
    const stillExists = (jobListings || []).some(j => j._docId === showJobDetail._docId);
    if (!stillExists) setShowJobDetail(null);
  }, [jobListings, showJobDetail]);

  // ── Job form handlers ──
  function openNewJob() {
    setJobForm(emptyJob());
    setEditJobId(null);
    setIsRecurring(false);
    setRecurrenceFreq('weekly');
    setRecurrenceSeriesEndDate('');
    setSeriesEditScope('this');
    setEditJobSeriesGroupId(null);
    setEditJobFromDate('');
    setShowNewJob(true);
  }

  function openEditJob(job) {
    setJobForm({
      title: job.title || '',
      description: job.description || '',
      scheduledDate: job.scheduledDate || '',
      scheduledTime: job.scheduledTime || '',
      location: job.location || '',
      spotsTotal: job.spotsTotal || 1,
      pay: job.pay != null ? String(job.pay) : '',
      status: job.status || 'open',
      jobLead: job.jobLead || null,
      requiresWaiver: job.requiresWaiver || false,
      waiverText: job.waiverText || '',
      requiredAccessTypes: job.requiredAccessTypes || [],
    });
    setIsRecurring(false);
    setRecurrenceFreq('weekly');
    setRecurrenceSeriesEndDate('');
    setSeriesEditScope('this');
    setEditJobSeriesGroupId(job.recurrenceGroupId || null);
    setEditJobFromDate(job.scheduledDate || '');
    setEditJobId(job._docId);
    setShowNewJob(true);
  }

  async function handleSaveJob() {
    if (!isAdminOrManager) return;
    if (!jobForm.title.trim() || !jobForm.scheduledDate) return;
    // Validate raw spots input BEFORE clamping so the user gets explicit feedback
    // when they enter 0 or blank, instead of a silent Math.max(1, ...) override.
    const rawSpots = Number(jobForm.spotsTotal);
    if (!Number.isFinite(rawSpots) || rawSpots < 1) {
      flash('Spots must be at least 1.', true);
      return;
    }
    const spots = Math.floor(rawSpots);
    const existingJob = editJobId ? (jobListings || []).find(j => j._docId === editJobId) : null;
    const currentSignups = (existingJob?.signups || []).length;
    if (spots < currentSignups) {
      flash(`Cannot reduce spots below current signup count (${currentSignups}).`, true);
      return;
    }
    const terminalStatuses = ['cancelled', 'closed'];
    const isGoingTerminal = existingJob?.status === 'open' && terminalStatuses.includes(jobForm.status);
    const willNotify = isGoingTerminal && currentSignups > 0 && notificationConfig?.enabled;
    if (isGoingTerminal && currentSignups > 0) {
      const confirmMsg = willNotify
        ? `This job has ${currentSignups} signup${currentSignups !== 1 ? 's' : ''}. Changing to "${jobForm.status}" will send them a cancellation email. Continue?`
        : `This job has ${currentSignups} signup${currentSignups !== 1 ? 's' : ''}. Changing to "${jobForm.status}" will not notify them. Continue?`;
      if (!window.confirm(confirmMsg)) return;
    }
    // Validate recurring series config before creating
    if (!editJobId && isRecurring) {
      if (!recurrenceSeriesEndDate) { flash('Please set a series end date.', true); return; }
      if (recurrenceSeriesEndDate < jobForm.scheduledDate) { flash('Series end date must be after the start date.', true); return; }
      if (recurrencePreviewCount === 0) { flash('No dates generated. Check start and end dates.', true); return; }
    }
    setSaving(true);
    try {
      const data = {
        ...jobForm,
        spotsTotal: spots,
        pay: jobForm.pay === '' ? null : Math.max(0, Number(jobForm.pay)),
      };
      if (editJobId && seriesEditScope === 'future' && editJobSeriesGroupId) {
        // Series edit — apply changes to this and all future jobs
        if (isGoingTerminal) {
          if (!window.confirm(`Change status to "${jobForm.status}" for this and all future jobs in the series? Existing signups will be emailed.`)) { setSaving(false); return; }
        }
        const { count, affected } = await updateJobListingSeries(editJobSeriesGroupId, editJobFromDate, data, userId, userName);
        // On a series cancellation, fan out per-job emails to existing signups.
        // sendJobCancelledEmails has a 1-hour debounce so a re-fire is safe.
        if (jobForm.status === 'cancelled' && affected) {
          const fn = httpsCallable(getFunctions(), 'sendJobCancelledEmails');
          affected
            .filter((a) => a.signupCount > 0)
            .forEach((a) => {
              fn({ churchId: userProfile?.churchId, jobDocId: a.docId })
                .catch((err) => console.error('[ChurchOpsHub] CF sendJobCancelledEmails (series) failed', err));
            });
        }
        flash(`${count} job${count !== 1 ? 's' : ''} updated.`);
        setShowNewJob(false);
        setEditJobId(null);
      } else if (editJobId) {
        await updateJobListing(editJobId, data, userId, userName, existingJob?.jobNumber);
        if (willNotify) {
          const fn = httpsCallable(getFunctions(), 'sendJobCancelledEmails');
          fn({ churchId: userProfile?.churchId, jobDocId: editJobId }).catch(err => { console.error('[ChurchOpsHub] CF sendJobCancelledEmails failed', err); });
        }
        // Notify original poster if a co-admin cancelled their job
        if (jobForm.status === 'cancelled' && existingJob?.createdBy && existingJob.createdBy !== userId && notificationConfig?.enabled) {
          const fn = httpsCallable(getFunctions(), 'sendJobPosterNotification');
          fn({ churchId: userProfile?.churchId, jobDocId: editJobId, event: 'cancellation', actorUid: userId, actorName: userName })
            .catch(err => { console.error('[ChurchOpsHub] CF sendJobPosterNotification (cancellation) failed', err); });
        }
        flash('Job updated.' + (willNotify ? ' Signups notified.' : ''));
        setShowNewJob(false);
        setEditJobId(null);
      } else if (isRecurring) {
        await addJobListingSeries(data, recurrenceFreq, recurrenceSeriesEndDate, userId, userName);
        flash(`${recurrencePreviewCount} recurring job${recurrencePreviewCount !== 1 ? 's' : ''} posted.`);
      } else {
        await addJobListing(data, userId, userName);
        flash('Job posted.');
      }
      setShowNewJob(false);
      setEditJobId(null);
    } catch (err) {
      flash(err?.message || 'Failed to save job.', true);
    }
    setSaving(false);
  }

  function handleNotifySignups(job) {
    if (!isAdminOrManager) return;
    if (!window.confirm(`Send a cancellation email to ${(job.signups || []).length} signup${(job.signups || []).length !== 1 ? 's' : ''}?`)) return;
    const fn = httpsCallable(getFunctions(), 'sendJobCancelledEmails');
    fn({ churchId: userProfile?.churchId, jobDocId: job._docId })
      .then(result => {
        if (result.data?.skipped) flash('Already notified recently — no new emails sent.');
        else flash('Signups notified.');
      })
      .catch(err => { console.error('[ChurchOpsHub] CF sendJobCancelledEmails (notify) failed', err); flash('Failed to send notifications.', true); });
  }

  // Fires sendJobCancelledEmails for each affected job that has signups.
  // Awaited so the CF reads the still-existing doc before the delete commits.
  // The CF has a 1-hour debounce, so a soft-cancel-then-delete won't double-fire.
  async function notifySignupsForDelete(affectedJobs) {
    if (!notificationConfig?.enabled) return;
    const fn = httpsCallable(getFunctions(), 'sendJobCancelledEmails');
    const withSignups = affectedJobs.filter(j => (j.signups || []).length > 0);
    if (withSignups.length === 0) return;
    await Promise.allSettled(withSignups.map(j =>
      fn({ churchId: userProfile?.churchId, jobDocId: j._docId })
        .catch(err => { console.error('[ChurchOpsHub] CF sendJobCancelledEmails (pre-delete) failed', err); })
    ));
  }

  async function handleDeleteJob(job) {
    if (!isAdminOrManager) return;
    const signupCount = (job.signups || []).length;
    const willNotify = signupCount > 0 && notificationConfig?.enabled;
    const confirmMsg = signupCount > 0
      ? (willNotify
          ? `Delete "${job.title}"? ${signupCount} signup${signupCount !== 1 ? 's' : ''} will be emailed about the cancellation. This cannot be undone.`
          : `Delete "${job.title}"? ${signupCount} signup${signupCount !== 1 ? 's' : ''} will NOT be notified (notifications are off). This cannot be undone.`)
      : `Delete "${job.title}"? This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;
    try {
      await notifySignupsForDelete([job]);
      await deleteJobListing(job._docId, userId, userName, job.jobNumber);
      setShowJobDetail(null);
      flash('Job deleted.');
    } catch { flash('Failed to delete job.', true); }
  }

  async function handleDeleteSeries(job) {
    if (!isAdminOrManager) return;
    const seriesJobs = (jobListings || []).filter(j => j.recurrenceGroupId === job.recurrenceGroupId);
    const signupCount = seriesJobs.reduce((sum, j) => sum + (j.signups || []).length, 0);
    const willNotify = signupCount > 0 && notificationConfig?.enabled;
    const confirmMsg = signupCount > 0
      ? (willNotify
          ? `Delete the entire recurring series for "${job.title}"? ${signupCount} signup${signupCount !== 1 ? 's' : ''} across ${seriesJobs.length} job${seriesJobs.length !== 1 ? 's' : ''} will be emailed about the cancellation.`
          : `Delete the entire recurring series for "${job.title}"? ${signupCount} signup${signupCount !== 1 ? 's' : ''} will NOT be notified (notifications are off).`)
      : `Delete the entire recurring series for "${job.title}"? All jobs in this series will be permanently deleted.`;
    if (!window.confirm(confirmMsg)) return;
    try {
      await notifySignupsForDelete(seriesJobs);
      await deleteJobListingSeries(job.recurrenceGroupId, userId, userName);
      setShowJobDetail(null);
      flash('Series deleted.');
    } catch { flash('Failed to delete series.', true); }
  }

  async function handleDeleteSeriesFrom(job) {
    if (!isAdminOrManager) return;
    const seriesJobs = (jobListings || []).filter(j => j.recurrenceGroupId === job.recurrenceGroupId && j.scheduledDate >= job.scheduledDate);
    const signupCount = seriesJobs.reduce((sum, j) => sum + (j.signups || []).length, 0);
    const willNotify = signupCount > 0 && notificationConfig?.enabled;
    const confirmMsg = signupCount > 0
      ? (willNotify
          ? `Delete "${job.title}" and all future jobs in this series? ${signupCount} signup${signupCount !== 1 ? 's' : ''} across ${seriesJobs.length} job${seriesJobs.length !== 1 ? 's' : ''} will be emailed about the cancellation.`
          : `Delete "${job.title}" and all future jobs in this series? ${signupCount} signup${signupCount !== 1 ? 's' : ''} will NOT be notified (notifications are off).`)
      : `Delete "${job.title}" and all future jobs in this series? Past jobs are kept.`;
    if (!window.confirm(confirmMsg)) return;
    try {
      await notifySignupsForDelete(seriesJobs);
      await deleteJobListingSeriesFrom(job.recurrenceGroupId, job.scheduledDate, userId, userName);
      setShowJobDetail(null);
      flash('This and future series jobs deleted.');
    } catch { flash('Failed to delete series jobs.', true); }
  }

  async function handleSignUp(job) {
    // Past-dated open jobs are a transient state — they'll be closed by the
    // closePastJobs cron at 2am Central, but until then they're still status=open
    // and would otherwise be signup-able. Reject explicitly.
    if (job.scheduledDate && job.scheduledDate < todayStr) {
      flash('This job has already happened and is no longer open for signups.', true);
      return;
    }
    // Capacity-first: if the job is full, ask the user up front whether they
    // want to join the waitlist before running compliance/waiver gates.
    // Avoids the confusing "you need a Background Check" error for a job they
    // wouldn't have fit into anyway (Jobs Hub audit #11).
    const jobIsFull = (job.signups || []).length >= (job.spotsTotal || 1);
    const onWaitlistAlready = (job.waitlist || []).some(w => w.uid === userId);
    if (jobIsFull && !onWaitlistAlready) {
      const wl = (job.waitlist || []).length;
      if (wl >= 50) {
        flash('This job is full and the waitlist is at capacity.', true);
        return;
      }
      const ok = window.confirm(`This job is full. ${wl > 0 ? `${wl} other${wl !== 1 ? 's' : ''} on the waitlist. ` : ''}Join the waitlist?`);
      if (!ok) return;
    }
    if ((job.requiredAccessTypes || []).length > 0) {
      const linkedPersons = (accessPeople || []).filter(p => p.userId === userId);
      if (linkedPersons.length === 0) {
        flash('You need a People Access record linked to your account to sign up for this job.', true);
        return;
      }
      const todayS = localDateStr(new Date());
      const linkedIds = new Set(linkedPersons.map(p => p._docId));
      const myRecords = (accessRecords || []).filter(r => linkedIds.has(r.personId));
      for (const reqType of job.requiredAccessTypes) {
        const hasValid = myRecords.some(r => r.type === reqType && (!r.expiryDate || r.expiryDate >= todayS));
        if (!hasValid) {
          flash(`You need a valid ${ACCESS_TYPE_LABELS[reqType] || reqType} on file to sign up for this job.`, true);
          return;
        }
      }
    }
    if (job.requiresWaiver && job.waiverText) {
      const confirmed = window.confirm(`By signing up, you agree to the following:\n\n${job.waiverText}\n\nDo you agree?`);
      if (!confirmed) return;
    }
    setSavingJobId(job._docId);
    try {
      const result = await signUpForJob(job._docId, userId, userName);
      if (result?.error) flash(result.error, true);
      else if (result?.wasWaitlisted) flash("You've been added to the waitlist!");
      else flash('You signed up!');
    } catch (err) {
      flash(err?.message ? `Sign-up failed: ${err.message}` : 'Sign-up failed. Please try again.', true);
    }
    finally { setSavingJobId(null); }
  }

  async function handleWithdraw(job) {
    const onWL = isOnWaitlist(job);
    if (!window.confirm(onWL ? 'Remove yourself from the waitlist?' : 'Remove yourself from this job?')) return;
    setSavingJobId(job._docId);
    try {
      const result = await withdrawFromJob(job._docId, userId, userId, userName);
      if (result?.wasSignedUp) {
        flash('Removed from job.');
        if (notificationConfig?.enabled) {
          const fn = httpsCallable(getFunctions(), 'sendJobPosterNotification');
          fn({ churchId: userProfile?.churchId, jobDocId: job._docId, event: 'withdrawal', actorUid: userId, actorName: userName }).catch(err => { console.error('[ChurchOpsHub] CF sendJobPosterNotification (withdrawal) failed', err); });
        }
        // F-RC-3 from the 2026-05-12 audit: await the promotion so a tab close
        // between the withdrawal commit and the CF call doesn't drop the
        // promotion entirely. The freed spot would otherwise stay empty
        // forever despite an eligible waitlist.
        try {
          await httpsCallable(getFunctions(), 'promoteFromWaitlist')({ churchId: userProfile?.churchId, jobDocId: job._docId });
        } catch (err) {
          console.error('[ChurchOpsHub] CF promoteFromWaitlist failed', err);
        }
      } else if (result?.wasOnWaitlist) {
        flash('Removed from waitlist.');
      }
    } catch { flash('Failed to withdraw.', true); }
    finally { setSavingJobId(null); }
  }

  async function handleAdminRemoveSignup(job, uid) {
    if (!isAdminOrManager) return;
    const removedSignup = (job.signups || []).find(s => s.uid === uid);
    const removedWaiter = (job.waitlist || []).find(w => w.uid === uid);
    const removed = removedSignup || removedWaiter;
    if (!window.confirm(`Remove ${removed?.name || 'this person'}?`)) return;
    try {
      const result = await withdrawFromJob(job._docId, uid, userId, userName);
      if (result?.wasSignedUp) {
        flash('Removed.');
        if (notificationConfig?.enabled && job.createdBy !== userId) {
          const fn = httpsCallable(getFunctions(), 'sendJobPosterNotification');
          fn({ churchId: userProfile?.churchId, jobDocId: job._docId, event: 'admin_removal', actorUid: userId, actorName: userName, removedName: removed?.name || '' }).catch(err => { console.error('[ChurchOpsHub] CF sendJobPosterNotification (admin_removal) failed', err); });
        }
        httpsCallable(getFunctions(), 'promoteFromWaitlist')({ churchId: userProfile?.churchId, jobDocId: job._docId }).catch(err => { console.error('[ChurchOpsHub] CF promoteFromWaitlist failed', err); });
      } else if (result?.wasOnWaitlist) {
        flash('Removed from waitlist.');
      }
    } catch { flash('Failed to remove.', true); }
  }

  async function handleUpdateAttendance(job, uid, attended) {
    if (!isAdminOrManager) return;
    try {
      await updateJobSignupAttendance(job._docId, uid, attended);
    } catch { flash('Failed to update attendance.', true); }
  }

  function openConvertToTask(job) {
    setConvertTaskForm({ name: job.title || '', dueDate: job.scheduledDate || '', description: job.description || '' });
    setShowConvertToTaskModal(true);
  }

  async function handleConvertToTask() {
    if (!liveDetail || !convertTaskForm.name.trim()) return;
    setConvertTaskSaving(true);
    try {
      const taskDocId = await addTask({
        name: convertTaskForm.name.trim(),
        description: convertTaskForm.description || '',
        dueDate: convertTaskForm.dueDate || null,
        priority: 'Medium',
        status: 'Planning',
        visibility: 'team',
        assignees: [],
        tags: [],
        checklist: [],
        sharedWith: [],
        parentTaskId: null,
        blockedBy: [],
        linkedItemDocId: null,
        linkedTicketDocId: null,
        estimatedHours: null,
        actualHours: null,
        ministry: '',
        linkedJobDocId: liveDetail._docId,
      }, userId, userName);
      await updateJobListing(liveDetail._docId, { linkedTaskDocId: taskDocId }, userId, userName, liveDetail.jobNumber);
      setShowJobDetail(prev => ({ ...prev, linkedTaskDocId: taskDocId }));
      setShowConvertToTaskModal(false);
      flash('Task created and linked.');
    } catch (err) {
      flash(err?.message || 'Failed to create task.', true);
    }
    setConvertTaskSaving(false);
  }

  async function handleSubmitSwapRequest() {
    if (!liveDetail) return;
    setSwapSaving(true);
    try {
      await addJobSwapRequest(liveDetail._docId, userId, userName, swapNote.trim());
      setShowSwapModal(false);
      setSwapNote('');
      flash('Swap request submitted. An admin will follow up.');
    } catch {
      flash('Failed to submit swap request.', true);
    }
    setSwapSaving(false);
  }

  async function handleDeleteSwapRequest(reqDocId) {
    try {
      await deleteJobSwapRequest(reqDocId);
      setSwapRequests(prev => prev.filter(r => r._docId !== reqDocId));
      flash('Swap request dismissed.');
    } catch {
      flash('Failed to dismiss request.', true);
    }
  }

  // ── Announcement handlers ──
  function openNewAnn() {
    setAnnForm(emptyAnn());
    setEditAnnId(null);
    setShowNewAnn(true);
  }

  function openEditAnn(ann) {
    setAnnForm({
      title: ann.title || '',
      body: ann.body || '',
      expiresAt: ann.expiresAt || '',
      pinned: !!ann.pinned,
      repeatWeekly: !!ann.repeatWeekly,
    });
    setEditAnnId(ann._docId);
    setShowNewAnn(true);
  }

  async function handleSaveAnn() {
    if (!isAdminOrManager) return;
    if (!annForm.title.trim() || !annForm.body.trim()) return;
    setSaving(true);
    try {
      const data = { ...annForm, expiresAt: annForm.expiresAt || null };
      if (editAnnId) {
        await updateJobAnnouncement(editAnnId, data, userId, userName);
        flash('Announcement updated.');
      } else {
        await addJobAnnouncement(data, userId, userName);
        flash('Announcement posted.');
        sendAnnouncementEmails(annForm.title, annForm.body);
      }
      setShowNewAnn(false);
      setEditAnnId(null);
    } catch {
      flash('Failed to save.', true);
    }
    setSaving(false);
  }

  async function handleDeleteAnn(ann) {
    if (!isAdminOrManager) return;
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await deleteJobAnnouncement(ann._docId, userId, userName);
      flash('Deleted.');
    } catch { flash('Failed to delete announcement.', true); }
  }

  async function handleTogglePin(ann) {
    if (!isAdminOrManager) return;
    try {
      await updateJobAnnouncement(ann._docId, { pinned: !ann.pinned }, userId, userName);
    } catch { flash('Failed to update pin.', true); }
  }

  return (
    <div>
      {/* Flash messages — fixed-position so they appear above modals (z-index 1100 > Modal's 1000).
          C-3 from the 2026-05-12 audit: top offset uses env(safe-area-inset-top) so notched iPhones
          don't hide the banner behind the URL bar / notch. */}
      {msg && (
        <div style={{ position:'fixed', top:'calc(env(safe-area-inset-top, 0px) + 16px)', left:'50%', transform:'translateX(-50%)', zIndex:1100, maxWidth:'min(560px, calc(100vw - 32px))', minWidth:'280px', display:'flex', alignItems:'center', justifyContent:'space-between', background:msg.isError?'#FEE8E8':B.tealPale, border:`1px solid ${msg.isError?'#FECACA':B.tealLight}`, borderRadius:10, padding:'10px 16px', fontSize:14, fontWeight:600, color:msg.isError?B.red:B.teal, boxShadow:'0 4px 16px rgba(27,42,74,0.18)' }}>
          <span>{msg.text}</span>
          <button onClick={()=>setMsg(null)} aria-label="Dismiss message" style={{ border:'none', background:'none', cursor:'pointer', color:'inherit', fontSize:18, lineHeight:1, marginLeft:8, padding:'6px 10px', fontWeight:700 }}>&times;</button>
        </div>
      )}

      {/* Notifications-off hint for admins/managers */}
      {isAdminOrManager && !notificationConfig?.enabled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: B.goldLight, border: '1px solid ' + B.gold, borderRadius: 8, padding: '8px 14px', marginBottom: 16, fontFamily: f2, fontSize: 13, color: B.textDark }}>
          <span>⚠️</span>
          <span>Email notifications are off — signups won't receive reminders or cancellation alerts. <strong>Settings → Notifications</strong> to enable.</span>
        </div>
      )}

      {/* View tabs — H-4 from the 2026-05-12 audit: on mobile use a single
          horizontal-scroll row instead of wrap-to-N-rows so we don't push
          content way below the fold. */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', paddingBottom: isMobile ? 4 : 0 }}>
        {[['jobs', '💼 Job Board'], ['schedule', '📋 Schedule'], ['calendar', '📅 Calendar'], ['announcements', '📢 Announcements'], ...(isAdminOrManager ? [['reports', '📊 Reports']] : [])].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            style={{ padding: '8px 18px', borderRadius: 20, border: '1px solid ' + (view === v ? B.teal : B.sand), background: view === v ? B.tealPale : B.white, color: view === v ? B.teal : B.textMid, fontFamily: f1, fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Job Board ── */}
      {view === 'jobs' && (
        <div>
          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
              {[['mine','My Jobs'],['open','Open'],['closed','Closed'],['completed','Completed'],['cancelled','Cancelled'],['all','All']].map(([v, label]) => (
                <button key={v} onClick={() => setStatusFilter(v)}
                  style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid ' + (statusFilter === v ? B.teal : B.sand), background: statusFilter === v ? 'rgba(42,125,110,0.1)' : B.white, color: statusFilter === v ? B.teal : B.textMid, fontSize: 13, fontWeight: 600, fontFamily: f1, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {label}
                </button>
              ))}
            </div>
            {isAdminOrManager && (
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setShowDelegatesModal(true)} style={{ ...btnS, padding: '8px 14px', fontSize: 13, whiteSpace: 'nowrap' }} title="Manage who receives your job notification emails">📧 Delegates</button>
                <button onClick={() => {
                  const url = `${window.location.origin}?jobs=${userProfile?.churchId}&cn=${encodeURIComponent(config?.churchName || '')}&cc=${encodeURIComponent(config?.churchCode || '')}`;
                  navigator.clipboard.writeText(url).then(() => flash('Job board link copied!')).catch(() => flash('Could not copy link.', true));
                }} style={{ ...btnS, padding: '8px 14px', fontSize: 13, whiteSpace: 'nowrap' }}>Share Board</button>
                <button onClick={openNewJob} style={{ ...btnP, padding: '8px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>+ Post Job</button>
              </div>
            )}
          </div>

          {/* Job cards */}
          {filteredJobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: B.textLight, fontFamily: f2, fontSize: 14 }}>
              {statusFilter === 'mine' ? "You haven't signed up for any jobs yet." : statusFilter === 'open' ? 'No open jobs right now — check back soon!' : 'No jobs in this category.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {filteredJobs.map(job => (
                <JobCard key={job._docId} job={job}
                  todayStr={todayStr} isAdminOrManager={isAdminOrManager} savingJobId={savingJobId}
                  signed={isSignedUp(job)} full={isFull(job)} onWaitlist={isOnWaitlist(job)} showRoster={canSeeRoster(job)}
                  onDetail={setShowJobDetail} onWithdraw={handleWithdraw} onSignUp={handleSignUp} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Schedule / Roster ── */}
      {view === 'schedule' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
            <span style={{ fontSize:14, fontFamily:f1, fontWeight:700, color:B.navy }}>
              {showPastJobs ? 'All jobs' : 'Upcoming jobs'} ({scheduleJobs.length})
            </span>
            <div style={{ display:'flex', gap:8 }}>
              {isAdminOrManager && (
                <button
                  onClick={() => {
                    setPrintRosterSelectedIds(new Set(scheduleJobs.map(j => j._docId)));
                    setShowPrintRosterModal(true);
                  }}
                  title="Choose which jobs to print rosters for"
                  style={{ ...btnS, fontSize:13, padding:'6px 14px' }}>
                  Print Rosters…
                </button>
              )}
              <button
                onClick={() => exportJobsICS(
                  scheduleJobs.filter(j => j.scheduledDate && (j.signups || []).some(s => s.uid === userId)),
                  config?.churchName || '',
                  { calendarLabel: 'My Jobs', filenamePrefix: 'my-jobs' }
                )}
                title="Export jobs you've signed up for to iCal (.ics)"
                style={{ ...btnS, fontSize:13, padding:'6px 14px' }}>
                Export My Signups
              </button>
              {isAdminOrManager && (
                <button
                  onClick={() => exportJobsICS(scheduleJobs.filter(j => j.scheduledDate), config?.churchName || '')}
                  title="Export the full church job calendar to iCal (.ics)"
                  style={{ ...btnS, fontSize:13, padding:'6px 14px' }}>
                  Export All
                </button>
              )}
              <button onClick={() => setShowPastJobs(v => !v)} style={{ ...btnS, fontSize:13, padding:'6px 14px' }}>
                {showPastJobs ? 'Hide Past Jobs' : 'Show Past Jobs'}
              </button>
            </div>
          </div>
          {scheduleJobs.length === 0 ? (
            <div style={{ textAlign:'center', padding:'48px 20px', color:B.textLight, fontFamily:f2, fontSize:14 }}>No upcoming jobs.</div>
          ) : isMobile ? (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {scheduleJobs.map(job => (
                <MobileScheduleRow key={job._docId} job={job}
                  showRoster={canSeeRoster(job)} onDetail={setShowJobDetail} />
              ))}
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:B.warmGray }}>
                    {['Date & Time', 'Job', 'Location', 'Spots', 'Status', (isAdminOrManager || rosterVisibility !== 'admin') ? 'Signed Up' : '', isAdminOrManager ? 'Actions' : ''].filter(Boolean).map(h => (
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontFamily:f1, fontWeight:700, fontSize:11, color:B.textMid, textTransform:'uppercase', letterSpacing:.6, whiteSpace:'nowrap', borderBottom:'1px solid '+B.sand }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scheduleJobs.map(job => (
                    <DesktopScheduleRow key={job._docId} job={job}
                      todayStr={todayStr} isAdminOrManager={isAdminOrManager}
                      rosterVisibility={rosterVisibility} showRoster={canSeeRoster(job)}
                      onDetail={setShowJobDetail} onEdit={openEditJob} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Calendar ── */}
      {view === 'calendar' && (
        <JobCalendar jobs={jobListings || []} onJobClick={job => setShowJobDetail(job)} isMobile={isMobile} todayStr={todayStr}/>
      )}

      {/* ── Announcements ── */}
      {view === 'announcements' && (
        <div>
          {isAdminOrManager && (
            <div style={{ marginBottom: 16 }}>
              <button onClick={openNewAnn} style={{ ...btnP, padding: '8px 16px', fontSize: 13 }}>+ Post Announcement</button>
            </div>
          )}
          {visibleAnnouncements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: B.textLight, fontFamily: f2, fontSize: 14 }}>No announcements yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {visibleAnnouncements.map(ann => (
                <AnnouncementCard key={ann._docId} ann={ann}
                  isAdminOrManager={isAdminOrManager}
                  onTogglePin={handleTogglePin} onEdit={openEditAnn} onDelete={handleDeleteAnn} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Reports ── */}
      {view === 'reports' && isAdminOrManager && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:12 }}>
            <h3 style={{ fontFamily:f1, fontSize:18, fontWeight:700, color:B.navy, margin:0 }}>Volunteer Leaderboard</h3>
            <div style={{ display:'flex', gap:6 }}>
              {[['30d','Last 30 days'],['90d','Last 90 days'],['all','All time']].map(([v,label]) => (
                <button
                  key={v}
                  onClick={() => setReportsScope(v)}
                  style={{ padding:'6px 12px', borderRadius:20, border:'1px solid '+(reportsScope===v?B.teal:B.sand), background:reportsScope===v?B.tealPale:B.white, color:reportsScope===v?B.teal:B.textMid, fontFamily:f1, fontWeight:600, fontSize:12, cursor:'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {leaderboard.length === 0 ? (
            <div style={{ textAlign:'center', padding:'48px 20px', color:B.textLight, fontFamily:f2, fontSize:14 }}>No signup data yet.</div>
          ) : (
            <div style={{ background:B.white, borderRadius:14, border:'1px solid '+B.sand, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:B.warmGray }}>
                    {['Rank','Volunteer','Jobs','Attended','No-Show','Pay Earned'].map(h => (
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontFamily:f1, fontWeight:700, fontSize:11, color:B.textMid, textTransform:'uppercase', letterSpacing:.6, borderBottom:'1px solid '+B.sand }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, i) => (
                    <tr key={entry.uid} style={{ borderBottom: i < leaderboard.length-1 ? '1px solid '+B.sand : 'none' }}>
                      <td style={{ padding:'10px 14px', fontFamily:f1, fontWeight:700, color:['#D97706','#6B7280','#92400E'][i] || B.textMid }}>{i+1}</td>
                      <td style={{ padding:'10px 14px', fontFamily:f2, color:B.textDark, fontWeight:600 }}>{entry.name}</td>
                      <td style={{ padding:'10px 14px', fontFamily:f1, color:B.textMid }}>{entry.jobs}</td>
                      <td style={{ padding:'10px 14px', fontFamily:f1, color:'#16A34A', fontWeight:700 }}>{entry.attended}</td>
                      <td style={{ padding:'10px 14px', fontFamily:f1, color:entry.noShow > 0 ? B.red : B.textLight }}>{entry.noShow || 0}</td>
                      <td style={{ padding:'10px 14px', fontFamily:f1, color:entry.totalPay > 0 ? '#16A34A' : B.textLight, fontWeight:entry.totalPay > 0 ? 700 : 400 }}>
                        {entry.totalPay > 0 ? '$'+entry.totalPay.toFixed(2) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {leaderboard.length > 0 && (
            <div style={{ marginTop:10, fontSize:12, color:B.textLight, fontFamily:f2 }}>
              Pay Earned counts only signups marked Attended. Jobs without an attendance decision contribute to Jobs but not Pay.
            </div>
          )}
        </div>
      )}

      {/* ── New / Edit Job Modal ── */}
      {showNewJob && (
        <Modal open title={editJobId ? 'Edit Job' : 'Post a Job'} onClose={() => { setShowNewJob(false); setEditJobId(null); }} maxWidth={560}>
          <FF label="Job Title *">
            <input style={inp} value={jobForm.title} onChange={e => setJobForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Reset chairs in sanctuary" autoFocus />
          </FF>
          <FF label="Description">
            <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={jobForm.description} onChange={e => setJobForm(f => ({ ...f, description: e.target.value }))} placeholder="Details about what needs to be done..." />
          </FF>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px' }}>
              <FF label="Date *">
                <input type="date" style={inp} value={jobForm.scheduledDate} onChange={e => setJobForm(f => ({ ...f, scheduledDate: e.target.value }))} />
              </FF>
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <FF label="Time">
                <input style={inp} value={jobForm.scheduledTime} onChange={e => setJobForm(f => ({ ...f, scheduledTime: e.target.value }))} placeholder="e.g. 2:00 PM" />
              </FF>
            </div>
          </div>
          <FF label="Location">
            <input style={inp} value={jobForm.location} onChange={e => setJobForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Sanctuary" />
          </FF>
          <FF label="Job Lead (optional)">
            <select style={{ ...inp, cursor: 'pointer' }} value={jobForm.jobLead?.uid || ''} onChange={e => {
              const uid = e.target.value;
              const u = (users || []).find(us => us.id === uid);
              setJobForm(f => ({ ...f, jobLead: uid ? { uid, name: u?.name || uid } : null }));
            }}>
              <option value="">— None —</option>
              {(users || [])
                .filter(u => u.active !== false)
                .filter(u => u.role === 'admin' || (u.allowedHubs || []).includes('jobs'))
                .sort((a, b) => (a.name||'').localeCompare(b.name||''))
                .map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
            </select>
          </FF>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <FF label="Spots Available *">
                <input type="number" min={1} max={99} style={inp} value={jobForm.spotsTotal} onChange={e => setJobForm(f => ({ ...f, spotsTotal: e.target.value }))} />
              </FF>
            </div>
            <div style={{ flex: 1 }}>
              <FF label="Pay per Person ($)">
                <input type="number" min={0} step="0.01" style={inp} value={jobForm.pay} onChange={e => setJobForm(f => ({ ...f, pay: e.target.value }))} placeholder="e.g. 15.00" />
              </FF>
            </div>
          </div>
          {editJobId && (
            <FF label="Status">
              <select style={{ ...inp, cursor: 'pointer' }} value={jobForm.status} onChange={e => setJobForm(f => ({ ...f, status: e.target.value }))}>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </FF>
          )}
          {/* Compliance requirements */}
          <div style={{ borderTop:'1px solid '+B.sand, paddingTop:14, marginTop:4 }}>
            <div style={{ fontSize:12, fontWeight:700, color:B.textLight, textTransform:'uppercase', letterSpacing:.8, fontFamily:f1, marginBottom:8 }}>Required Compliance (People Access)</div>
            <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
              {Object.entries(ACCESS_TYPE_LABELS).map(([type, label]) => (
                <label key={type} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
                  <input type="checkbox"
                    checked={(jobForm.requiredAccessTypes || []).includes(type)}
                    onChange={e => setJobForm(f => ({
                      ...f,
                      requiredAccessTypes: e.target.checked
                        ? [...(f.requiredAccessTypes || []), type]
                        : (f.requiredAccessTypes || []).filter(t => t !== type)
                    }))}
                    style={{ width:14, height:14 }} />
                  <span style={{ fontSize:13, fontFamily:f2, color:B.textDark }}>{label}</span>
                </label>
              ))}
            </div>
          </div>
          {/* Waiver/consent */}
          <div style={{ borderTop:'1px solid '+B.sand, paddingTop:14, marginTop:4 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom: jobForm.requiresWaiver ? 12 : 0 }}>
              <input type="checkbox" checked={jobForm.requiresWaiver} onChange={e => setJobForm(f => ({ ...f, requiresWaiver: e.target.checked }))} style={{ width:16, height:16 }} />
              <span style={{ fontSize:13, fontFamily:f1, fontWeight:600, color:B.textDark }}>Require waiver/consent before signing up</span>
            </label>
            {jobForm.requiresWaiver && (
              <FF label="Waiver Text *">
                <textarea style={{ ...inp, minHeight:80, resize:'vertical' }} value={jobForm.waiverText} onChange={e => setJobForm(f => ({ ...f, waiverText: e.target.value }))} placeholder="Enter the consent statement volunteers must agree to before signing up..." />
              </FF>
            )}
          </div>
          {/* Series edit scope — only shown when editing a recurring job */}
          {editJobId && editJobSeriesGroupId && (
            <div style={{ borderTop: '1px solid ' + B.sand, paddingTop: 14, marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: B.textLight, textTransform: 'uppercase', letterSpacing: .8, fontFamily: f1, marginBottom: 8 }}>Apply changes to</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['this', 'This job only'], ['future', 'This + all future jobs']].map(([v, label]) => (
                  <button key={v} type="button" onClick={() => setSeriesEditScope(v)}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid ' + (seriesEditScope === v ? B.teal : B.sand), background: seriesEditScope === v ? B.tealPale : B.white, color: seriesEditScope === v ? B.teal : B.textMid, fontFamily: f1, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Recurring series — new jobs only */}
          {!editJobId && (
            <div style={{ borderTop: '1px solid ' + B.sand, paddingTop: 14, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: isRecurring ? 12 : 0 }}>
                <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} style={{ width: 16, height: 16 }} />
                <span style={{ fontSize: 13, fontFamily: f1, fontWeight: 600, color: B.textDark }}>Recurring series 🔁</span>
              </label>
              {isRecurring && (
                <div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 140px' }}>
                      <FF label="Repeats">
                        <select style={{ ...inp, cursor: 'pointer' }} value={recurrenceFreq} onChange={e => setRecurrenceFreq(e.target.value)}>
                          {RECURRENCE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                        </select>
                      </FF>
                    </div>
                    <div style={{ flex: '1 1 140px' }}>
                      <FF label="Series Ends On *">
                        <input type="date" style={inp} value={recurrenceSeriesEndDate} min={jobForm.scheduledDate || undefined} onChange={e => setRecurrenceSeriesEndDate(e.target.value)} />
                      </FF>
                    </div>
                  </div>
                  {recurrencePreviewCount > 0 && recurrencePreviewCount < 100 && (
                    <div style={{ fontSize: 13, color: B.teal, fontFamily: f1, fontWeight: 600, marginTop: 4 }}>
                      This will create {recurrencePreviewCount} job{recurrencePreviewCount !== 1 ? 's' : ''}.
                    </div>
                  )}
                  {recurrencePreviewCount >= 100 && (
                    <div style={{ fontSize: 13, color: B.red, fontFamily: f1, fontWeight: 600, marginTop: 4 }}>Maximum 100 jobs per series reached.</div>
                  )}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button onClick={() => { setShowNewJob(false); setEditJobId(null); }} style={btnS}>Cancel</button>
            <button onClick={handleSaveJob}
              disabled={saving || !jobForm.title.trim() || !jobForm.scheduledDate || (isRecurring && !recurrenceSeriesEndDate)}
              style={{ ...btnP, opacity: (!jobForm.title.trim() || !jobForm.scheduledDate || saving || (isRecurring && !recurrenceSeriesEndDate)) ? 0.5 : 1 }}>
              {saving ? 'Saving...' : editJobId ? 'Save Changes' : isRecurring ? `Post ${recurrencePreviewCount || ''} Jobs` : 'Post Job'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Job Detail Modal ── */}
      {liveDetail && (
        <Modal open title={liveDetail.jobNumber + ' — ' + liveDetail.title} onClose={() => setShowJobDetail(null)} maxWidth={540}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
            <JobStatusBadge status={liveDetail.status} />
            {liveDetail.recurrenceGroupId && (
              <span style={{ fontSize:12, color:B.teal, fontWeight:600, fontFamily:f1 }}>🔁 Recurring series</span>
            )}
          </div>
          {liveDetail.description && (
            <div style={{ fontSize: 14, color: B.textDark, fontFamily: f2, lineHeight: 1.6, marginBottom: 16, whiteSpace: 'pre-wrap' }}>{liveDetail.description}</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: B.textLight, textTransform: 'uppercase', letterSpacing: .8, fontFamily: f1, marginBottom: 2 }}>Date</div>
              <div style={{ fontSize: 14, color: B.textDark, fontFamily: f2 }}>
                {formatJobDate(liveDetail.scheduledDate)}{liveDetail.scheduledTime ? ' at ' + liveDetail.scheduledTime : ''}
              </div>
            </div>
            {liveDetail.location && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: B.textLight, textTransform: 'uppercase', letterSpacing: .8, fontFamily: f1, marginBottom: 2 }}>Location</div>
                <div style={{ fontSize: 14, color: B.textDark, fontFamily: f2 }}>{liveDetail.location}</div>
              </div>
            )}
            {liveDetail.pay != null && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: B.textLight, textTransform: 'uppercase', letterSpacing: .8, fontFamily: f1, marginBottom: 2 }}>Pay</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#16A34A', fontFamily: f1 }}>${Number(liveDetail.pay).toFixed(2)} per person</div>
              </div>
            )}
            {liveDetail.jobLead && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: B.textLight, textTransform: 'uppercase', letterSpacing: .8, fontFamily: f1, marginBottom: 2 }}>Job Lead</div>
                <div style={{ fontSize: 14, color: B.textDark, fontFamily: f2 }}>{liveDetail.jobLead.name}</div>
              </div>
            )}
          </div>
          <div style={{ marginBottom: 16 }}><SpotsBar job={liveDetail} /></div>
          {/* Waiver notice */}
          {liveDetail.requiresWaiver && liveDetail.waiverText && (
            <div style={{ background:'#FFF9C4', border:'1px solid #FDE68A', borderRadius:8, padding:'10px 14px', marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#92400E', textTransform:'uppercase', letterSpacing:.8, fontFamily:f1, marginBottom:4 }}>Waiver Required</div>
              <div style={{ fontSize:13, color:B.textDark, fontFamily:f2, lineHeight:1.6 }}>{liveDetail.waiverText}</div>
            </div>
          )}
          {/* Signup list */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: B.textMid, textTransform: 'uppercase', letterSpacing: .8, fontFamily: f1, marginBottom: 8 }}>Signed Up</div>
            {canSeeRoster(liveDetail) ? (
              (liveDetail.signups || []).length === 0 ? (
                <div style={{ fontSize: 13, color: B.textLight, fontFamily: f2 }}>No signups yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(liveDetail.signups || []).map(s => {
                    const isPastJob = liveDetail.scheduledDate && liveDetail.scheduledDate < todayStr;
                    return (
                      <div key={s.uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: B.warmGray, borderRadius: 8 }}>
                        <div>
                          <span style={{ fontSize: 13, fontFamily: f2, color: B.textDark }}>{s.name}</span>
                          {isAdminOrManager && liveDetail.requiresWaiver && (
                            <span title={s.acknowledgedWaiverAt ? 'Waiver acknowledged ' + s.acknowledgedWaiverAt.slice(0,10) : 'No waiver on file'}
                              style={{ fontSize:11, marginLeft:6, color:s.acknowledgedWaiverAt ? '#16A34A' : B.textLight }}>
                              {s.acknowledgedWaiverAt ? '📋✓' : '📋?'}
                            </span>
                          )}
                          {isAdminOrManager && s.attended !== undefined && (
                            <span style={{ fontSize:11, fontWeight:700, color:s.attended ? '#16A34A' : B.red, marginLeft:8 }}>
                              {s.attended ? '✓ Attended' : '✗ No-show'}
                            </span>
                          )}
                        </div>
                        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                          {isAdminOrManager && isPastJob && (
                            <button onClick={() => handleUpdateAttendance(liveDetail, s.uid, !s.attended)}
                              style={{ background:'none', border:'1px solid '+(s.attended ? B.red : '#16A34A'), cursor:'pointer', color:s.attended ? B.red : '#16A34A', fontSize:11, fontFamily:f1, padding:'2px 6px', borderRadius:4 }}
                              aria-label={s.attended ? 'Mark as no-show' : 'Mark as attended'}>
                              {s.attended ? 'Undo' : 'Attended'}
                            </button>
                          )}
                          {isAdminOrManager && (
                            <button onClick={() => handleAdminRemoveSignup(liveDetail, s.uid)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: B.red, fontSize: 14, fontFamily: f1, padding: '8px 12px', minWidth: 44, minHeight: 44, lineHeight: 1, borderRadius: 6 }}
                              aria-label={'Remove ' + s.name}>✕</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              isSignedUp(liveDetail) ? (
                <div style={{ fontSize: 13, fontWeight: 700, color: B.teal, fontFamily: f1 }}>✓ You're signed up</div>
              ) : isOnWaitlist(liveDetail) ? (
                <div style={{ fontSize: 13, fontWeight: 700, color: '#D97706', fontFamily: f1 }}>⏳ You're on the waitlist</div>
              ) : (
                <div style={{ fontSize: 13, color: B.textLight, fontFamily: f2 }}>You have not signed up for this job.</div>
              )
            )}
          </div>
          {/* Waitlist (admin only) */}
          {isAdminOrManager && (liveDetail.waitlist || []).length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:700, color:B.textMid, textTransform:'uppercase', letterSpacing:.8, fontFamily:f1, marginBottom:8 }}>
                Waitlist ({(liveDetail.waitlist || []).length})
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {(liveDetail.waitlist || []).map((w, i) => (
                  <div key={w.uid} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 10px', background:'#FFF9C4', borderRadius:8, border:'1px solid #FDE68A' }}>
                    <span style={{ fontSize:13, fontFamily:f2, color:B.textDark }}>
                      <span style={{ fontSize:11, color:B.textLight, marginRight:6 }}>#{i+1}</span>{w.name}
                    </span>
                    <button onClick={() => handleAdminRemoveSignup(liveDetail, w.uid)}
                      style={{ background:'none', border:'none', cursor:'pointer', color:B.red, fontSize:14, fontFamily:f1, padding:'8px 12px', minWidth:44, minHeight:44, lineHeight:1, borderRadius:6 }}
                      aria-label={'Remove '+w.name+' from waitlist'}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Swap requests (admin view) */}
          {isAdminOrManager && swapRequests.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:700, color:B.textMid, textTransform:'uppercase', letterSpacing:.8, fontFamily:f1, marginBottom:8 }}>
                Swap Requests ({swapRequests.length})
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {swapRequests.map(req => (
                  <div key={req._docId} style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'8px 10px', background:'#FEF3E8', borderRadius:8, border:'1px solid #FDE68A', gap:8 }}>
                    <div>
                      <span style={{ fontSize:13, fontFamily:f2, color:B.textDark, fontWeight:600 }}>{req.name}</span>
                      {req.note && <div style={{ fontSize:12, color:B.textMid, fontFamily:f2, marginTop:2 }}>{req.note}</div>}
                    </div>
                    <button onClick={() => handleDeleteSwapRequest(req._docId)}
                      style={{ ...btnS, fontSize:11, padding:'2px 8px', flexShrink:0 }}>Dismiss</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Linked task chip */}
          {liveDetail.linkedTaskDocId && (
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, padding:'8px 12px', borderRadius:8, background:'#EDF2FF', border:'1px solid #C7D2FE' }}>
              <span style={{ fontSize:13, color:'#4F46E5', fontFamily:f1, fontWeight:700 }}>✓ Linked Task</span>
              <span style={{ fontSize:12, color:'#4F46E5', fontFamily:'monospace' }}>{liveDetail.linkedTaskDocId.slice(0,8)}…</span>
            </div>
          )}
          {/* Action row */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {isAdminOrManager && (
                <>
                  <button onClick={() => { setShowJobDetail(null); openEditJob(liveDetail); }} style={{ ...btnS, fontSize: 13 }}>Edit</button>
                  <button onClick={() => handleDeleteJob(liveDetail)} style={{ ...btnD, fontSize: 13 }}>Delete</button>
                  {liveDetail.recurrenceGroupId && (
                    <>
                      <button onClick={() => handleDeleteSeriesFrom(liveDetail)} style={{ ...btnD, fontSize: 13 }}>Delete This + Future</button>
                      <button onClick={() => handleDeleteSeries(liveDetail)} style={{ ...btnD, fontSize: 13 }}>Delete Series</button>
                    </>
                  )}
                  {['cancelled', 'closed'].includes(liveDetail.status) && (liveDetail.signups || []).length > 0 && notificationConfig?.enabled && (
                    <button onClick={() => handleNotifySignups(liveDetail)} style={{ ...btnS, fontSize: 13, color: B.teal, borderColor: B.tealLight }}>
                      Notify Signups
                    </button>
                  )}
                  {!liveDetail.linkedTaskDocId && (
                    <button onClick={() => openConvertToTask(liveDetail)} style={{ ...btnS, fontSize: 13 }}>→ Task</button>
                  )}
                  <button onClick={() => printJobRoster([liveDetail], config?.churchName || '')} title="Print this job's roster" style={{ ...btnS, fontSize: 13 }}>
                    🖨 Print Roster
                  </button>
                </>
              )}
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            {liveDetail.status === 'open' && isSignedUp(liveDetail) && !isAdminOrManager && (
              <button onClick={() => { setSwapNote(''); setShowSwapModal(true); }}
                style={{ ...btnS, fontSize:13, color:'#92400E', borderColor:'#FDE68A' }}>Request Swap</button>
            )}
            {liveDetail.status === 'open' && (
              isSignedUp(liveDetail) ? (
                <button onClick={() => handleWithdraw(liveDetail)} disabled={!!savingJobId}
                  style={{ ...btnS, color: B.red, borderColor: '#FECACA', fontSize: 13 }}>
                  {savingJobId === liveDetail._docId ? 'Withdrawing…' : 'Withdraw'}
                </button>
              ) : isOnWaitlist(liveDetail) ? (
                <button onClick={() => handleWithdraw(liveDetail)} disabled={!!savingJobId}
                  style={{ ...btnS, color:'#92400E', borderColor:'#FDE68A', background:'#FFF9C4', fontSize:13 }}>
                  {savingJobId === liveDetail._docId ? '…' : 'Leave Waitlist'}
                </button>
              ) : (liveDetail.scheduledDate && liveDetail.scheduledDate < todayStr) ? (
                <button disabled
                  style={{ ...btnS, fontSize: 13, color: B.textLight, cursor: 'default', opacity: 0.6 }}>
                  Past — signups closed
                </button>
              ) : !isFull(liveDetail) ? (
                <button onClick={() => handleSignUp(liveDetail)} disabled={!!savingJobId} style={{ ...btnP, fontSize: 13 }}>
                  {savingJobId === liveDetail._docId ? 'Signing up…' : 'Sign Up'}
                </button>
              ) : (
                <button onClick={() => handleSignUp(liveDetail)} disabled={!!savingJobId}
                  style={{ ...btnS, fontSize:13, color:B.textMid }}>
                  {savingJobId === liveDetail._docId ? '…' : 'Join Waitlist'}
                </button>
              )
            )}
            </div>
          </div>
        </Modal>
      )}

      {/* ── New / Edit Announcement Modal ── */}
      {showNewAnn && (
        <Modal open title={editAnnId ? 'Edit Announcement' : 'Post Announcement'} onClose={() => { setShowNewAnn(false); setEditAnnId(null); }} maxWidth={520}>
          <FF label="Title *">
            <input style={inp} value={annForm.title} onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))} placeholder="Announcement title" autoFocus />
          </FF>
          <FF label="Body *">
            <textarea style={{ ...inp, minHeight: 100, resize: 'vertical' }} value={annForm.body} onChange={e => setAnnForm(f => ({ ...f, body: e.target.value }))} placeholder="What do you want to share?" />
          </FF>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <FF label="Expires On (optional)">
                <input type="date" style={inp} value={annForm.expiresAt} onChange={e => setAnnForm(f => ({ ...f, expiresAt: e.target.value }))} />
              </FF>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="pinAnn" checked={annForm.pinned} onChange={e => setAnnForm(f => ({ ...f, pinned: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <label htmlFor="pinAnn" style={{ fontSize: 13, fontFamily: f2, color: B.textDark, cursor: 'pointer' }}>Pin to top</label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="repeatAnn" checked={annForm.repeatWeekly} onChange={e => {
                  const checked = e.target.checked;
                  setAnnForm(f => {
                    const next = { ...f, repeatWeekly: checked };
                    if (checked && !f.expiresAt) {
                      const d = new Date(); d.setDate(d.getDate() + 7);
                      next.expiresAt = localDateStr(d);
                    }
                    if (!checked) next.expiresAt = '';
                    return next;
                  });
                }} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <label htmlFor="repeatAnn" style={{ fontSize: 13, fontFamily: f2, color: B.textDark, cursor: 'pointer' }}>Repeat weekly</label>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button onClick={() => { setShowNewAnn(false); setEditAnnId(null); }} style={btnS}>Cancel</button>
            <button onClick={handleSaveAnn}
              disabled={saving || !annForm.title.trim() || !annForm.body.trim()}
              style={{ ...btnP, opacity: (!annForm.title.trim() || !annForm.body.trim() || saving) ? 0.5 : 1 }}>
              {saving ? 'Saving...' : editAnnId ? 'Save Changes' : 'Post'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Notification Delegates Modal ── */}
      {showDelegatesModal && (
        <Modal open title="Job Notification Delegates" onClose={() => setShowDelegatesModal(false)} maxWidth={480}>
          <p style={{ fontSize: 13, color: B.textMid, fontFamily: f2, marginTop: 0, marginBottom: 16 }}>
            These co-admins/managers receive the same withdrawal and cancellation notifications you do for jobs you post.
          </p>
          {adminManagerUsers.length === 0 ? (
            <p style={{ fontSize: 13, color: B.textLight, fontFamily: f2 }}>No other admins or managers in your church.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {adminManagerUsers.map(u => {
                const sel = jobDelegates.some(d => d.uid === u.id);
                return (
                  <button key={u.id}
                    disabled={savingDelegates || (!sel && jobDelegates.length >= 5)}
                    onClick={() => {
                      const next = sel ? jobDelegates.filter(d => d.uid !== u.id) : [...jobDelegates, { uid: u.id, name: u.name }];
                      handleSaveDelegates(next);
                    }}
                    style={{ padding: '5px 14px', borderRadius: 20, fontSize: 13, fontFamily: f1, fontWeight: 600, cursor: 'pointer', border: '1px solid ' + (sel ? B.teal : B.sand), background: sel ? B.tealPale : B.white, color: sel ? B.teal : B.textMid, opacity: (savingDelegates || (!sel && jobDelegates.length >= 5)) ? 0.5 : 1 }}>
                    {sel ? '✓ ' : ''}{u.name}
                  </button>
                );
              })}
            </div>
          )}
          {jobDelegates.length >= 5 && <p style={{ fontSize: 12, color: B.textLight, fontFamily: f2, marginTop: 8, marginBottom: 0 }}>Maximum 5 delegates.</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={() => setShowDelegatesModal(false)} style={btnS}>Done</button>
          </div>
        </Modal>
      )}

      {/* ── Print Rosters Selection Modal ── */}
      {showPrintRosterModal && (
        <Modal open title="Print Rosters" onClose={() => setShowPrintRosterModal(false)} maxWidth={520}>
          <p style={{ fontSize: 13, color: B.textMid, fontFamily: f2, marginTop: 0, marginBottom: 14 }}>
            Select which jobs to include in the printed roster. Defaults to all visible jobs.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: B.textLight, fontFamily: f1, fontWeight: 600 }}>
              {printRosterSelectedIds.size} of {scheduleJobs.length} selected
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPrintRosterSelectedIds(new Set(scheduleJobs.map(j => j._docId)))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: f1, color: B.teal, fontWeight: 600 }}>
                Select All
              </button>
              <span style={{ color: B.textLight, fontSize: 12 }}>·</span>
              <button onClick={() => setPrintRosterSelectedIds(new Set())}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: f1, color: B.teal, fontWeight: 600 }}>
                Select None
              </button>
            </div>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid ' + B.sand, borderRadius: 8, padding: 4 }}>
            {scheduleJobs.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: B.textLight, fontSize: 13, fontFamily: f2 }}>No jobs to print.</div>
            ) : scheduleJobs.map(j => {
              const checked = printRosterSelectedIds.has(j._docId);
              return (
                <label key={j._docId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', cursor: 'pointer', borderRadius: 6, background: checked ? 'rgba(42,125,110,0.06)' : 'transparent' }}>
                  <input type="checkbox" checked={checked} onChange={() => {
                    setPrintRosterSelectedIds(prev => {
                      const next = new Set(prev);
                      if (next.has(j._docId)) next.delete(j._docId);
                      else next.add(j._docId);
                      return next;
                    });
                  }} />
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: B.textLight, background: B.warmGray, padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>{j.jobNumber}</span>
                  <span style={{ flex: 1, fontSize: 13, fontFamily: f2, color: B.textDark }}>{j.title}</span>
                  <span style={{ fontSize: 12, fontFamily: f2, color: B.textLight, flexShrink: 0 }}>
                    {formatJobDate(j.scheduledDate)} · {(j.signups || []).length}/{j.spotsTotal || 1}
                  </span>
                </label>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button onClick={() => setShowPrintRosterModal(false)} style={btnS}>Cancel</button>
            <button
              disabled={printRosterSelectedIds.size === 0}
              onClick={() => {
                const selected = scheduleJobs.filter(j => printRosterSelectedIds.has(j._docId));
                printJobRoster(selected, config?.churchName || '');
                setShowPrintRosterModal(false);
              }}
              style={{ ...btnP, opacity: printRosterSelectedIds.size === 0 ? 0.5 : 1, cursor: printRosterSelectedIds.size === 0 ? 'not-allowed' : 'pointer' }}>
              Print {printRosterSelectedIds.size} Roster{printRosterSelectedIds.size !== 1 ? 's' : ''}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Convert to Task Modal ── */}
      <Modal open={showConvertToTaskModal} onClose={() => setShowConvertToTaskModal(false)} title="Convert to Task">
        <FF label="Task Name *">
          <input style={inp} value={convertTaskForm.name} onChange={e => setConvertTaskForm(f => ({ ...f, name: e.target.value }))} placeholder="Task name…" />
        </FF>
        <FF label="Due Date">
          <input type="date" style={inp} value={convertTaskForm.dueDate} onChange={e => setConvertTaskForm(f => ({ ...f, dueDate: e.target.value }))} />
        </FF>
        <FF label="Description">
          <textarea style={{ ...inp, minHeight:70, resize:'vertical' }} value={convertTaskForm.description} onChange={e => setConvertTaskForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description…" />
        </FF>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
          <button onClick={() => setShowConvertToTaskModal(false)} style={btnS}>Cancel</button>
          <button onClick={handleConvertToTask} disabled={convertTaskSaving || !convertTaskForm.name.trim()} style={{ ...btnP, opacity: (convertTaskSaving || !convertTaskForm.name.trim()) ? 0.5 : 1 }}>
            {convertTaskSaving ? 'Creating…' : 'Create Task'}
          </button>
        </div>
      </Modal>

      {/* ── Swap Request Modal ── */}
      <Modal open={showSwapModal} onClose={() => setShowSwapModal(false)} title="Request Replacement">
        <p style={{ fontSize:13, color:B.textMid, fontFamily:f2, marginBottom:12 }}>
          Let an admin know you need a replacement for this job. They'll follow up with you.
        </p>
        <FF label="Note (optional)">
          <textarea style={{ ...inp, minHeight:70, resize:'vertical' }} value={swapNote} onChange={e => setSwapNote(e.target.value)} placeholder="Reason you need a replacement…" />
        </FF>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
          <button onClick={() => setShowSwapModal(false)} style={btnS}>Cancel</button>
          <button onClick={handleSubmitSwapRequest} disabled={swapSaving} style={{ ...btnP, opacity: swapSaving ? 0.5 : 1 }}>
            {swapSaving ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
