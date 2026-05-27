import { useState, useEffect, useMemo, useContext } from 'react';
import { collectionGroup, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { B, f1, f2, btnP, btnS } from '../components/brand/tokens.js';
import { MobileCtx } from '../hooks/useMobile.js';
import { localDateStr } from '../utils/date.js';
import { exportJobsICS } from '../utils/ical.js';
import { formatTimeRange } from '../utils/time.js';

// VolunteerHome — landing for role:user with allowedHubs=['jobs'] (Hazel et al).
// Sections: next shift · upcoming · open this week · CTAs.
// Reads jobListings from `store` and listens to /signups{uid==me} the same way
// JobsPage does, so the lists update in real time.

export function VolunteerHome({ store, userProfile, onOpenJobs }) {
  const isMobile = useContext(MobileCtx);
  const userId = userProfile?.id || userProfile?.uid;
  const churchName = store?.config?.churchName || '';
  const jobListings = store?.jobListings;
  const [mySignupIds, setMySignupIds] = useState(new Set());

  useEffect(() => {
    if (!userId) return undefined;
    const unsub = onSnapshot(
      query(collectionGroup(db, 'signups'), where('uid', '==', userId)),
      snap => setMySignupIds(new Set(snap.docs.map(d => d.ref.parent.parent.id))),
      err => console.error('[ChurchOpsHub] VolunteerHome signups subscription failed', err),
    );
    return () => unsub();
  }, [userId]);

  const todayStr = localDateStr(new Date());
  const weekOutStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return localDateStr(d);
  }, []);

  // Sort by date ascending for upcoming lists
  const sortedFuture = useMemo(
    () => (jobListings || [])
      .filter(j => j.scheduledDate && j.scheduledDate >= todayStr && j.status !== 'cancelled')
      .sort((a, b) => (a.scheduledDate + (a.scheduledTime || '')).localeCompare(b.scheduledDate + (b.scheduledTime || ''))),
    [jobListings, todayStr],
  );

  const myUpcoming = useMemo(
    () => sortedFuture.filter(j => mySignupIds.has(j._docId)),
    [sortedFuture, mySignupIds],
  );
  const nextShift = myUpcoming[0] || null;
  const otherUpcoming = myUpcoming.slice(1, 4);

  const openThisWeek = useMemo(
    () => sortedFuture
      .filter(j => j.status === 'open'
        && j.scheduledDate <= weekOutStr
        && !mySignupIds.has(j._docId)
        && (j.signupCount || 0) < (j.spotsTotal || 1))
      .slice(0, 3),
    [sortedFuture, weekOutStr, mySignupIds],
  );

  const firstName = userProfile?.firstName || (userProfile?.name || '').split(' ')[0] || '';

  return (
    <div style={{ fontFamily: f2 }}>
      {/* Greeting */}
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontFamily: f1, color: B.navy }}>
          Hi{firstName ? `, ${firstName}` : ''} 👋
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: B.textLight }}>
          {nextShift ? "Here's what's next." : 'No shifts yet — see what jobs are available below.'}
        </p>
      </div>

      {/* Next shift card */}
      {nextShift && (
        <NextShiftCard
          job={nextShift}
          churchName={churchName}
          isMobile={isMobile}
          onOpenDetail={() => onOpenJobs?.()}
        />
      )}

      {/* Your upcoming shifts */}
      {otherUpcoming.length > 0 && (
        <Section title="Your upcoming shifts" onSeeAll={() => onOpenJobs?.()}>
          {otherUpcoming.map(j => (
            <ShiftRow key={j._docId} job={j} onClick={() => onOpenJobs?.()} accent={B.teal} />
          ))}
        </Section>
      )}

      {/* Open jobs this week */}
      <Section
        title="Open this week"
        empty={openThisWeek.length === 0 ? 'No open jobs in the next 7 days. Check back soon!' : null}
        onSeeAll={() => onOpenJobs?.()}
      >
        {openThisWeek.map(j => (
          <ShiftRow
            key={j._docId}
            job={j}
            onClick={() => onOpenJobs?.()}
            accent={B.gold}
            showSpots
          />
        ))}
      </Section>

      {/* CTAs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
        <button onClick={() => onOpenJobs?.('jobs')} style={{ ...btnP, flex: '1 1 160px', padding: '12px 18px', fontSize: 14 }}>
          View all jobs
        </button>
        <button onClick={() => onOpenJobs?.('calendar')} style={{ ...btnS, flex: '1 1 160px', padding: '12px 18px', fontSize: 14 }}>
          📅 Open calendar
        </button>
      </div>
    </div>
  );
}

function NextShiftCard({ job, churchName, isMobile, onOpenDetail }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${B.teal} 0%, #1F6B5F 100%)`,
      borderRadius: 16,
      padding: isMobile ? 18 : 22,
      color: B.white,
      marginBottom: 20,
      boxShadow: '0 8px 24px rgba(42,125,110,0.25)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, fontFamily: f1, letterSpacing: 1.2, opacity: 0.85, marginBottom: 6 }}>
        NEXT SHIFT
      </div>
      <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, fontFamily: f1, marginBottom: 6 }}>
        {job.title}
      </div>
      <div style={{ fontSize: 13, opacity: 0.92, marginBottom: 4 }}>
        {formatDate(job.scheduledDate)}{job.scheduledTime ? ` · ${formatTimeRange(job.scheduledTime, job.scheduledEndTime)}` : ''}
      </div>
      {job.location && (
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 16 }}>
          📍 {job.location}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={onOpenDetail}
          style={{ background: B.white, color: B.teal, border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, fontFamily: f1, fontSize: 13, cursor: 'pointer' }}
        >
          View details
        </button>
        <button
          onClick={() => exportJobsICS([job], churchName, { calendarLabel: 'Shift', filenamePrefix: 'shift' })}
          style={{ background: 'rgba(255,255,255,0.15)', color: B.white, border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontFamily: f1, fontSize: 13, cursor: 'pointer' }}
        >
          📅 Add to calendar
        </button>
      </div>
    </div>
  );
}

function Section({ title, children, empty, onSeeAll }) {
  if (empty) {
    return (
      <div style={{ marginBottom: 20 }}>
        <SectionHeader title={title} onSeeAll={onSeeAll} />
        <div style={{ background: B.white, border: '1px solid ' + B.sand, borderRadius: 12, padding: 16, fontSize: 13, color: B.textLight }}>
          {empty}
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 20 }}>
      <SectionHeader title={title} onSeeAll={onSeeAll} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}

function SectionHeader({ title, onSeeAll }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: f1, color: B.textMid, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {title}
      </div>
      {onSeeAll && (
        <button onClick={onSeeAll} style={{ background: 'none', border: 'none', color: B.teal, fontFamily: f1, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
          See all →
        </button>
      )}
    </div>
  );
}

function ShiftRow({ job, onClick, accent, showSpots }) {
  const spotsTotal = job.spotsTotal || 1;
  const filled = job.signupCount || 0;
  const remaining = Math.max(0, spotsTotal - filled);
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        background: B.white,
        border: '1px solid ' + B.sand,
        borderLeft: `4px solid ${accent}`,
        borderRadius: 12,
        padding: '12px 14px',
        cursor: 'pointer',
        fontFamily: f2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: f1, color: B.navy, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {job.title}
        </div>
        <div style={{ fontSize: 12, color: B.textLight }}>
          {formatDate(job.scheduledDate)}{job.scheduledTime ? ` · ${formatTimeRange(job.scheduledTime, job.scheduledEndTime)}` : ''}
          {job.location ? ` · ${job.location}` : ''}
        </div>
      </div>
      {showSpots && (
        <div style={{ fontSize: 11, fontWeight: 700, fontFamily: f1, color: accent, padding: '4px 10px', borderRadius: 12, background: accent + '18', whiteSpace: 'nowrap' }}>
          {remaining} {remaining === 1 ? 'spot' : 'spots'}
        </div>
      )}
    </button>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
