import { useState, useEffect, useContext } from 'react';
import { B, f1, f2, inp, btnP, btnS } from '../components/brand/tokens.js';
import { MobileCtx } from '../hooks/useMobile.js';
import { Modal } from '../components/primitives/Modal.jsx';
import { FF } from '../components/primitives/FF.jsx';
import { Spinner } from '../components/primitives/Spinner.jsx';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '../firebase.js';
import { collection, query, where, getDocs } from 'firebase/firestore';

export function SettingsPage({ store, userProfile, subscription, user, canAdd, deleteAccount }) {
  const { settings, config, users, accessPeople, accessRecords, rooms, updateSettings, updateConfig, updateUser, removeUser, submitSuggestion, loadSuggestions, addRoom, updateRoom, deleteRoom } = store;
  const isMobile = useContext(MobileCtx);
  const [editList, setEditList] = useState(null); // { key, title, items }
  const [newItem, setNewItem] = useState("");
  const [editingItem, setEditingItem] = useState(null); // original value being edited
  const [editingValue, setEditingValue] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [editCodeMode, setEditCodeMode] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [suggestionText, setSuggestionText] = useState("");
  const [suggestionCategory, setSuggestionCategory] = useState("Feature Request");
  const [suggestionSent, setSuggestionSent] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [allSuggestions, setAllSuggestions] = useState(null);
  const [suggestionFilter, setSuggestionFilter] = useState("All");
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [allChurches, setAllChurches] = useState(null);
  const [loadingChurches, setLoadingChurches] = useState(false);
  const [ownerTab, setOwnerTab] = useState('suggestions');
  const [editAccessUser, setEditAccessUser] = useState(null);
  const [editRole, setEditRole] = useState('user');
  const [editHubs, setEditHubs] = useState([]);
  const [editMinistries, setEditMinistries] = useState([]);
  const [savingAccess, setSavingAccess] = useState(false);
  const [inviteHubs, setInviteHubs] = useState(() => []);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [requestLinkCopied, setRequestLinkCopied] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [showSpacesModal, setShowSpacesModal] = useState(false);
  const [roomForm, setRoomForm] = useState({ name:'', capacity:'', location:'', description:'', amenities:'' });
  const [editRoomId, setEditRoomId] = useState(null);
  const [savingRoom, setSavingRoom] = useState(false);
  const [inviteHubsInitialized, setInviteHubsInitialized] = useState(false);
  const [jobDelegates, setJobDelegates] = useState(() => userProfile?.jobPosterDelegates || []);
  const [savingDelegates, setSavingDelegates] = useState(false);
  const [phoneInput, setPhoneInput] = useState(() => userProfile?.phone || '');
  const [smsEnabled, setSmsEnabled] = useState(() => !!userProfile?.smsRemindersEnabled);
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);

  const HUB_LABELS = { maintenance: 'Maintenance Hub', insights: 'Insights Hub', coordination: 'Coordination Hub', accountability: 'Accountability Hub', people_access: 'People Access Hub', tasks: 'Tasks Hub', jobs: 'Job Hub' };
  const churchHubs = subscription?.grandfathered || subscription?.plan === 'all_in'
    ? Object.keys(HUB_LABELS)
    : (subscription?.hubs || []);
  const maxUsers = subscription?.grandfathered || subscription?.plan === 'team_unlimited' || subscription?.plan === 'all_in'
    ? null
    : subscription?.plan === 'team_25' ? 25 : 10;

  function openEditAccess(u) {
    setEditAccessUser(u);
    setEditRole(u.role || 'user');
    setEditHubs(u.allowedHubs != null ? u.allowedHubs : [...churchHubs]);
    setEditMinistries(u.managedMinistries || []);
  }
  async function handleSaveAccess() {
    setSavingAccess(true);
    const allSelected = churchHubs.length === 0 || churchHubs.every(h => editHubs.includes(h));
    const hubsToSave = allSelected ? null : editHubs;
    await updateUser(editAccessUser.id, {
      role: editRole,
      allowedHubs: hubsToSave,
      managedMinistries: editRole === 'manager' ? editMinistries : [],
    });
    setSavingAccess(false);
    setEditAccessUser(null);
  }

  // Sync inviteHubs default to churchHubs once subscription loads (runs once when churchHubs becomes non-empty)
  useEffect(() => {
    if (!inviteHubsInitialized && churchHubs.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInviteHubsInitialized(true);
      setInviteHubs([...churchHubs]);
    }
  }, [churchHubs, inviteHubsInitialized]);

  // NOTE: owner emails also defined in functions/index.js (OWNER_EMAILS) and firestore.rules. Keep in sync.
  const isOwner = ['jcvaught@gmail.com', 'jvaught@fxcc.org'].includes(user?.email);

  if (!settings || !config) return <Spinner />;

  function openListEditor(key, title) {
    setEditList({ key, title, items: [...(settings[key] || [])] });
    setNewItem("");
  }
  function addToList() {
    if (!newItem.trim() || editList.items.map(i => i.toLowerCase()).includes(newItem.trim().toLowerCase())) return;
    const updated = [...editList.items, newItem.trim()];
    setEditList({ ...editList, items: updated });
    updateSettings({ [editList.key]: updated });
    setNewItem("");
  }
  function removeFromList(item) {
    const updated = editList.items.filter(i => i !== item);
    setEditList({ ...editList, items: updated });
    updateSettings({ [editList.key]: updated });
  }

  function saveEditingItem() {
    const trimmed = editingValue.trim();
    if (!trimmed || trimmed === editingItem) { setEditingItem(null); return; }
    if (editList.items.filter(i => i !== editingItem).map(i => i.toLowerCase()).includes(trimmed.toLowerCase())) {
      setEditingItem(null); return;
    }
    const updated = editList.items.map(i => i === editingItem ? trimmed : i);
    setEditList({ ...editList, items: updated });
    updateSettings({ [editList.key]: updated });
    setEditingItem(null);
  }
  async function handleChangeCode() {
    const code = newCode.trim().toUpperCase();
    if (code.length < 3) return;
    if (!window.confirm(`Change the church code to "${code}"? Anyone using the old code to join will no longer be able to.`)) return;
    const snap = await getDocs(query(collection(db, 'churches'), where('churchCode', '==', code)));
    const takenByOther = snap.docs.some(d => d.id !== userProfile?.churchId);
    if (takenByOther) { alert(`The code "${code}" is already in use by another church. Please choose a different code.`); return; }
    updateConfig({ churchCode: code });
    setEditCodeMode(false);
    setNewCode("");
  }

  async function handleSubmitSuggestion() {
    if (!suggestionText.trim()) return;
    setSuggestionLoading(true);
    await submitSuggestion(suggestionText.trim(), suggestionCategory, userProfile?.id, userProfile?.name, config?.churchName);
    setSuggestionLoading(false);
    setSuggestionText("");
    setSuggestionSent(true);
    setTimeout(() => setSuggestionSent(false), 4000);
  }

  async function handleLoadSuggestions() {
    setLoadingSuggestions(true);
    const results = await loadSuggestions();
    setAllSuggestions(results);
    setLoadingSuggestions(false);
  }

  async function handleLoadChurches() {
    setLoadingChurches(true);
    try {
      const fn = httpsCallable(getFunctions(app), 'getChurchStats');
      const result = await fn({});
      setAllChurches(result.data.churches);
    } catch {
      setAllChurches([]);
    }
    setLoadingChurches(false);
  }

  function handleCopyInviteLink() {
    const params = new URLSearchParams({ invite: config.churchCode });
    if (inviteHubs.length > 0) params.set('hubs', inviteHubs.join(','));
    navigator.clipboard.writeText(window.location.origin + '/?' + params.toString()).catch(() => {});
    setInviteLinkCopied(true);
    setTimeout(() => setInviteLinkCopied(false), 2000);
  }

  function handleCopyRequestLink() {
    const params = new URLSearchParams({ request: userProfile.churchId, cn: config?.churchName || '' });
    navigator.clipboard.writeText(window.location.origin + '/?' + params.toString()).catch(() => {});
    setRequestLinkCopied(true);
    setTimeout(() => setRequestLinkCopied(false), 2000);
  }

  const isGoogle = user?.providerData?.[0]?.providerId === 'google.com';

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    setDeleteError("");
    const res = await deleteAccount(deletePassword);
    if (!res.success) {
      setDeleteError(res.error || "Something went wrong. Please try again.");
      setDeleting(false);
    }
    // On success, auth state change will redirect to login — no cleanup needed
  }

  const isAdmin = userProfile?.role === "admin";
  const isManager = userProfile?.role === "manager";
  const managedMinistries = userProfile?.managedMinistries || [];
  const hasJobsHub = (subscription?.hubs || []).includes('jobs') || subscription?.plan === 'all_in' || subscription?.grandfathered;
  const userHasJobsAccess = hasJobsHub && (!userProfile?.allowedHubs || userProfile.allowedHubs.includes('jobs'));
  const adminManagerUsers = (users || []).filter(u => ['admin', 'manager'].includes(u.role) && u.id !== userProfile?.uid && u.active !== false);

  async function handleSaveDelegates(next) {
    setSavingDelegates(true);
    try { await updateUser(userProfile.uid, { jobPosterDelegates: next }); setJobDelegates(next); } catch { /* ignore */ }
    setSavingDelegates(false);
  }

  function normalizePhone(raw) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return '+1' + digits;
    if (digits.length === 11 && digits[0] === '1') return '+' + digits;
    return null;
  }

  async function handleSavePhone() {
    const normalized = normalizePhone(phoneInput);
    if (phoneInput.trim() && !normalized) return; // invalid format, don't save
    setSavingPhone(true);
    try {
      await updateUser(userProfile.uid, {
        phone: normalized || '',
        smsRemindersEnabled: normalized ? smsEnabled : false,
      });
      if (!normalized) setSmsEnabled(false);
      setPhoneSaved(true);
      setTimeout(() => setPhoneSaved(false), 2000);
    } catch { /* ignore */ }
    setSavingPhone(false);
  }

  // ── People Access helpers (used for My Compliance card + Team badges) ──
  const ACCESS_TYPE_LABELS = { background_check: 'Background Check', key_assignment: 'Key / Fob', certification: 'Certification', custom: 'Custom' };
  const ACCESS_TYPE_ICONS = { background_check: '🔍', key_assignment: '🔑', certification: '🎓', custom: '✅' };

  function accessExpiryStatus(expiryDate) {
    if (!expiryDate) return null;
    const [y, m, d] = expiryDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const in30 = new Date(now); in30.setDate(in30.getDate() + 30);
    if (date < now) return 'expired';
    if (date <= in30) return 'warning';
    return 'ok';
  }

  function getUserComplianceBadge(userId) {
    const person = (accessPeople || []).find(p => p.userId === userId && p.active);
    if (!person) return null;
    const recs = (accessRecords || []).filter(r => r.personId === person._docId);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const in30 = new Date(now); in30.setDate(in30.getDate() + 30);
    const hasExpired = recs.some(r => { if (!r.expiryDate) return false; const [y,m,d] = r.expiryDate.split('-').map(Number); return new Date(y,m-1,d) < now; });
    const hasWarning = recs.some(r => { if (!r.expiryDate) return false; const [y,m,d] = r.expiryDate.split('-').map(Number); const dt = new Date(y,m-1,d); return dt >= now && dt <= in30; });
    if (hasExpired) return '🔴';
    if (hasWarning) return '🟡';
    return null;
  }
  const listCard = (key, title, icon) => {
    const items = settings[key] || [];
    return (
      <div style={{ background:B.white, borderRadius:14, padding:"20px 22px", border:"1px solid "+B.sand, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <h3 style={{ margin:0, fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>{icon} {title}</h3>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:13, color:B.textLight }}>{items.length} items</span>
            {(isAdmin || isManager) && <button onClick={() => openListEditor(key, title)} style={{ ...btnP, padding:"6px 14px", fontSize:12 }}>Edit</button>}
          </div>
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {items.slice(0, 12).map(item => (
            <span key={item} style={{ padding:"4px 12px", borderRadius:20, background:B.warmGray, fontSize:12, color:B.textMid, fontFamily:f1, fontWeight:500 }}>{item}</span>
          ))}
          {items.length > 12 && <span style={{ padding:"4px 12px", fontSize:12, color:B.textLight }}>+{items.length - 12} more</span>}
        </div>
      </div>
    );
  };

  const isTrialing = subscription?.freeHubsSelected === null && subscription?.trialEndsAt && new Date(subscription.trialEndsAt) > new Date();
  const trialDaysLeft = isTrialing ? Math.max(0, Math.ceil((new Date(subscription.trialEndsAt) - new Date()) / (1000 * 60 * 60 * 24))) : 0;
  const planLabel = !subscription ? 'Free' : isTrialing ? '90-Day Trial' : subscription.plan === 'free' ? 'Free' : subscription.plan === 'all_in' ? 'All-In' : subscription.plan === 'team_unlimited' ? 'Team Unlimited' : subscription.plan;
  const activeHubs = subscription?.grandfathered ? ['All hubs (grandfathered)'] : isTrialing ? (subscription.trialHubs || []) : (subscription?.hubs || []);
  const hasStripeCustomer = !!subscription?.stripeCustomerId;

  async function handleCheckout(item) {
    setBillingError("");
    setBillingLoading(true);
    try {
      const fns = getFunctions(app);
      const createSession = httpsCallable(fns, 'createCheckoutSession');
      const { data } = await createSession({
        item,
        successUrl: window.location.href,
        cancelUrl: window.location.href,
      });
      window.location.href = data.url;
    } catch (err) {
      setBillingError((err.message || 'Failed to start checkout.') + ' If this keeps happening, contact jcvaught@gmail.com.');
      setBillingLoading(false);
    }
  }

  async function handleManageBilling() {
    setBillingError("");
    setBillingLoading(true);
    try {
      const fns = getFunctions(app);
      const createPortal = httpsCallable(fns, 'createPortalSession');
      const { data } = await createPortal({ returnUrl: window.location.href });
      window.location.href = data.url;
    } catch (err) {
      setBillingError((err.message || 'Failed to open billing portal.') + ' If this keeps happening, contact jcvaught@gmail.com.');
      setBillingLoading(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontFamily:f1, fontSize:22, fontWeight:700, color:B.navy, margin:"0 0 20px" }}>Settings</h2>

      {/* My Profile — visible to all users */}
      <div style={{ background:B.white, borderRadius:14, padding:"22px 24px", border:"1px solid "+B.sand, marginBottom:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <h3 style={{ margin:"0 0 16px", fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>My Profile</h3>
        <div style={{ display:"flex", gap:24, flexWrap:"wrap", alignItems:"flex-start" }}>
          <div>
            <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Name</div>
            <div style={{ fontSize:15, fontWeight:600 }}>{userProfile?.name}</div>
          </div>
          <div>
            <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Email</div>
            <div style={{ fontSize:15 }}>{user?.email}</div>
          </div>
          <div>
            <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Role</div>
            <span style={{ padding:"3px 10px", borderRadius:20, fontSize:13, fontWeight:600, fontFamily:f1,
              background: isAdmin ? B.goldLight : isManager ? B.tealPale : B.warmGray,
              color: isAdmin ? "#96750E" : isManager ? B.teal : B.textMid }}>
              {userProfile?.role || "user"}
            </span>
          </div>
          {isManager && managedMinistries.length > 0 && (
            <div>
              <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Managed Ministries</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {managedMinistries.map(m => (
                  <span key={m} style={{ padding:"2px 10px", borderRadius:20, background:B.tealPale, color:B.teal, fontSize:12, fontWeight:600, fontFamily:f1 }}>{m}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Job Hub Delegates — admin/manager with Jobs hub */}
        {(isAdmin || isManager) && hasJobsHub && (
          <div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid '+B.sand, width:'100%' }}>
            <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:'uppercase', letterSpacing:.8, fontFamily:f1, marginBottom:4 }}>Job Hub Report Delegates</div>
            <div style={{ fontSize:13, color:B.textMid, fontFamily:f2, marginBottom:10 }}>
              These users receive the same notifications you do when someone withdraws from a job you posted.
            </div>
            {adminManagerUsers.length === 0 ? (
              <div style={{ fontSize:13, color:B.textLight, fontFamily:f2 }}>No other admins or managers in your church.</div>
            ) : (
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {adminManagerUsers.map(u => {
                  const sel = jobDelegates.some(d => d.uid === u.id);
                  return (
                    <button key={u.id}
                      disabled={savingDelegates || (!sel && jobDelegates.length >= 5)}
                      onClick={() => {
                        const next = sel
                          ? jobDelegates.filter(d => d.uid !== u.id)
                          : [...jobDelegates, { uid: u.id, name: u.name }];
                        handleSaveDelegates(next);
                      }}
                      style={{ padding:'5px 12px', borderRadius:20, fontSize:13, fontFamily:f1, fontWeight:600, cursor:'pointer',
                        border:'1px solid '+(sel ? B.teal : B.sand),
                        background: sel ? B.tealPale : B.white,
                        color: sel ? B.teal : B.textMid,
                        opacity: (savingDelegates || (!sel && jobDelegates.length >= 5)) ? 0.5 : 1 }}>
                      {sel ? '✓ ' : ''}{u.name}
                    </button>
                  );
                })}
              </div>
            )}
            {jobDelegates.length >= 5 && <div style={{ fontSize:12, color:B.textLight, marginTop:6, fontFamily:f2 }}>Maximum 5 delegates.</div>}
          </div>
        )}

        {/* SMS Reminders — visible to any user who has Jobs Hub access */}
        {userHasJobsAccess && (
          <div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid '+B.sand, width:'100%' }}>
            <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:'uppercase', letterSpacing:.8, fontFamily:f1, marginBottom:4 }}>SMS Job Reminders</div>
            <div style={{ fontSize:13, color:B.textMid, fontFamily:f2, marginBottom:10 }}>
              Receive a text message the morning of any job you're signed up for.
            </div>
            <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
              <input
                type="tel"
                placeholder="(555) 555-5555"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
                style={{ ...inp, width:160, fontSize:14 }}
              />
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontFamily:f2, color:B.textMid, cursor:'pointer' }}>
                <input
                  type="checkbox"
                  checked={smsEnabled}
                  disabled={!phoneInput.trim()}
                  onChange={e => setSmsEnabled(e.target.checked)}
                  style={{ accentColor:B.teal, width:15, height:15 }}
                />
                Enable SMS reminders
              </label>
              <button
                onClick={handleSavePhone}
                disabled={savingPhone}
                style={{ ...btnP, padding:'7px 18px', fontSize:13, opacity:savingPhone?0.6:1 }}
              >
                {phoneSaved ? 'Saved!' : savingPhone ? 'Saving…' : 'Save'}
              </button>
            </div>
            <div style={{ fontSize:11, color:B.textLight, marginTop:8, fontFamily:f2, maxWidth:480 }}>
              By enabling SMS reminders you consent to receive automated text messages from ChurchOpsHub. Message and data rates may apply. Reply STOP to opt out at any time.
            </div>
          </div>
        )}
      </div>

      {/* My Compliance — visible if this user is linked to an accessPerson */}
      {(() => {
        const myPerson = (accessPeople || []).find(p => p.userId === userProfile.uid);
        if (!myPerson) return null;
        const myRecords = (accessRecords || [])
          .filter(r => r.personId === myPerson._docId)
          .sort((a, b) => (b.completedDate || '').localeCompare(a.completedDate || ''));
        return (
          <div style={{ background:B.white, borderRadius:14, padding:"22px 24px", border:"1px solid "+B.sand, marginBottom:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
            <h3 style={{ margin:"0 0 16px", fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>My Compliance</h3>
            {myRecords.length === 0 ? (
              <p style={{ color:B.textLight, fontSize:14, margin:0 }}>No compliance records on file.</p>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {myRecords.map(r => {
                  const es = accessExpiryStatus(r.expiryDate);
                  return (
                    <div key={r._docId} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, background:B.warmGray }}>
                      <span style={{ fontSize:18 }}>{ACCESS_TYPE_ICONS[r.type] || '✅'}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:13, fontFamily:f1, color:B.navy }}>
                          {ACCESS_TYPE_LABELS[r.type] || r.type}
                          {r.certType ? ` — ${r.certType}` : ''}
                          {r.requirementName ? ` — ${r.requirementName}` : ''}
                          {r.keyIdentifier ? ` — ${r.keyIdentifier}` : ''}
                        </div>
                        <div style={{ fontSize:12, color:B.textMid }}>
                          Completed {r.completedDate}
                          {r.expiryDate && (
                            <span style={{ color: es === 'expired' ? B.red : es === 'warning' ? '#92400E' : B.textMid }}>
                              {' '}· Expires {r.expiryDate}
                              {es === 'expired' && ' 🔴'}
                              {es === 'warning' && ' 🟡'}
                            </span>
                          )}
                          {r.type === 'key_assignment' && !r.returnedDate && <span style={{ color:B.gold }}> · Key not returned</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Job Hub Settings — admin only, gated on jobs hub */}
      {isAdmin && hasJobsHub && (
        <div style={{ background:B.white, borderRadius:14, padding:"22px 24px", border:"1px solid "+B.sand, marginBottom:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
          <h3 style={{ margin:"0 0 16px", fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Job Hub Settings</h3>
          <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:'uppercase', letterSpacing:.8, fontFamily:f1, marginBottom:4 }}>Display Roster To</div>
          <div style={{ fontSize:13, color:B.textMid, fontFamily:f2, marginBottom:10 }}>Controls who can see the names signed up for a job. Spot counts are always visible to all.</div>
          {[
            { v:'admin', label:'Admins & Managers only' },
            { v:'signups', label:'Anyone signed up for that job' },
            { v:'all', label:'All church members' },
          ].map(opt => (
            <label key={opt.v} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, cursor:'pointer', fontSize:14, fontFamily:f2, color:B.textDark }}>
              <input type="radio" name="rosterVis" value={opt.v}
                checked={(settings?.jobsRosterVisibility ?? 'signups') === opt.v}
                onChange={() => updateSettings({ jobsRosterVisibility: opt.v })} />
              {opt.label}
            </label>
          ))}
        </div>
      )}

      {/* Subscription & Billing */}
      <div style={{ background:B.white, borderRadius:14, padding:"22px 24px", border:"1px solid "+B.sand, marginBottom:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <h3 style={{ margin:0, fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Subscription & Billing</h3>
          {isAdmin && (
            <div style={{ display:"flex", gap:8 }}>
              {hasStripeCustomer && (
                <button onClick={handleManageBilling} disabled={billingLoading} style={{ ...btnS, padding:"6px 14px", fontSize:12 }}>
                  {billingLoading ? "..." : "Manage Billing"}
                </button>
              )}
              {!subscription?.grandfathered && subscription?.plan !== 'all_in' && (
                <button onClick={() => setShowUpgradeModal(true)} style={{ ...btnP, padding:"6px 14px", fontSize:12 }}>
                  Upgrade
                </button>
              )}
            </div>
          )}
        </div>
        <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Current Plan</div>
            <div style={{ fontSize:15, fontWeight:700, color:B.navy }}>{planLabel}</div>
          </div>
          <div>
            <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Status</div>
            <div style={{ fontSize:15, fontWeight:600, color: isTrialing || subscription?.status === 'active' ? B.teal : B.red }}>
              {isTrialing ? `Trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left` : (subscription?.status || 'active')}
            </div>
          </div>
          {activeHubs.length > 0 && (
            <div>
              <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Active Hubs</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {activeHubs.map(h => (
                  <span key={h} style={{ padding:"2px 10px", borderRadius:20, background:B.tealPale, color:B.teal, fontSize:12, fontWeight:600, fontFamily:f1 }}>{h}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        {billingError && <p style={{ color:B.red, fontSize:13, marginTop:10, marginBottom:0 }}>{billingError}</p>}
        {isTrialing && (
          <div style={{ background: trialDaysLeft <= 7 ? '#FFF1F2' : '#F0FDF4', border:`1px solid ${trialDaysLeft <= 7 ? '#FECACA' : '#BBF7D0'}`, borderRadius:8, padding:"10px 14px", marginTop:12 }}>
            <p style={{ margin:0, fontSize:13, color: trialDaysLeft <= 7 ? '#B91C1C' : '#166534' }}>
              All hubs are free until your trial ends.{' '}
              {trialDaysLeft <= 7 && isAdmin && <strong>Upgrade before your trial expires to keep all hubs. </strong>}
              After the trial, your two most-used hubs stay free.{' '}
              {isAdmin && <button onClick={() => setShowUpgradeModal(true)} style={{ background:"none", border:"none", padding:0, color: trialDaysLeft <= 7 ? '#B91C1C' : B.teal, fontWeight:600, fontSize:13, cursor:"pointer" }}>View upgrade options →</button>}
            </p>
          </div>
        )}
        {!isTrialing && planLabel === 'Free' && (
          <p style={{ color:B.textLight, fontSize:13, marginTop:12, marginBottom:0 }}>
            Add hubs like <strong>Maintenance</strong> to unlock advanced features.{' '}
            {isAdmin && <button onClick={() => setShowUpgradeModal(true)} style={{ background:"none", border:"none", padding:0, color:B.teal, fontWeight:600, fontSize:13, cursor:"pointer" }}>View plans →</button>}
          </p>
        )}
      </div>

      {/* Church Info */}
      <div style={{ background:B.white, borderRadius:14, padding:"22px 24px", border:"1px solid "+B.sand, marginBottom:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <h3 style={{ margin:"0 0 16px", fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Church Info</h3>
        <div style={{ display:"flex", gap:20, flexWrap:"wrap", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Church Name</div>
            <div style={{ fontSize:16, fontWeight:600 }}>{config.churchName}</div>
          </div>
          <div>
            <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Church Code</div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {editCodeMode ? (
                <>
                  <input style={{...inp, width:150, fontFamily:"monospace", letterSpacing:2, textTransform:"uppercase", padding:"7px 12px"}} value={newCode} onChange={e=>setNewCode(e.target.value.toUpperCase())} placeholder="NEW CODE"/>
                  <button onClick={handleChangeCode} style={{...btnP, padding:"7px 14px", fontSize:12}}>Save</button>
                  <button onClick={()=>setEditCodeMode(false)} style={{...btnS, padding:"7px 14px", fontSize:12}}>Cancel</button>
                </>
              ) : (
                <>
                  <span style={{ fontSize:16, fontWeight:700, fontFamily:"monospace", letterSpacing:2, color: showCode ? B.navy : B.textLight }}>
                    {showCode ? config.churchCode : "••••••••"}
                  </span>
                  <button onClick={()=>setShowCode(!showCode)} style={{ background:"none", border:"none", color:B.teal, cursor:"pointer", fontSize:12, fontFamily:f1, fontWeight:600 }}>
                    {showCode ? "Hide" : "Show"}
                  </button>
                  <button onClick={()=>{ navigator.clipboard.writeText(config.churchCode||"").catch(()=>{}); setCodeCopied(true); setTimeout(()=>setCodeCopied(false), 2000); }} style={{ background:"none", border:"none", color:codeCopied?B.teal:B.textMid, cursor:"pointer", fontSize:12, fontFamily:f1, fontWeight:600 }}>
                    {codeCopied ? "Copied!" : "Copy"}
                  </button>
                  {userProfile?.role === "admin" && (
                    <button onClick={()=>{setEditCodeMode(true);setNewCode(config.churchCode||"");}} style={{ background:"none", border:"none", color:B.teal, cursor:"pointer", fontSize:12, fontFamily:f1, fontWeight:600 }}>Change</button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Managed Lists */}
      <div style={{ display:"grid", gap:16, marginBottom:20 }}>
        {listCard("locations", "Locations", "📍")}
        {listCard("ministries", "Ministries", "⛪")}
        {listCard("tags", "Tags", "🏷️")}
      </div>

      {/* Spaces / Rooms */}
      {(isAdmin || isManager) && (
        <div style={{ background:B.white, borderRadius:14, padding:"22px 24px", border:"1px solid "+B.sand, boxShadow:"0 1px 3px rgba(27,42,74,0.06)", marginBottom:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
            <div>
              <h3 style={{ margin:0, fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>🏛️ Spaces</h3>
              <p style={{ margin:"4px 0 0", fontSize:13, color:B.textLight }}>Define rooms and spaces your team can reserve.</p>
            </div>
            <button onClick={() => setShowSpacesModal(true)} style={{ ...btnP, padding:"6px 14px", fontSize:12 }}>Manage Spaces</button>
          </div>
          {(rooms || []).filter(r => r.active !== false).length > 0 ? (
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:14 }}>
              {(rooms || []).filter(r => r.active !== false).map(r => (
                <span key={r._docId} style={{ fontSize:13, padding:"4px 12px", borderRadius:20, background:B.warmGray, color:B.textDark, fontFamily:f1, fontWeight:500 }}>
                  {r.name}{r.capacity ? ` (cap. ${r.capacity})` : ''}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ margin:"12px 0 0", fontSize:13, color:B.textLight }}>No spaces defined yet.</p>
          )}
        </div>
      )}

      {/* Team Members — admin only */}
      {isAdmin && <div style={{ background:B.white, borderRadius:14, padding:"22px 24px", border:"1px solid "+B.sand, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <h3 style={{ margin:0, fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Team Members</h3>
          <span style={{ fontSize:13, fontWeight:600, color: maxUsers && users.length >= maxUsers ? B.red : B.textLight }}>
            {users.length}{maxUsers ? ` / ${maxUsers}` : ''} member{users.length !== 1 ? 's' : ''}
          </span>
        </div>
        {isAdmin && !canAdd && (
          <div style={{ background:B.goldLight, border:"1px solid "+B.gold, borderRadius:10, padding:"12px 16px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <div>
              <div style={{ fontFamily:f1, fontWeight:700, fontSize:14, color:"#7A5800" }}>Team member limit reached</div>
              <div style={{ fontSize:13, color:"#96750E", marginTop:2 }}>Upgrade to Team Hub to add more members.</div>
            </div>
            <button onClick={() => setShowUpgradeModal(true)} style={{ ...btnP, padding:"7px 16px", fontSize:12, whiteSpace:"nowrap" }}>Upgrade</button>
          </div>
        )}
        {users.length === 0 ? <p style={{ color:B.textLight, fontSize:14 }}>No team members yet.</p> :
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {users.map(u => (
              <div key={u.id} style={{ padding:"12px 14px", borderRadius:10, background:B.warmGray }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
                    <div style={{ width:34, height:34, borderRadius:10, background:B.teal, display:"flex", alignItems:"center", justifyContent:"center", color:B.white, fontWeight:700, fontSize:13, fontFamily:f1, flexShrink:0 }}>{(name => { const p = (name||'?').trim().split(/\s+/); return p.length > 1 ? (p[0][0]+p[p.length-1][0]).toUpperCase() : p[0][0].toUpperCase(); })(u.name)}</div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:14, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                        {u.name}
                        <span style={{ padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:600, fontFamily:f1,
                          background: u.role==="admin"?B.goldLight:u.role==="manager"?B.tealPale:B.warmGray,
                          color: u.role==="admin"?"#96750E":u.role==="manager"?B.teal:B.textMid }}>{u.role}</span>
                        {!u.active && <span style={{ padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:600, background:B.redPale, color:B.red }}>Inactive</span>}
                        {getUserComplianceBadge(u.id) && (
                          <span title="Has compliance records requiring attention" style={{ fontSize:14, lineHeight:1 }}>{getUserComplianceBadge(u.id)}</span>
                        )}
                      </div>
                      <div style={{ fontSize:12, color:B.textLight }}>{u.email}</div>
                    </div>
                  </div>
                </div>
                {isAdmin && u.id !== userProfile.id && (
                  <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap" }}>
                    <button onClick={() => openEditAccess(u)}
                      style={{ ...btnS, flex:isMobile?"1 1 auto":undefined, padding:"6px 14px", fontSize:12 }}>
                      Edit Access
                    </button>
                    {u.active ? (
                      <button onClick={()=>{ if(window.confirm(`Deactivate ${u.name}? They will lose access to the app immediately.`)) updateUser(u.id, {active:false}); }} style={{ ...btnS, flex:isMobile?"1 1 auto":undefined, padding:"6px 14px", fontSize:12, color:B.red, borderColor:"#FECACA" }}>Deactivate</button>
                    ) : (
                      <button onClick={()=>updateUser(u.id, {active:true})} style={{ ...btnS, flex:isMobile?"1 1 auto":undefined, padding:"6px 14px", fontSize:12, color:B.teal, borderColor:B.tealPale }}>Reactivate</button>
                    )}
                    <button onClick={()=>{ if(window.confirm(`Remove ${u.name} from your church? They will no longer have access.`)) removeUser(u.id); }}
                      style={{ ...btnS, flex:isMobile?"1 1 auto":undefined, padding:"6px 14px", fontSize:12, color:B.red, borderColor:"#FECACA" }}>Remove</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        }

        {/* Invite Link Generator — admin only */}
        {isAdmin && (
          <div style={{ marginTop:20, paddingTop:18, borderTop:"1px solid "+B.sand }}>
            <div style={{ fontSize:14, fontWeight:700, fontFamily:f1, color:B.navy, marginBottom:4 }}>Invite Link</div>
            <p style={{ fontSize:13, color:B.textLight, margin:"0 0 12px" }}>Generate a link that pre-fills the church code and hub access for new team members.</p>
            {churchHubs.length > 0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:8 }}>Include hub access</div>
                <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                  {churchHubs.map(hub => (
                    <label key={hub} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", fontSize:13 }}>
                      <input type="checkbox" checked={inviteHubs.includes(hub)}
                        onChange={e => setInviteHubs(prev => e.target.checked ? [...prev, hub] : prev.filter(h => h !== hub))}
                        style={{ width:15, height:15, accentColor:B.teal }}/>
                      {HUB_LABELS[hub] || hub}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <button onClick={handleCopyInviteLink}
              style={{ ...btnS, padding:"8px 16px", fontSize:13, color:inviteLinkCopied?B.teal:undefined, borderColor:inviteLinkCopied?B.tealPale:undefined }}>
              {inviteLinkCopied ? "Link Copied!" : "Copy Invite Link"}
            </button>
            <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid "+B.sand }}>
              <div style={{ fontSize:12, color:B.textLight, marginBottom:8 }}>Share this link so anyone outside your org can submit item requests:</div>
              <button onClick={handleCopyRequestLink}
                style={{ ...btnS, padding:"8px 16px", fontSize:13, color:requestLinkCopied?B.teal:undefined, borderColor:requestLinkCopied?B.tealPale:undefined }}>
                {requestLinkCopied ? "Link Copied!" : "📥 Copy Request Form Link"}
              </button>
            </div>
          </div>
        )}
      </div>}

      {/* Edit Access Modal */}
      <Modal open={!!editAccessUser} onClose={() => setEditAccessUser(null)} title={`Edit Access — ${editAccessUser?.name}`}>
        {editAccessUser && (
          <div>
            {/* Role */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:8 }}>Role</div>
              <div style={{ display:"flex", gap:8 }}>
                {['admin','manager','user'].map(r => (
                  <button key={r} type="button" onClick={() => setEditRole(r)}
                    style={{ padding:"8px 16px", borderRadius:8, border:"1px solid "+(editRole===r?B.teal:B.sand), background:editRole===r?B.tealPale:"transparent", color:editRole===r?B.teal:B.textMid, fontFamily:f1, fontWeight:600, fontSize:13, cursor:"pointer" }}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
              {editRole === 'admin' && <p style={{ fontSize:12, color:B.textLight, margin:"8px 0 0" }}>Admins have full access to all settings and church data.</p>}
              {editRole === 'manager' && <p style={{ fontSize:12, color:B.textLight, margin:"8px 0 0" }}>Managers can edit locations/ministries/tags, approve reservations, add/edit/retire items and supplies in their assigned ministries, create maintenance tickets, manage vendors, run audits, and create bundles.</p>}
            </div>

            {/* Hub Access */}
            {churchHubs.length > 0 && (
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:8 }}>Hub Access</div>
                {editRole === 'admin' ? (
                  <p style={{ fontSize:13, color:B.textLight, margin:0 }}>Admins always have access to all church hubs.</p>
                ) : (
                  <>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {churchHubs.map(hub => (
                        <label key={hub} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", fontSize:14 }}>
                          <input type="checkbox" checked={editHubs.includes(hub)}
                            onChange={e => setEditHubs(prev => e.target.checked ? [...prev, hub] : prev.filter(h => h !== hub))}
                            style={{ width:16, height:16, accentColor:B.teal }}/>
                          {HUB_LABELS[hub] || hub}
                        </label>
                      ))}
                    </div>
                    <p style={{ fontSize:12, color:B.textLight, margin:"8px 0 0" }}>Uncheck hubs to restrict this user's access.</p>
                  </>
                )}
              </div>
            )}

            {/* Managed Ministries — manager role only */}
            {editRole === 'manager' && (settings.ministries || []).length > 0 && (
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:8 }}>Managed Ministries</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:200, overflowY:"auto" }}>
                  {(settings.ministries || []).map(m => (
                    <label key={m} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", fontSize:14 }}>
                      <input type="checkbox" checked={editMinistries.includes(m)}
                        onChange={e => setEditMinistries(prev => e.target.checked ? [...prev, m] : prev.filter(x => x !== m))}
                        style={{ width:16, height:16, accentColor:B.teal }}/>
                      {m}
                    </label>
                  ))}
                </div>
                <p style={{ fontSize:12, color:B.textLight, margin:"8px 0 0" }}>This manager can manage items and approve reservations in these ministries.</p>
              </div>
            )}

            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}>
              <button onClick={() => setEditAccessUser(null)} style={{ ...btnS, padding:"8px 20px" }}>Cancel</button>
              <button onClick={handleSaveAccess} disabled={savingAccess} style={{ ...btnP, padding:"8px 20px", opacity:savingAccess?0.6:1 }}>
                {savingAccess ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Owner Report Panel — suggestions + error log */}
      {isOwner && (
        <div style={{ background:B.white, borderRadius:14, padding:"22px 24px", border:"1px solid "+B.sand, marginTop:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
          {/* Tab bar */}
          <div style={{ display:"flex", gap:8, marginBottom:18 }}>
            {[['suggestions','Suggestions'],['churches','Churches']].map(([key, label]) => (
              <button key={key} onClick={() => setOwnerTab(key)}
                style={{ padding:"6px 18px", borderRadius:20, border:"1px solid "+(ownerTab===key?B.teal:B.sand), background:ownerTab===key?B.tealPale:B.white, color:ownerTab===key?B.teal:B.textMid, fontFamily:f1, fontWeight:600, fontSize:13, cursor:"pointer" }}>
                {label}
              </button>
            ))}
          </div>

          {/* Suggestions tab */}
          {ownerTab === 'suggestions' && (
            <>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <h3 style={{ margin:0, fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Suggestions Report</h3>
                <button onClick={handleLoadSuggestions} disabled={loadingSuggestions} style={{ ...btnP, padding:"6px 14px", fontSize:12 }}>
                  {loadingSuggestions ? "Loading…" : allSuggestions ? "Refresh" : "Load"}
                </button>
              </div>
              {allSuggestions && (
                <>
                  <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
                    {["All","Feature Request","Bug Report","Other"].map(cat => {
                      const count = cat === "All" ? allSuggestions.length : allSuggestions.filter(s => s.category === cat).length;
                      return (
                        <button key={cat} onClick={() => setSuggestionFilter(cat)}
                          style={{ padding:"5px 14px", fontSize:12, fontFamily:f1, fontWeight:600, borderRadius:20, border:"1px solid "+(suggestionFilter===cat?B.teal:B.sand), background:suggestionFilter===cat?B.tealPale:B.white, color:suggestionFilter===cat?B.teal:B.textMid, cursor:"pointer" }}>
                          {cat} ({count})
                        </button>
                      );
                    })}
                  </div>
                  {(() => {
                    const filtered = suggestionFilter === "All" ? allSuggestions : allSuggestions.filter(s => s.category === suggestionFilter);
                    if (filtered.length === 0) return <p style={{ color:B.textLight, fontSize:14 }}>No suggestions in this category.</p>;
                    return (
                      <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:480, overflowY:"auto" }}>
                        {filtered.map(s => (
                          <div key={s.id} style={{ padding:"12px 14px", borderRadius:10, background:B.warmGray }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6, flexWrap:"wrap", gap:6 }}>
                              <span style={{ padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:600, fontFamily:f1,
                                background: s.category==="Bug Report"?B.redPale:s.category==="Feature Request"?B.tealPale:B.goldLight,
                                color: s.category==="Bug Report"?B.red:s.category==="Feature Request"?B.teal:"#96750E" }}>
                                {s.category}
                              </span>
                              <span style={{ fontSize:11, color:B.textLight }}>{s.churchName} · {s.submittedByName} · {s.submittedAt?.split("T")[0]}</span>
                            </div>
                            <p style={{ margin:0, fontSize:14, color:B.textDark, fontFamily:f2 }}>{s.text}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </>
              )}
              {!allSuggestions && <p style={{ color:B.textLight, fontSize:13, margin:0 }}>Click "Load" to see all submitted feedback.</p>}
            </>
          )}

          {/* Churches tab */}
          {ownerTab === 'churches' && (
            <>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div>
                  <h3 style={{ margin:"0 0 2px", fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Registered Churches</h3>
                  {allChurches && <p style={{ margin:0, fontSize:12, color:B.textLight }}>{allChurches.length} total</p>}
                </div>
                <button onClick={handleLoadChurches} disabled={loadingChurches} style={{ ...btnP, padding:"6px 14px", fontSize:12 }}>
                  {loadingChurches ? "Loading…" : allChurches ? "Refresh" : "Load"}
                </button>
              </div>
              {allChurches && (
                allChurches.length === 0
                  ? <p style={{ color:B.textLight, fontSize:14 }}>No churches registered yet.</p>
                  : <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:480, overflowY:"auto" }}>
                      {allChurches.map(c => {
                        const date = c.createdAt?.toDate?.()?.toISOString?.()?.split('T')[0] || c.createdAt?.split?.('T')[0] || '—';
                        return (
                          <div key={c.id} style={{ padding:"12px 14px", borderRadius:10, background:B.warmGray, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
                            <div>
                              <div style={{ fontWeight:600, fontSize:14, color:B.navy, fontFamily:f1 }}>{c.churchName || '—'}</div>
                              <div style={{ fontSize:12, color:B.textLight, marginTop:2 }}>Code: <span style={{ fontFamily:"monospace" }}>{c.churchCode || '—'}</span></div>
                            </div>
                            <div style={{ display:"flex", gap:16, alignItems:"center", flexShrink:0 }}>
                              <span style={{ fontSize:12, color:B.textMid }}><strong>{c.itemCount ?? '—'}</strong> items</span>
                              <span style={{ fontSize:12, color:B.textMid }}><strong>{c.userCount ?? '—'}</strong> users</span>
                              <span style={{ fontSize:12, color:B.textLight }}>{date}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
              )}
              {!allChurches && <p style={{ color:B.textLight, fontSize:13, margin:0 }}>Click "Load" to see all registered churches.</p>}
            </>
          )}
        </div>
      )}

      {/* Suggestions */}
      <div style={{ background:B.white, borderRadius:14, padding:"22px 24px", border:"1px solid "+B.sand, marginTop:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <h3 style={{ margin:"0 0 6px", fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Submit a Suggestion</h3>
        <p style={{ margin:"0 0 14px", fontSize:13, color:B.textLight }}>Have an idea or found a bug? We'd love to hear from you.</p>
        {suggestionSent ? (
          <div style={{ background:B.tealPale, border:"1px solid "+B.teal, borderRadius:10, padding:"14px 18px", color:B.teal, fontWeight:600, fontFamily:f1, fontSize:14 }}>
            Thanks for your feedback! We read every suggestion.
          </div>
        ) : (
          <>
            <div style={{ display:"flex", gap:8, marginBottom:10 }}>
              {["Feature Request","Bug Report","Other"].map(cat => (
                <button key={cat} onClick={() => setSuggestionCategory(cat)}
                  style={{ padding:"5px 14px", fontSize:12, fontFamily:f1, fontWeight:600, borderRadius:20, border:"1px solid "+(suggestionCategory===cat?B.teal:B.sand), background:suggestionCategory===cat?B.tealPale:B.white, color:suggestionCategory===cat?B.teal:B.textMid, cursor:"pointer" }}>
                  {cat}
                </button>
              ))}
            </div>
            <textarea
              value={suggestionText}
              onChange={e => setSuggestionText(e.target.value)}
              placeholder="Describe your idea or issue..."
              rows={4}
              style={{ ...inp, width:"100%", resize:"vertical", fontFamily:f2, fontSize:14, boxSizing:"border-box" }}
            />
            <div style={{ marginTop:10, display:"flex", justifyContent:"flex-end" }}>
              <button onClick={handleSubmitSuggestion} disabled={!suggestionText.trim() || suggestionLoading}
                style={{ ...btnP, opacity:(!suggestionText.trim()||suggestionLoading)?0.5:1 }}>
                {suggestionLoading ? "Sending…" : "Send Suggestion"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Help Center */}
      <div style={{ background:B.white, borderRadius:14, padding:"18px 24px", border:"1px solid "+B.sand, marginTop:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
        <div>
          <h3 style={{ margin:"0 0 2px", fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Help Center</h3>
          <p style={{ margin:0, fontSize:13, color:B.textLight }}>Guides for every feature, hub docs, and FAQ.</p>
        </div>
        <a href="?help" style={{ display:"inline-block", padding:"8px 18px", borderRadius:10, border:"1px solid "+B.sand, background:B.white, color:B.teal, fontSize:13, fontWeight:600, fontFamily:f1, textDecoration:"none", flexShrink:0 }}>
          Open Help Center →
        </a>
      </div>

      {/* Danger Zone */}
      <div style={{ background:B.white, borderRadius:14, padding:"22px 24px", border:"1px solid #FECDCA", marginTop:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <h3 style={{ margin:"0 0 4px", fontFamily:f1, fontSize:16, fontWeight:700, color:B.red }}>Danger Zone</h3>
        <p style={{ margin:"0 0 16px", fontSize:13, color:B.textLight }}>Permanent actions that cannot be undone.</p>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
          <div>
            <p style={{ margin:"0 0 2px", fontWeight:600, fontFamily:f1, fontSize:14, color:B.textDark }}>Delete My Account</p>
            <p style={{ margin:0, fontSize:13, color:B.textLight }}>
              {isAdmin
                ? "Removes your account and profile. Your church's inventory data will remain but become unmanaged. Contact us to arrange a full data deletion."
                : "Permanently removes your account and profile from ChurchOpsHub."}
            </p>
          </div>
          <button onClick={() => { setShowDeleteModal(true); setDeleteError(""); setDeletePassword(""); setDeleteConfirmText(""); }}
            style={{ ...btnS, borderColor:B.red, color:B.red, flexShrink:0, whiteSpace:"nowrap" }}>
            Delete Account
          </button>
        </div>
      </div>

      {/* Upgrade Modal */}
      <Modal open={showUpgradeModal} onClose={() => { setShowUpgradeModal(false); setBillingError(""); }} title="Upgrade ChurchOpsHub">
        {billingLoading ? (
          <div style={{ textAlign:"center", padding:"32px 0" }}><Spinner /></div>
        ) : (
          <>
            {billingError && <p style={{ color:B.red, fontSize:13, marginBottom:12 }}>{billingError}</p>}

            {/* All-In Bundle */}
            <div style={{ background:B.navy, borderRadius:14, padding:"20px 22px", marginBottom:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                <div style={{ fontFamily:f1, fontWeight:700, fontSize:15, color:"#fff" }}>All-In Bundle</div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ background:B.gold, color:B.navy, fontFamily:f1, fontWeight:800, fontSize:10, padding:"3px 10px", borderRadius:100, letterSpacing:1 }}>BEST VALUE</span>
                  <span style={{ fontFamily:f1, fontWeight:700, fontSize:15, color:B.tealLight }}>$29/mo</span>
                </div>
              </div>
              <p style={{ color:"rgba(255,255,255,0.65)", fontSize:13, margin:"0 0 14px", lineHeight:1.5 }}>
                All 7 hubs + unlimited team members. Save even more vs. buying individually.
              </p>
              <button onClick={() => handleCheckout('all_in')} style={{ ...btnP, width:"100%", background:B.teal, fontSize:13 }}>
                Subscribe — $29/mo
              </button>
            </div>

            {/* Individual hubs */}
            <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:10 }}>Individual Hubs</div>
            {[
              { key:'maintenance',    label:'Maintenance Hub',    price:'$7/mo',  desc:'Repair tickets, vendor directory, photo docs.' },
              { key:'insights',       label:'Insights Hub',       price:'$7/mo',  desc:'Utilization charts, ministry & financial analytics.' },
              { key:'coordination',   label:'Coordination Hub',   price:'$7/mo',  desc:'Checkout bundles & email notifications.' },
              { key:'accountability', label:'Accountability Hub', price:'$5/mo',  desc:'Physical audits, chain of custody, insurance export.' },
              { key:'tasks',          label:'Tasks Hub',          price:'$7/mo',  desc:'Kanban task board for general church admin tasks.' },
              { key:'jobs',           label:'Job Hub',            price:'$7/mo',  desc:'Teen job board with signups and announcements.' },
              { key:'people_access',  label:'People Access Hub',  price:'$7/mo',  desc:'Background checks, key assignments, certifications.' },
            ].filter(h => !(subscription?.hubs || []).includes(h.key) && subscription?.plan !== 'all_in' && !subscription?.grandfathered)
             .map(h => (
              <div key={h.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", borderRadius:10, border:"1px solid "+B.sand, marginBottom:8, gap:12, flexWrap:"wrap" }}>
                <div>
                  <div style={{ fontFamily:f1, fontWeight:700, fontSize:14, color:B.navy }}>{h.label} <span style={{ color:B.teal, fontWeight:700 }}>{h.price}</span></div>
                  <div style={{ fontSize:12, color:B.textMid, marginTop:2 }}>{h.desc}</div>
                </div>
                <button onClick={() => handleCheckout(h.key)} style={{ ...btnP, padding:"7px 16px", fontSize:12, whiteSpace:"nowrap" }}>Subscribe</button>
              </div>
            ))}

            {/* Team plans */}
            {subscription?.plan !== 'team_unlimited' && subscription?.plan !== 'all_in' && !subscription?.grandfathered && (
              <>
                <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, margin:"14px 0 10px" }}>Team Plans</div>
                {subscription?.plan !== 'team_25' && (
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", borderRadius:10, border:"1px solid "+B.sand, marginBottom:8, gap:12, flexWrap:"wrap" }}>
                    <div>
                      <div style={{ fontFamily:f1, fontWeight:700, fontSize:14, color:B.navy }}>Team Hub (25 users) <span style={{ color:B.teal, fontWeight:700 }}>$9/mo</span></div>
                      <div style={{ fontSize:12, color:B.textMid, marginTop:2 }}>Expand beyond 10 members with role-based hub access.</div>
                    </div>
                    <button onClick={() => handleCheckout('team_25')} style={{ ...btnP, padding:"7px 16px", fontSize:12, whiteSpace:"nowrap" }}>Subscribe</button>
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", borderRadius:10, border:"1px solid "+B.sand, marginBottom:8, gap:12, flexWrap:"wrap" }}>
                  <div>
                    <div style={{ fontFamily:f1, fontWeight:700, fontSize:14, color:B.navy }}>Team Hub (unlimited) <span style={{ color:B.teal, fontWeight:700 }}>$19/mo</span></div>
                    <div style={{ fontSize:12, color:B.textMid, marginTop:2 }}>Unlimited team members, full role-based access control.</div>
                  </div>
                  <button onClick={() => handleCheckout('team_unlimited')} style={{ ...btnP, padding:"7px 16px", fontSize:12, whiteSpace:"nowrap" }}>Subscribe</button>
                </div>
              </>
            )}
          </>
        )}
      </Modal>

      {/* Delete Account Modal */}
      <Modal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Your Account">
        {isAdmin && (
          <div style={{ background:B.redPale, border:"1px solid #FECDCA", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
            <p style={{ margin:"0 0 6px", fontWeight:700, fontFamily:f1, fontSize:13, color:B.red }}>Admin Account Warning</p>
            <p style={{ margin:0, fontSize:13, color:B.red, lineHeight:1.5 }}>
              You are the admin for this church. Deleting your account will remove your profile and login access, but your church's inventory, team members, and data will remain in the system unmanaged. If you want all church data permanently deleted, email us at <a href="mailto:churchopshub@gmail.com" style={{ color:B.red }}>churchopshub@gmail.com</a> after deleting your account.
            </p>
          </div>
        )}
        <p style={{ margin:"0 0 16px", fontSize:14, color:B.textDark, lineHeight:1.5 }}>
          This will permanently delete your account and remove your profile. This action <strong>cannot be undone</strong>.
        </p>
        {!isGoogle && (
          <FF label="Confirm your password">
            <input type="password" style={inp} value={deletePassword} onChange={e => setDeletePassword(e.target.value)} placeholder="Enter your password" />
          </FF>
        )}
        <FF label={`Type DELETE to confirm`}>
          <input style={inp} value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="DELETE" />
        </FF>
        {deleteError && <p style={{ color:B.red, fontSize:13, fontWeight:600, margin:"0 0 12px" }}>{deleteError}</p>}
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={() => setShowDeleteModal(false)} style={btnS}>Cancel</button>
          <button
            onClick={handleDeleteAccount}
            disabled={deleting || deleteConfirmText !== "DELETE" || (!isGoogle && !deletePassword)}
            style={{ ...btnS, borderColor:B.red, color:B.red, opacity:(deleting || deleteConfirmText !== "DELETE" || (!isGoogle && !deletePassword)) ? 0.5 : 1 }}>
            {deleting ? "Deleting…" : "Delete My Account"}
          </button>
        </div>
      </Modal>

      {/* ═══ SPACES MODAL ═══ */}
      <Modal open={showSpacesModal} onClose={() => { setShowSpacesModal(false); setEditRoomId(null); setRoomForm({ name:'', capacity:'', location:'', description:'', amenities:'' }); }} title="Manage Spaces" wide>
        {/* Add / Edit form */}
        <div style={{ background:B.warmGray, borderRadius:12, padding:"16px 18px", marginBottom:20 }}>
          <div style={{ fontFamily:f1, fontWeight:700, fontSize:14, color:B.navy, marginBottom:12 }}>{editRoomId ? 'Edit Space' : 'Add New Space'}</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <FF label="Name *">
              <input style={inp} value={roomForm.name} onChange={e => setRoomForm(f => ({ ...f, name:e.target.value }))} placeholder="e.g. Sanctuary"/>
            </FF>
            <FF label="Capacity">
              <input style={inp} type="number" min="0" value={roomForm.capacity} onChange={e => setRoomForm(f => ({ ...f, capacity:e.target.value }))} placeholder="Max occupancy"/>
            </FF>
          </div>
          <FF label="Location">
            <input style={inp} value={roomForm.location} onChange={e => setRoomForm(f => ({ ...f, location:e.target.value }))} placeholder="e.g. Main Building, Annex"/>
          </FF>
          <FF label="Description">
            <input style={inp} value={roomForm.description} onChange={e => setRoomForm(f => ({ ...f, description:e.target.value }))} placeholder="Brief description of the space"/>
          </FF>
          <FF label="Amenities (comma-separated)">
            <input style={inp} value={roomForm.amenities} onChange={e => setRoomForm(f => ({ ...f, amenities:e.target.value }))} placeholder="e.g. Projector, Sound System, Whiteboard"/>
          </FF>
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:4 }}>
            {editRoomId && <button onClick={() => { setEditRoomId(null); setRoomForm({ name:'', capacity:'', location:'', description:'', amenities:'' }); }} style={btnS}>Cancel Edit</button>}
            <button
              disabled={savingRoom || !roomForm.name.trim()}
              style={{ ...btnP, opacity:(!roomForm.name.trim() || savingRoom) ? .5 : 1 }}
              onClick={async () => {
                if (!roomForm.name.trim()) return;
                setSavingRoom(true);
                const payload = {
                  name: roomForm.name.trim(),
                  capacity: roomForm.capacity ? parseInt(roomForm.capacity, 10) : null,
                  location: roomForm.location.trim() || null,
                  description: roomForm.description.trim() || null,
                  amenities: roomForm.amenities ? roomForm.amenities.split(',').map(a => a.trim()).filter(Boolean) : [],
                };
                if (editRoomId) {
                  await updateRoom(editRoomId, payload);
                } else {
                  await addRoom(payload);
                }
                setSavingRoom(false);
                setEditRoomId(null);
                setRoomForm({ name:'', capacity:'', location:'', description:'', amenities:'' });
              }}>
              {savingRoom ? 'Saving...' : editRoomId ? 'Save Changes' : 'Add Space'}
            </button>
          </div>
        </div>
        {/* Existing rooms list */}
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(rooms || []).length === 0 && <p style={{ color:B.textLight, fontSize:14, textAlign:"center", padding:16 }}>No spaces yet. Add one above.</p>}
          {(rooms || []).map(r => (
            <div key={r._docId} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", borderRadius:10, background:r.active === false ? B.warmGray : B.white, border:"1px solid "+B.sand, opacity:r.active === false ? .6 : 1 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:14, color:B.navy, fontFamily:f1 }}>{r.name}{r.active === false ? ' (archived)' : ''}</div>
                <div style={{ fontSize:12, color:B.textLight, marginTop:2 }}>
                  {[r.capacity ? `Cap. ${r.capacity}` : null, r.location, (r.amenities||[]).join(', ')].filter(Boolean).join(' · ') || 'No details'}
                </div>
              </div>
              <button onClick={() => { setEditRoomId(r._docId); setRoomForm({ name:r.name, capacity:r.capacity ?? '', location:r.location||'', description:r.description||'', amenities:(r.amenities||[]).join(', ') }); }}
                style={{ background:"none", border:"none", color:B.teal, cursor:"pointer", fontSize:13, fontWeight:600, padding:"4px 8px" }}>Edit</button>
              {r.active === false
                ? <button onClick={() => updateRoom(r._docId, { active:true })} style={{ background:"none", border:"none", color:B.teal, cursor:"pointer", fontSize:13, fontWeight:600, padding:"4px 8px" }}>Restore</button>
                : <button onClick={() => { if (window.confirm(`Archive "${r.name}"? It will no longer appear as a reservable space.`)) updateRoom(r._docId, { active:false }); }} style={{ background:"none", border:"none", color:B.red, cursor:"pointer", fontSize:13, fontWeight:600, padding:"4px 8px" }}>Archive</button>
              }
            </div>
          ))}
        </div>
      </Modal>

      {/* List Editor Modal */}
      <Modal open={!!editList} onClose={()=>{ setEditList(null); setEditingItem(null); }} title={"Manage " + (editList?.title || "")}>
        {editList && <>
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            <input style={{...inp, flex:1}} value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder={`Add new ${editList.title.toLowerCase().slice(0,-1)}...`} onKeyDown={e=>e.key==="Enter"&&addToList()}/>
            <button onClick={addToList} disabled={!newItem.trim()} style={{ ...btnP, opacity:newItem.trim()?1:.5 }}>Add</button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:400, overflowY:"auto" }}>
            {editList.items.map(item => (
              <div key={item} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px 6px 14px", borderRadius:8, background:B.warmGray }}>
                {editingItem === item ? (
                  <>
                    <input autoFocus style={{...inp, flex:1, padding:"5px 10px", fontSize:14}} value={editingValue} onChange={e=>setEditingValue(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") saveEditingItem(); if(e.key==="Escape") setEditingItem(null); }}/>
                    <button onClick={saveEditingItem} style={{ ...btnP, padding:"5px 12px", fontSize:12 }}>Save</button>
                    <button onClick={()=>setEditingItem(null)} style={{ ...btnS, padding:"5px 12px", fontSize:12 }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex:1, fontSize:14 }}>{item}</span>
                    <button onClick={()=>{ setEditingItem(item); setEditingValue(item); }} style={{ background:"none", border:"none", color:B.teal, cursor:"pointer", fontSize:13, padding:"2px 6px", fontWeight:600 }}>Edit</button>
                    <button onClick={()=>removeFromList(item)} style={{ background:"none", border:"none", color:B.red, cursor:"pointer", fontSize:16, padding:"2px 6px" }}>&times;</button>
                  </>
                )}
              </div>
            ))}
          </div>
          {editList.items.length === 0 && <p style={{ color:B.textLight, fontSize:14, textAlign:"center", padding:20 }}>No items yet. Add some above.</p>}
        </>}
      </Modal>
    </div>
  );
}
