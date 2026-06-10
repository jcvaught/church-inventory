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
import { useEffect, useMemo, useState } from 'react';
import {
  collection, getDocs, getDoc, query, orderBy, doc, setDoc, addDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import * as Sentry from '@sentry/react';
import { db } from '../../firebase.js';
import { B, f1, f2, inp, btnP, btnS } from '../../components/brand/tokens.js';
import { Modal } from '../../components/primitives/Modal.jsx';

const SHEPHERD_CHURCH_ID = '6cksNI9Uv8h0jXptdTESnXTXFgF3-church';

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
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [view, setView] = useState('flock');        // 'flock' | 'all'
  const [viewAsKey, setViewAsKey] = useState(null); // admin: which elder's flock to preview
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'inactive' | 'all'
  const [assignFilter, setAssignFilter] = useState('all');    // 'all' | 'assigned' | 'unassigned' | 'orphaned'
  const [selected, setSelected] = useState(null);

  const myEmail = (userProfile?.email || '').trim().toLowerCase();

  // Load roster + the full congregation cache once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base = `churches/${SHEPHERD_CHURCH_ID}`;
        const [rosterSnap, peopleSnap] = await Promise.all([
          getDocs(collection(db, `${base}/config`)),
          getDocs(query(collection(db, `${base}/shepherdPeople`), orderBy('name'))),
        ]);
        if (cancelled) return;
        const rosterDoc = rosterSnap.docs.find(d => d.id === 'shepherdRoster');
        const r = rosterDoc?.data() || { elders: [], former: [] };
        setRoster({ elders: r.elders || [], former: r.former || [] });
        setPeople(peopleSnap.docs.map(d => ({ _id: d.id, ...d.data() })));
      } catch (e) {
        if (cancelled) return;
        setErr(e?.message || 'Failed to load Shepherd Hub.');
        Sentry.captureException(e, { tags: { area: 'shepherd-hub', fn: 'load' } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
    return people.filter(p => {
      if (view === 'flock') {
        if (!activeKey || !(p.elderKeys || []).includes(activeKey)) return false;
      }
      if (statusFilter === 'active' && p.status !== 'active') return false;
      if (statusFilter === 'inactive' && p.status === 'active') return false;
      if (view === 'all') {
        if (assignFilter === 'assigned' && !p.hasAssignment) return false;
        if (assignFilter === 'unassigned' && p.hasAssignment) return false;
        if (assignFilter === 'orphaned' && !p.orphaned) return false;
      }
      if (q && !(p.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [people, view, activeKey, statusFilter, assignFilter, search]);

  // Coverage counts (active people only) for the header strip.
  const coverage = useMemo(() => {
    const active = people.filter(p => p.status === 'active');
    return {
      total: people.length,
      active: active.length,
      assigned: active.filter(p => p.hasAssignment).length,
      orphaned: active.filter(p => p.orphaned).length,
    };
  }, [people]);

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
          </p>
        </div>
        {!myKey && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: B.textMid, fontFamily: f1 }}>View as</span>
            <select value={viewAsKey || ''} onChange={e => setViewAsKey(e.target.value)} style={{ ...inp, width: 'auto', padding: '8px 12px' }}>
              {(roster.elders || []).map(e => (
                <option key={e.key} value={e.key}>{e.name}{e.sabbatical ? ' (sabbatical)' : ''}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <Tab id="flock" label={myKey ? 'My Flock' : `${activeElder ? activeElder.name + "'s" : ''} Flock`} />
        <Tab id="all" label="All Congregation" />
        {view === 'flock' && activeElder?.sabbatical && (
          <span style={chip(B.goldLight, '#96750E')}>On sabbatical</span>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name…" style={{ ...inp, flex: '1 1 220px', maxWidth: 360 }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inp, width: 'auto' }}>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
          <option value="all">All statuses</option>
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

      {/* Results */}
      <div style={{ fontSize: 12, color: B.textLight, marginBottom: 8, fontFamily: f1, fontWeight: 600 }}>{filtered.length} {filtered.length === 1 ? 'person' : 'people'}</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {filtered.map(p => (
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

      {selected && <PersonDetail person={selected} elderName={elderName} userProfile={userProfile} isElder={isElder} onClose={() => setSelected(null)} />}
    </div>
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

function PersonDetail({ person: p, elderName, userProfile, isElder, onClose }) {
  const addr = (p.addresses || [])[0];
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
          <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(p.elderKeys || []).map(k => <span key={k} style={chip(B.tealPale, B.teal)}>{elderName(k)}</span>)}
            {!p.hasAssignment && <span style={chip(B.warmGray, B.textLight)}>No elder assigned</span>}
            {p.orphaned && <span style={chip('#FEF2F2', B.red)}>Orphaned</span>}
          </div>
        </div>
      </div>

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

// Private note (owner-only) + shared care thread for one person.
function NotesSection({ person, userProfile }) {
  const base = `churches/${SHEPHERD_CHURCH_ID}/shepherdPeople/${person._id}`;
  const [privateText, setPrivateText] = useState('');
  const [privateSaved, setPrivateSaved] = useState('');
  const [savingPrivate, setSavingPrivate] = useState(false);
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
    setSavingPrivate(true);
    try {
      await setDoc(doc(db, `${base}/privateNotes/${userProfile.uid}`), {
        text: privateText, authorName: userProfile.name || null, updatedAt: serverTimestamp(),
      });
      setPrivateSaved(privateText);
      logShepherdAudit('edit_private_note', person, userProfile);
    } catch (e) {
      Sentry.captureException(e, { tags: { area: 'shepherd-hub', fn: 'notes-save-private' } });
    } finally { setSavingPrivate(false); }
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
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
