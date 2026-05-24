import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as Sentry from '@sentry/react';
import { B, f1, f2, btnP, btnS } from '../components/brand/tokens.js';
import { FullLogo } from '../components/brand/Logo.jsx';
import { Spinner } from '../components/primitives/Spinner.jsx';
import { formatTimeForDisplay } from '../utils/time.js';

function formatJobDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function PublicJobsPage({ churchId, churchName, churchCode, onGetStarted }) {
  function goRegister() {
    if (churchCode) {
      window.location.href = `/?invite=${encodeURIComponent(churchCode)}`;
    } else {
      onGetStarted('register');
    }
  }
  const [jobs, setJobs] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!churchId) return;
    window.posthog?.capture('jobs_board_viewed', { surface: 'public', churchId });
    const fn = httpsCallable(getFunctions(), 'getPublicJobs');
    fn({ churchId })
      .then(res => setJobs(res.data?.jobs || []))
      .catch(err => {
        // getPublicJobs deliberately returns `{ jobs: [] }` for a missing
        // church or inactive hub (security: no enumeration oracle). So a
        // thrown error here is a real failure — invalid-argument on a
        // malformed share link, or a transient outage. Either way the
        // user shouldn't be told "your link is invalid" for what may be
        // a 30-second Firestore blip. Sentry-capture so we can see the
        // truth from this end.
        const code = err?.code || '';
        if (code === 'functions/invalid-argument') {
          setErr('This link is missing required information. Please ask the church for a fresh link.');
        } else {
          setErr('Could not load jobs right now. Please refresh in a moment — if it keeps happening, let the church know.');
        }
        Sentry.captureException(err, {
          tags: { area: 'public-board', fn: 'getPublicJobs', errorCode: code || 'unknown' },
          extra: { churchId, churchCode },
        });
      });
  }, [churchId, churchCode]);

  const displayName = churchName || 'Church';

  return (
    <div style={{ fontFamily: f2, minHeight: '100vh', background: `linear-gradient(170deg, ${B.cream} 0%, ${B.warmGray} 100%)` }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <div style={{ background: `linear-gradient(135deg, ${B.navy} 0%, ${B.navyLight} 60%, #2C4066 100%)`, padding: '18px 28px 24px', color: B.white }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <FullLogo size={32} light={true} />
          <div style={{ marginTop: 16 }}>
            <h1 style={{ fontFamily: f1, fontSize: 22, fontWeight: 700, color: B.white, margin: '0 0 4px' }}>
              {displayName} — Job Board
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0, fontSize: 14 }}>
              Sign up to serve your community
            </p>
          </div>
        </div>
      </div>
      <div style={{ height: 3, background: `linear-gradient(90deg, ${B.teal}, ${B.gold})` }}/>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 20px' }}>
        {err && (
          <div style={{ background: '#FEE8E8', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', color: B.red, fontFamily: f1, marginBottom: 20 }}>{err}</div>
        )}
        {jobs === null && !err && <Spinner />}
        {jobs !== null && jobs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px 20px', color: B.textLight, fontFamily: f2, fontSize: 15 }}>
            No open jobs right now — check back soon!
          </div>
        )}
        {jobs !== null && jobs.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 32 }}>
              {jobs.map(job => {
                const filled = job.signupCount ?? 0;
                const total = job.spotsTotal || 1;
                const isFull = filled >= total;
                const pct = Math.min(100, (filled / total) * 100);
                return (
                  <div key={job._docId} style={{ background: B.white, borderRadius: 14, border: '1px solid ' + B.sand, padding: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: B.textLight, background: B.warmGray, padding: '2px 6px', borderRadius: 4 }}>{job.jobNumber}</span>
                      {isFull && <span style={{ fontSize: 11, fontWeight: 700, color: B.red, fontFamily: f1 }}>FULL</span>}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, fontFamily: f1, color: B.navy, marginBottom: 6 }}>{job.title}</div>
                    {job.description && (
                      <div style={{ fontSize: 13, color: B.textMid, fontFamily: f2, marginBottom: 8, lineHeight: 1.5 }}>{job.description}</div>
                    )}
                    <div style={{ fontSize: 12, color: B.textMid, fontFamily: f2, marginBottom: 2 }}>
                      📅 {formatJobDate(job.scheduledDate)}{job.scheduledTime ? ' at ' + formatTimeForDisplay(job.scheduledTime) : ''}
                    </div>
                    {job.location && (
                      <div style={{ fontSize: 12, color: B.textMid, fontFamily: f2, marginBottom: 8 }}>📍 {job.location}</div>
                    )}
                    {job.pay != null && (
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#16A34A', fontFamily: f1, marginBottom: 10 }}>
                        ${Number(job.pay).toFixed(2)} per person
                      </div>
                    )}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: B.textMid, fontFamily: f2, marginBottom: 4 }}>
                        <span>{filled}/{total} spot{total !== 1 ? 's' : ''} filled</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: B.sand, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: pct + '%', background: isFull ? B.red : B.teal, borderRadius: 3 }}/>
                      </div>
                    </div>
                    <button
                      onClick={goRegister}
                      disabled={isFull}
                      style={{ ...btnP, width: '100%', fontSize: 13, opacity: isFull ? 0.5 : 1, cursor: isFull ? 'not-allowed' : 'pointer' }}>
                      {isFull ? 'Job Full' : 'Sign Up →'}
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ background: B.tealPale, border: '1px solid ' + B.tealLight, borderRadius: 12, padding: '16px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: f1, fontWeight: 700, fontSize: 15, color: B.teal, marginBottom: 6 }}>
                Ready to sign up?
              </div>
              <div style={{ fontSize: 13, color: B.textMid, fontFamily: f2, marginBottom: 12 }}>
                Create a free account to sign up for jobs, track your schedule, and stay connected.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                {/* M-7 from the 2026-05-12 audit: bump primary CTAs to 44pt tap target. */}
                <button onClick={goRegister} style={{ ...btnP, padding: '12px 24px', fontSize: 14, minHeight: 44 }}>Create Account</button>
                <button onClick={() => onGetStarted('login')} style={{ ...btnS, padding: '12px 24px', fontSize: 14, minHeight: 44 }}>Sign In</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
