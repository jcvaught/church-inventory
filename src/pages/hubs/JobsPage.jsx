import { useState, useMemo, useContext } from 'react';
import { B, f1, f2, inp, btnP, btnS, btnD } from '../../components/brand/tokens.js';
import { Modal } from '../../components/primitives/Modal.jsx';
import { FF } from '../../components/primitives/FF.jsx';
import { MobileCtx } from '../../hooks/useMobile.js';

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const JOB_STATUS_COLORS = {
  open:      { bg: '#DCFCE7', tx: '#166534', dot: '#16A34A' },
  closed:    { bg: '#FEF9C3', tx: '#854D0E', dot: '#EAB308' },
  completed: { bg: '#E0F2FE', tx: '#075985', dot: '#0EA5E9' },
  cancelled: { bg: '#F3F4F6', tx: '#6B7280', dot: '#9CA3AF' },
};

const emptyJob = () => ({ title: '', description: '', scheduledDate: '', scheduledTime: '', location: '', spotsTotal: 1, pay: '', status: 'open' });
const emptyAnn = () => ({ title: '', body: '', expiresAt: '', pinned: false });

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

export function JobsPage({ store, userProfile }) {
  const {
    jobListings, jobAnnouncements,
    addJobListing, updateJobListing, deleteJobListing,
    signUpForJob, withdrawFromJob,
    addJobAnnouncement, updateJobAnnouncement, deleteJobAnnouncement,
    users, notificationConfig, config,
  } = store;
  const isMobile = useContext(MobileCtx);

  const userId = userProfile?.id || userProfile?.uid;
  const userName = userProfile?.name || 'Unknown';
  const isAdminOrManager = userProfile?.role === 'admin' || userProfile?.role === 'manager';
  const todayStr = localDateStr(new Date());

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
  const [msg, setMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  function flash(text, isError) {
    if (isError) { setErrMsg(text); setTimeout(() => setErrMsg(''), 4000); }
    else { setMsg(text); setTimeout(() => setMsg(''), 3000); }
  }

  async function sendAnnouncementEmails(title, body) {
    const nc = notificationConfig || {};
    if (!nc.enabled || !nc.serviceId || !nc.publicKey || !nc.templateJobAnnouncement) return;
    const churchName = config?.churchName || '';
    const recipients = (users || []).filter(u =>
      u.active !== false && u.email && (!u.allowedHubs || u.allowedHubs.includes('jobs'))
    );
    if (recipients.length === 0) return;
    try {
      const emailjs = await import('@emailjs/browser');
      await Promise.allSettled(recipients.map(u =>
        emailjs.send(nc.serviceId, nc.templateJobAnnouncement, {
          to_email: u.email,
          to_name: u.name || '',
          announcement_title: title,
          announcement_body: body,
          posted_by: userName,
          church_name: churchName,
        }, { publicKey: nc.publicKey })
      ));
    } catch { /* silent — email failure shouldn't block announcement */ }
  }

  // ── Derived state ──
  const isSignedUp = (job) => (job.signups || []).some(s => s.uid === userId);
  const isFull = (job) => (job.signups || []).length >= (job.spotsTotal || 1);

  const filteredJobs = useMemo(() => {
    let jobs = jobListings || [];
    if (statusFilter !== 'all') jobs = jobs.filter(j => j.status === statusFilter);
    return [...jobs].sort((a, b) =>
      (a.scheduledDate || '').localeCompare(b.scheduledDate || '') ||
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
  }, [jobListings, statusFilter]);

  const visibleAnnouncements = useMemo(() => {
    const ann = (jobAnnouncements || []).filter(a => !a.expiresAt || a.expiresAt >= todayStr);
    return [...ann].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }, [jobAnnouncements, todayStr]);

  // Keep detail in sync with live store data
  const liveDetail = showJobDetail
    ? (jobListings || []).find(j => j._docId === showJobDetail._docId) || showJobDetail
    : null;

  // ── Job form handlers ──
  function openNewJob() {
    setJobForm(emptyJob());
    setEditJobId(null);
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
    });
    setEditJobId(job._docId);
    setShowNewJob(true);
  }

  async function handleSaveJob() {
    if (!jobForm.title.trim() || !jobForm.scheduledDate) return;
    setSaving(true);
    try {
      const data = {
        ...jobForm,
        spotsTotal: Number(jobForm.spotsTotal) || 1,
        pay: jobForm.pay === '' ? null : Number(jobForm.pay),
      };
      if (editJobId) {
        await updateJobListing(editJobId, data);
        flash('Job updated.');
      } else {
        await addJobListing(data, userId, userName);
        flash('Job posted.');
      }
      setShowNewJob(false);
      setEditJobId(null);
    } catch {
      flash('Failed to save job.', true);
    }
    setSaving(false);
  }

  async function handleDeleteJob(job) {
    if (!window.confirm(`Delete "${job.title}"? This cannot be undone.`)) return;
    await deleteJobListing(job._docId);
    setShowJobDetail(null);
    flash('Job deleted.');
  }

  async function handleSignUp(job) {
    setSaving(true);
    const result = await signUpForJob(job._docId, userId, userName);
    if (result?.error) flash(result.error, true);
    else flash('You signed up!');
    setSaving(false);
  }

  async function handleWithdraw(job) {
    if (!window.confirm('Remove yourself from this job?')) return;
    setSaving(true);
    await withdrawFromJob(job._docId, userId);
    flash('Removed from job.');
    setSaving(false);
  }

  async function handleAdminRemoveSignup(job, uid) {
    if (!window.confirm('Remove this person from the job?')) return;
    await withdrawFromJob(job._docId, uid);
    flash('Removed.');
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
    });
    setEditAnnId(ann._docId);
    setShowNewAnn(true);
  }

  async function handleSaveAnn() {
    if (!annForm.title.trim() || !annForm.body.trim()) return;
    setSaving(true);
    try {
      const data = { ...annForm, expiresAt: annForm.expiresAt || null };
      if (editAnnId) {
        await updateJobAnnouncement(editAnnId, data);
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
    if (!window.confirm('Delete this announcement?')) return;
    await deleteJobAnnouncement(ann._docId);
    flash('Deleted.');
  }

  async function handleTogglePin(ann) {
    await updateJobAnnouncement(ann._docId, { pinned: !ann.pinned });
  }

  return (
    <div>
      {/* Flash messages */}
      {msg && (
        <div style={{ background: B.tealPale, border: '1px solid ' + B.tealLight, borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 14, fontWeight: 600, color: B.teal }}>
          {msg}
        </div>
      )}
      {errMsg && (
        <div style={{ background: '#FEE8E8', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 14, fontWeight: 600, color: B.red }}>
          {errMsg}
        </div>
      )}

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['jobs', '💼 Job Board'], ['announcements', '📢 Announcements']].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            style={{ padding: '8px 18px', borderRadius: 20, border: '1px solid ' + (view === v ? B.teal : B.sand), background: view === v ? B.tealPale : B.white, color: view === v ? B.teal : B.textMid, fontFamily: f1, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Job Board ── */}
      {view === 'jobs' && (
        <div>
          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
              {[['open','Open'],['closed','Closed'],['completed','Completed'],['cancelled','Cancelled'],['all','All']].map(([v, label]) => (
                <button key={v} onClick={() => setStatusFilter(v)}
                  style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid ' + (statusFilter === v ? B.teal : B.sand), background: statusFilter === v ? 'rgba(42,125,110,0.1)' : B.white, color: statusFilter === v ? B.teal : B.textMid, fontSize: 13, fontWeight: 600, fontFamily: f1, cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
            {isAdminOrManager && (
              <button onClick={openNewJob} style={{ ...btnP, padding: '8px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>+ Post Job</button>
            )}
          </div>

          {/* Job cards */}
          {filteredJobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: B.textLight, fontFamily: f2, fontSize: 14 }}>
              {statusFilter === 'open' ? 'No open jobs right now — check back soon!' : 'No jobs in this category.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {filteredJobs.map(job => {
                const signed = isSignedUp(job);
                const full = isFull(job);
                const overdue = job.scheduledDate && job.scheduledDate < todayStr && job.status === 'open';
                return (
                  <div key={job._docId} onClick={() => setShowJobDetail(job)}
                    style={{ background: B.white, borderRadius: 14, border: '1px solid ' + (overdue ? '#FECACA' : B.sand), padding: 18, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(27,42,74,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                    {/* Header row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: B.textLight, background: B.warmGray, padding: '2px 6px', borderRadius: 4 }}>{job.jobNumber}</span>
                      <JobStatusBadge status={job.status} />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, fontFamily: f1, color: B.navy, marginBottom: 6 }}>{job.title}</div>
                    <div style={{ fontSize: 12, color: B.textMid, fontFamily: f2, marginBottom: 2 }}>
                      📅 {job.scheduledDate || '—'}{job.scheduledTime ? ' at ' + job.scheduledTime : ''}
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
                    {(job.signups || []).length > 0 && (
                      <div style={{ fontSize: 12, color: B.textMid, fontFamily: f2, marginBottom: 10 }}>
                        {job.signups.map(s => s.name).join(', ')}
                      </div>
                    )}
                    {/* Inline action (stops card click) */}
                    {job.status === 'open' && (
                      <div onClick={e => e.stopPropagation()}>
                        {signed ? (
                          <button onClick={() => handleWithdraw(job)} disabled={saving}
                            style={{ ...btnS, fontSize: 12, padding: '6px 12px', color: B.red, borderColor: '#FECACA', width: '100%' }}>
                            Withdraw
                          </button>
                        ) : full ? (
                          <button disabled style={{ ...btnS, fontSize: 12, padding: '6px 12px', opacity: 0.45, width: '100%', cursor: 'not-allowed' }}>Full</button>
                        ) : (
                          <button onClick={() => handleSignUp(job)} disabled={saving}
                            style={{ ...btnP, fontSize: 12, padding: '6px 12px', width: '100%' }}>
                            Sign Up
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
                <div key={ann._docId} style={{ background: B.white, borderRadius: 12, border: '1px solid ' + (ann.pinned ? B.teal : B.sand), padding: 18 }}>
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
                        <button onClick={() => handleTogglePin(ann)}
                          title={ann.pinned ? 'Unpin' : 'Pin to top'}
                          aria-label={ann.pinned ? 'Unpin announcement' : 'Pin announcement to top'}
                          style={{ ...btnS, padding: '5px 9px', fontSize: 13 }}>
                          {ann.pinned ? '📌' : '📍'}
                        </button>
                        <button onClick={() => openEditAnn(ann)} style={{ ...btnS, padding: '5px 9px', fontSize: 13 }}>Edit</button>
                        <button onClick={() => handleDeleteAnn(ann)} style={{ ...btnD, padding: '5px 9px', fontSize: 13 }}>Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── New / Edit Job Modal ── */}
      {showNewJob && (
        <Modal title={editJobId ? 'Edit Job' : 'Post a Job'} onClose={() => { setShowNewJob(false); setEditJobId(null); }} maxWidth={560}>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button onClick={() => { setShowNewJob(false); setEditJobId(null); }} style={btnS}>Cancel</button>
            <button onClick={handleSaveJob}
              disabled={saving || !jobForm.title.trim() || !jobForm.scheduledDate}
              style={{ ...btnP, opacity: (!jobForm.title.trim() || !jobForm.scheduledDate || saving) ? 0.5 : 1 }}>
              {saving ? 'Saving...' : editJobId ? 'Save Changes' : 'Post Job'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Job Detail Modal ── */}
      {liveDetail && (
        <Modal title={liveDetail.jobNumber + ' — ' + liveDetail.title} onClose={() => setShowJobDetail(null)} maxWidth={540}>
          <div style={{ marginBottom: 14 }}><JobStatusBadge status={liveDetail.status} /></div>
          {liveDetail.description && (
            <div style={{ fontSize: 14, color: B.textDark, fontFamily: f2, lineHeight: 1.6, marginBottom: 16, whiteSpace: 'pre-wrap' }}>{liveDetail.description}</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: B.textLight, textTransform: 'uppercase', letterSpacing: .8, fontFamily: f1, marginBottom: 2 }}>Date</div>
              <div style={{ fontSize: 14, color: B.textDark, fontFamily: f2 }}>
                {liveDetail.scheduledDate || '—'}{liveDetail.scheduledTime ? ' at ' + liveDetail.scheduledTime : ''}
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
          </div>
          <div style={{ marginBottom: 16 }}><SpotsBar job={liveDetail} /></div>
          {/* Signup list */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: B.textMid, textTransform: 'uppercase', letterSpacing: .8, fontFamily: f1, marginBottom: 8 }}>Signed Up</div>
            {(liveDetail.signups || []).length === 0 ? (
              <div style={{ fontSize: 13, color: B.textLight, fontFamily: f2 }}>No signups yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {liveDetail.signups.map(s => (
                  <div key={s.uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: B.warmGray, borderRadius: 8 }}>
                    <span style={{ fontSize: 13, fontFamily: f2, color: B.textDark }}>{s.name}</span>
                    {isAdminOrManager && (
                      <button onClick={() => handleAdminRemoveSignup(liveDetail, s.uid)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: B.red, fontSize: 12, fontFamily: f1, padding: '2px 6px' }}
                        aria-label={'Remove ' + s.name}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Action row */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {isAdminOrManager && (
                <>
                  <button onClick={() => { setShowJobDetail(null); openEditJob(liveDetail); }} style={{ ...btnS, fontSize: 13 }}>Edit</button>
                  <button onClick={() => handleDeleteJob(liveDetail)} style={{ ...btnD, fontSize: 13 }}>Delete</button>
                </>
              )}
            </div>
            {liveDetail.status === 'open' && (
              isSignedUp(liveDetail) ? (
                <button onClick={() => handleWithdraw(liveDetail)} disabled={saving}
                  style={{ ...btnS, color: B.red, borderColor: '#FECACA', fontSize: 13 }}>
                  Withdraw
                </button>
              ) : !isFull(liveDetail) ? (
                <button onClick={() => handleSignUp(liveDetail)} disabled={saving} style={{ ...btnP, fontSize: 13 }}>
                  Sign Up
                </button>
              ) : null
            )}
          </div>
        </Modal>
      )}

      {/* ── New / Edit Announcement Modal ── */}
      {showNewAnn && (
        <Modal title={editAnnId ? 'Edit Announcement' : 'Post Announcement'} onClose={() => { setShowNewAnn(false); setEditAnnId(null); }} maxWidth={520}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
              <input type="checkbox" id="pinAnn" checked={annForm.pinned} onChange={e => setAnnForm(f => ({ ...f, pinned: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              <label htmlFor="pinAnn" style={{ fontSize: 13, fontFamily: f2, color: B.textDark, cursor: 'pointer' }}>Pin to top</label>
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
    </div>
  );
}
