import { useState, useContext } from 'react';
import { B, f1, f2, inp, btnP, btnS, btnD } from '../../components/brand/tokens.js';
import { Modal } from '../../components/primitives/Modal.jsx';
import { FF } from '../../components/primitives/FF.jsx';
import { MobileCtx } from '../../hooks/useMobile.js';
import { exportAccessRecordsCSV } from '../../utils/csv.js';
import { localDateStr } from '../../utils/date.js';

const TYPE_LABELS = {
  background_check: 'Background Check',
  key_assignment: 'Key / Fob',
  certification: 'Certification',
  custom: 'Custom',
};
const TYPE_ICONS = {
  background_check: '🔍',
  key_assignment: '🔑',
  certification: '🎓',
  custom: '✅',
};
const BUILT_IN_TYPES = [
  { key: 'background_check', label: 'Background Check', icon: '🔍', desc: 'Tracks completion date (and optional expiry) of a background screening.' },
  { key: 'key_assignment', label: 'Key / Fob Assignment', icon: '🔑', desc: 'Records which keys or access cards a person has been issued, and if/when returned.' },
  { key: 'certification', label: 'Certification', icon: '🎓', desc: 'Tracks certifications such as CPR/First Aid, SafeGuarding, etc. with optional expiry.' },
];

export function PeopleAccessPage({ store, userProfile }) {
  const {
    accessPeople, accessRecords, settings, users,
    addAccessPerson, updateAccessPerson, archiveAccessPerson,
    linkAccessPerson, unlinkAccessPerson,
    addAccessRecord, updateAccessRecord, deleteAccessRecord,
    addPeopleAccessRequirement, removePeopleAccessRequirement,
  } = store;
  const isMobile = useContext(MobileCtx);

  // ── All useState FIRST ──
  const [view, setView] = useState('people');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [detailPersonId, setDetailPersonId] = useState(null);
  const [recordTab, setRecordTab] = useState('all');
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [editPerson, setEditPerson] = useState(null);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [personForm, setPersonForm] = useState({ name: '', email: '', phone: '', ministries: [], notes: '' });
  const [recordForm, setRecordForm] = useState({
    type: 'background_check', completedDate: '', expiryDate: '', ministry: '', notes: '',
    keyIdentifier: '', returnedDate: '',
    certType: '', issuingOrganization: '',
    requirementId: '',
  });
  const [newReqName, setNewReqName] = useState('');
  const [newReqHasExpiry, setNewReqHasExpiry] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(null);
  const [confirmDeleteRecord, setConfirmDeleteRecord] = useState(null);
  const [showBulkEntry, setShowBulkEntry] = useState(false);
  const [bulkType, setBulkType] = useState('background_check');
  const [bulkExpiryMode, setBulkExpiryMode] = useState('interval');
  const [bulkExpiryInterval, setBulkExpiryInterval] = useState(3);
  const [bulkCertType, setBulkCertType] = useState('');
  const [bulkRequirementId, setBulkRequirementId] = useState('');
  const [bulkRows, setBulkRows] = useState(() => Array.from({ length: 5 }, () => ({ personName: '', completedDate: '', expiryDate: '', keyIdentifier: '' })));
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [showLinkUser, setShowLinkUser] = useState(false);
  const [linkUserId, setLinkUserId] = useState('');

  // ── Derived values (after all useState) ──
  const isAdmin = userProfile?.role === 'admin';
  const isManager = userProfile?.role === 'manager';
  const canEdit = isAdmin || isManager;
  const ministries = settings?.ministries || [];
  const customRequirements = settings?.peopleAccessRequirements || [];

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);

  function getExpiryStatus(expiryDate) {
    if (!expiryDate) return null;
    // Parse YYYY-MM-DD as local date (not UTC) to avoid timezone-shift false positives
    const [y, m, day] = expiryDate.split('-').map(Number);
    const d = new Date(y, m - 1, day);
    if (d < today) return 'expired';
    if (d <= in7) return 'critical';
    if (d <= in30) return 'warning';
    return 'ok';
  }

  function expiryColor(status) {
    if (status === 'expired' || status === 'critical') return B.red;
    if (status === 'warning') return B.gold;
    return B.teal;
  }

  const allRecords = accessRecords || [];
  const allPeople = accessPeople || [];

  const expiringRecords = allRecords
    .filter(r => { const s = getExpiryStatus(r.expiryDate); return s === 'expired' || s === 'critical' || s === 'warning'; })
    .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''));
  const criticalRecords = expiringRecords.filter(r => { const s = getExpiryStatus(r.expiryDate); return s === 'expired' || s === 'critical'; });
  const warningRecords = expiringRecords.filter(r => getExpiryStatus(r.expiryDate) === 'warning');

  const visiblePeople = allPeople.filter(p => showArchived ? !p.active : p.active);
  const filteredPeople = visiblePeople.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return p.name?.toLowerCase().includes(s) ||
      p.email?.toLowerCase().includes(s) ||
      (p.ministries || []).some(m => m.toLowerCase().includes(s));
  });

  // Live detail person (kept fresh from store)
  const detailPerson = detailPersonId ? allPeople.find(p => p._docId === detailPersonId) || null : null;

  function getPersonExpiryStatus(personId) {
    const recs = allRecords.filter(r => r.personId === personId);
    const statuses = recs.map(r => getExpiryStatus(r.expiryDate));
    if (statuses.some(s => s === 'expired' || s === 'critical')) return 'critical';
    if (statuses.some(s => s === 'warning')) return 'warning';
    return null;
  }

  // ── Handlers ──
  function openAddPerson() {
    setPersonForm({ name: '', email: '', phone: '', ministries: [], notes: '' });
    setEditPerson(null);
    setShowAddPerson(true);
  }

  function openEditPerson(person, e) {
    e?.stopPropagation();
    setPersonForm({
      name: person.name || '', email: person.email || '', phone: person.phone || '',
      ministries: person.ministries || [], notes: person.notes || '',
    });
    setEditPerson(person);
    setShowAddPerson(true);
  }

  async function handleSavePerson() {
    if (!personForm.name.trim()) return;
    setBusy(true);
    if (editPerson) {
      await updateAccessPerson(editPerson._docId, personForm);
    } else {
      await addAccessPerson(personForm, userProfile.uid);
    }
    setBusy(false);
    setShowAddPerson(false);
  }

  function openAddRecord(defaultType) {
    setRecordForm({
      type: defaultType || 'background_check', completedDate: '', expiryDate: '', ministry: '', notes: '',
      keyIdentifier: '', returnedDate: '', certType: '', issuingOrganization: '', requirementId: '',
    });
    setEditRecord(null);
    setShowAddRecord(true);
  }

  function openEditRecord(record, e) {
    e?.stopPropagation();
    setRecordForm({
      type: record.type || 'background_check',
      completedDate: record.completedDate || '',
      expiryDate: record.expiryDate || '',
      ministry: record.ministry || '',
      notes: record.notes || '',
      keyIdentifier: record.keyIdentifier || '',
      returnedDate: record.returnedDate || '',
      certType: record.certType || '',
      issuingOrganization: record.issuingOrganization || '',
      requirementId: record.requirementId || '',
    });
    setEditRecord(record);
    setShowAddRecord(true);
  }

  async function handleSaveRecord() {
    if (!recordForm.completedDate || !detailPerson) return;
    if (recordForm.type === 'certification' && !isAdmin) return;
    setBusy(true);
    const base = {
      personId: detailPerson._docId,
      personName: detailPerson.name,
      type: recordForm.type,
      completedDate: recordForm.completedDate,
      expiryDate: recordForm.expiryDate || null,
      notes: recordForm.notes || null,
      ministry: recordForm.ministry || null,
      recordedBy: userProfile.uid,
      recordedByName: userProfile.name,
    };
    const extra = {};
    if (recordForm.type === 'key_assignment') {
      extra.keyIdentifier = recordForm.keyIdentifier || null;
      extra.returnedDate = recordForm.returnedDate || null;
    } else if (recordForm.type === 'certification') {
      extra.certType = recordForm.certType || '';
      extra.issuingOrganization = recordForm.issuingOrganization || null;
    } else if (recordForm.type === 'custom') {
      const req = customRequirements.find(r => r.id === recordForm.requirementId);
      extra.requirementId = recordForm.requirementId || '';
      extra.requirementName = req?.name || '';
    }
    if (editRecord) {
      await updateAccessRecord(editRecord._docId, { ...base, ...extra });
    } else {
      await addAccessRecord({ ...base, ...extra });
    }
    setBusy(false);
    setShowAddRecord(false);
  }

  async function handleMarkReturned(record) {
    await updateAccessRecord(record._docId, { returnedDate: localDateStr(new Date()) });
  }

  async function handleDeleteRecord() {
    if (!confirmDeleteRecord) return;
    await deleteAccessRecord(confirmDeleteRecord._docId);
    setConfirmDeleteRecord(null);
  }

  async function handleArchivePerson() {
    if (!confirmArchive) return;
    await archiveAccessPerson(confirmArchive._docId);
    setConfirmArchive(null);
    setDetailPersonId(null);
  }

  async function handleAddRequirement() {
    if (!newReqName.trim()) return;
    const req = { id: Date.now().toString(), name: newReqName.trim(), hasExpiry: newReqHasExpiry };
    await addPeopleAccessRequirement(req);
    setNewReqName('');
    setNewReqHasExpiry(false);
  }

  function toggleMinistry(m) {
    setPersonForm(f => ({
      ...f,
      ministries: f.ministries.includes(m) ? f.ministries.filter(x => x !== m) : [...f.ministries, m],
    }));
  }

  // ── Bulk entry helpers ──
  const blankBulkRow = () => ({ personName: '', completedDate: '', expiryDate: '', keyIdentifier: '' });

  function openBulkEntry() {
    setBulkType('background_check');
    setBulkExpiryMode('interval');
    setBulkExpiryInterval(3);
    setBulkCertType('');
    setBulkRequirementId(customRequirements[0]?.id || '');
    setBulkRows(Array.from({ length: 5 }, blankBulkRow));
    setBulkResult(null);
    setShowBulkEntry(true);
  }

  function changeBulkType(type) {
    setBulkType(type);
    if (type === 'key_assignment') {
      setBulkExpiryMode('none');
    } else if (type === 'background_check') {
      setBulkExpiryMode('interval'); setBulkExpiryInterval(3);
    } else if (type === 'certification') {
      setBulkExpiryMode('interval'); setBulkExpiryInterval(2);
    } else {
      setBulkExpiryMode('interval'); setBulkExpiryInterval(1);
    }
  }

  function updateBulkRow(idx, field, value) {
    setBulkRows(rows => rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  function deleteBulkRow(idx) {
    setBulkRows(rows => rows.filter((_, i) => i !== idx));
  }

  function computeBulkExpiry(completedDate, interval) {
    if (!completedDate || !interval) return null;
    const [y, m, d] = completedDate.split('-').map(Number);
    return `${y + interval}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  async function handleBulkSave() {
    if (bulkType === 'certification' && !isAdmin) return;
    const filled = bulkRows.filter(r => r.personName.trim() && r.completedDate);
    if (!filled.length) return;
    setBulkSaving(true);
    let saved = 0;
    const skipped = [];
    for (const row of filled) {
      const name = row.personName.trim().toLowerCase();
      const person = allPeople.find(p => p.active && p.name?.toLowerCase() === name);
      if (!person) { skipped.push(row.personName.trim()); continue; }
      let expiryDate = null;
      if (bulkExpiryMode === 'per_row') expiryDate = row.expiryDate || null;
      else if (bulkExpiryMode === 'interval') expiryDate = computeBulkExpiry(row.completedDate, bulkExpiryInterval);
      const record = {
        personId: person._docId, personName: person.name,
        type: bulkType, completedDate: row.completedDate,
        expiryDate, notes: null, ministry: null,
        recordedBy: userProfile.uid, recordedByName: userProfile.name,
      };
      if (bulkType === 'key_assignment') {
        record.keyIdentifier = row.keyIdentifier || null;
        record.returnedDate = null;
      } else if (bulkType === 'certification') {
        record.certType = bulkCertType || '';
        record.issuingOrganization = null;
      } else if (bulkType === 'custom') {
        const req = customRequirements.find(r => r.id === bulkRequirementId);
        record.requirementId = bulkRequirementId || '';
        record.requirementName = req?.name || '';
      }
      await addAccessRecord(record);
      saved++;
    }
    setBulkSaving(false);
    setBulkResult({ saved, skipped });
    if (skipped.length === 0) setBulkRows(Array.from({ length: 5 }, blankBulkRow));
  }

  // Detail records filtered by tab
  const detailRecords = detailPerson
    ? allRecords.filter(r => r.personId === detailPerson._docId &&
        (recordTab === 'all' || r.type === recordTab))
      .sort((a, b) => (b.completedDate || '').localeCompare(a.completedDate || ''))
    : [];

  // ── UI helpers ──
  const pill = (txt, bg, color) => (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, fontFamily: f1, background: bg, color, lineHeight: 1.8 }}>{txt}</span>
  );

  const sectionLabel = (txt) => (
    <div style={{ fontSize: 11, fontWeight: 700, fontFamily: f1, color: B.textLight, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{txt}</div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Expiry Alert Banner ── */}
      {expiringRecords.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {criticalRecords.length > 0 && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: f1, color: B.red, marginBottom: 6 }}>
                🔴 {criticalRecords.length} record{criticalRecords.length > 1 ? 's' : ''} expired or expiring within 7 days
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {criticalRecords.slice(0, 5).map(r => (
                  <button key={r._docId} onClick={() => { setDetailPersonId(r.personId); setRecordTab('all'); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: B.textMid, padding: '2px 0', fontFamily: f2 }}>
                    <strong>{r.personName}</strong> — {TYPE_LABELS[r.type] || r.type}
                    {r.keyIdentifier ? ` (${r.keyIdentifier})` : r.certType ? ` (${r.certType})` : ''}
                    {' '}expires <strong style={{ color: B.red }}>{r.expiryDate}</strong>
                  </button>
                ))}
                {criticalRecords.length > 5 && <span style={{ fontSize: 11, color: B.textLight, fontFamily: f1 }}>…and {criticalRecords.length - 5} more</span>}
              </div>
            </div>
          )}
          {warningRecords.length > 0 && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: f1, color: '#92400E', marginBottom: 6 }}>
                🟡 {warningRecords.length} record{warningRecords.length > 1 ? 's' : ''} expiring within 30 days
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {warningRecords.slice(0, 3).map(r => (
                  <button key={r._docId} onClick={() => { setDetailPersonId(r.personId); setRecordTab('all'); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: B.textMid, padding: '2px 0', fontFamily: f2 }}>
                    <strong>{r.personName}</strong> — {TYPE_LABELS[r.type] || r.type}
                    {r.certType ? ` (${r.certType})` : ''}
                    {' '}expires <strong style={{ color: '#92400E' }}>{r.expiryDate}</strong>
                  </button>
                ))}
                {warningRecords.length > 3 && <span style={{ fontSize: 11, color: B.textLight, fontFamily: f1 }}>…and {warningRecords.length - 3} more</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: isMobile ? 'column' : 'row', gap: 12, marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontFamily: f1, color: B.navy }}>People Access</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: B.textLight, fontFamily: f2 }}>
            Track compliance milestones — background checks, key assignments, certifications, and custom requirements.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          {allRecords.length > 0 && (
            <button onClick={() => exportAccessRecordsCSV(allRecords)} style={{ ...btnS, padding: '8px 14px', fontSize: 13 }}>
              ⬇ Export CSV
            </button>
          )}
          {canEdit && view === 'people' && (
            <button onClick={openBulkEntry} style={{ ...btnS, padding: '8px 14px', fontSize: 13 }}>
              ≡ Bulk Entry
            </button>
          )}
          {canEdit && view === 'people' && (
            <button onClick={openAddPerson} style={{ ...btnP, padding: '8px 16px', fontSize: 13 }}>
              + Add Person
            </button>
          )}
        </div>
      </div>

      {/* ── View Toggle ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: B.sand, borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[['people', '👥 People'], ['requirements', '📋 Requirements']].map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} style={{
            padding: '7px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, fontFamily: f1,
            background: view === k ? B.white : 'transparent',
            color: view === k ? B.navy : B.textLight,
            boxShadow: view === k ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
          }}>{label}</button>
        ))}
      </div>

      {/* ═══════════════════════════════════════ PEOPLE VIEW ═══════════════ */}
      {view === 'people' && (
        <div>
          {/* Search + archive toggle */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              placeholder="Search by name, email, or ministry…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...inp, flex: 1, minWidth: 200, padding: '9px 14px', fontSize: 13 }}
            />
            <button onClick={() => setShowArchived(a => !a)} style={{ ...btnS, padding: '9px 14px', fontSize: 13, color: showArchived ? B.teal : B.textMid, borderColor: showArchived ? B.teal : B.sand }}>
              {showArchived ? '← Active People' : '📁 Archived'}
            </button>
          </div>

          {/* Person cards */}
          {filteredPeople.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: B.textLight, fontFamily: f2 }}>
              {search ? 'No people match your search.' : showArchived ? 'No archived people.' : 'No people added yet. Add your first person to get started.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {filteredPeople.map(person => {
                const pStatus = getPersonExpiryStatus(person._docId);
                const pRecords = allRecords.filter(r => r.personId === person._docId);
                const activeKeys = pRecords.filter(r => r.type === 'key_assignment' && !r.returnedDate);
                return (
                  <div key={person._docId}
                    onClick={() => { setDetailPersonId(person._docId); setRecordTab('all'); }}
                    style={{
                      background: B.white, borderRadius: 14, padding: 18, cursor: 'pointer',
                      border: pStatus === 'critical' ? `2px solid ${B.red}` : pStatus === 'warning' ? `2px solid ${B.gold}` : `1px solid ${B.sand}`,
                      transition: 'box-shadow 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(27,42,74,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 16, fontFamily: f1, color: B.navy, marginBottom: 4 }}>{person.name}</div>
                        {(person.ministries || []).length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                            {(person.ministries || []).map(m => pill(m, B.tealPale, B.teal))}
                          </div>
                        )}
                        {person.email && <div style={{ fontSize: 12, color: B.textLight, fontFamily: f2 }}>✉ {person.email}</div>}
                        {person.phone && <div style={{ fontSize: 12, color: B.textLight, fontFamily: f2 }}>📞 {person.phone}</div>}
                      </div>
                      {pStatus && (
                        <span style={{ fontSize: 18, flexShrink: 0 }}>{pStatus === 'critical' ? '🔴' : '🟡'}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: B.textLight, fontFamily: f1 }}>{pRecords.length} record{pRecords.length !== 1 ? 's' : ''}</span>
                      {activeKeys.length > 0 && <span style={{ fontSize: 11, color: B.textMid, fontFamily: f1 }}>🔑 {activeKeys.length} key{activeKeys.length > 1 ? 's' : ''} out</span>}
                      {person.userId && <span style={{ fontSize: 11, color: B.teal, fontFamily: f1 }}>🔗 Linked</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════ REQUIREMENTS VIEW ══════════════ */}
      {view === 'requirements' && (
        <div style={{ maxWidth: 640 }}>
          {/* Built-in types */}
          <div style={{ marginBottom: 28 }}>
            {sectionLabel('Built-in Record Types')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {BUILT_IN_TYPES.map(t => (
                <div key={t.key} style={{ background: B.white, borderRadius: 12, padding: '14px 16px', border: `1px solid ${B.sand}`, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{t.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, fontFamily: f1, color: B.navy }}>{t.label}</div>
                    <div style={{ fontSize: 13, color: B.textMid, fontFamily: f2, marginTop: 2 }}>{t.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Custom requirements */}
          <div>
            {sectionLabel('Custom Requirements')}
            {customRequirements.length === 0 && (
              <div style={{ fontSize: 13, color: B.textLight, fontFamily: f2, marginBottom: 16 }}>No custom requirements yet.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {customRequirements.map(req => (
                <div key={req.id} style={{ background: B.white, borderRadius: 10, padding: '12px 16px', border: `1px solid ${B.sand}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14, fontFamily: f1, color: B.navy }}>✅ {req.name}</span>
                    {req.hasExpiry && <span style={{ marginLeft: 8, fontSize: 11, color: B.textLight, fontFamily: f1 }}>has expiry date</span>}
                  </div>
                  {canEdit && (
                    <button onClick={() => removePeopleAccessRequirement(req.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: B.red, fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
                  )}
                </div>
              ))}
            </div>
            {canEdit && (
              <div style={{ background: B.warmGray, borderRadius: 12, padding: 16, border: `1px solid ${B.sand}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: f1, color: B.textMid, marginBottom: 10 }}>Add Custom Requirement</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <input placeholder="Requirement name…" value={newReqName} onChange={e => setNewReqName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddRequirement()}
                    style={{ ...inp, flex: 1, minWidth: 160, padding: '9px 12px', fontSize: 13 }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontFamily: f1, color: B.textMid, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={newReqHasExpiry} onChange={e => setNewReqHasExpiry(e.target.checked)}
                      style={{ accentColor: B.teal }} />
                    Has expiry
                  </label>
                  <button onClick={handleAddRequirement} style={{ ...btnP, padding: '9px 16px', fontSize: 13 }}>Add</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════ PERSON DETAIL MODAL ══════════════════ */}
      {detailPerson && (
        <Modal open onClose={() => setDetailPersonId(null)}>
          <div style={{ maxWidth: 680, width: '100%' }}>
            {/* Person header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: '0 0 8px', fontSize: 22, fontFamily: f1, color: B.navy }}>{detailPerson.name}</h2>
                {(detailPerson.ministries || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                    {(detailPerson.ministries || []).map(m => pill(m, B.tealPale, B.teal))}
                  </div>
                )}
                {detailPerson.email && <div style={{ fontSize: 13, color: B.textMid, fontFamily: f2 }}>✉ {detailPerson.email}</div>}
                {detailPerson.phone && <div style={{ fontSize: 13, color: B.textMid, fontFamily: f2 }}>📞 {detailPerson.phone}</div>}
                {detailPerson.notes && <div style={{ fontSize: 13, color: B.textLight, fontFamily: f2, marginTop: 4 }}>{detailPerson.notes}</div>}
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={e => openEditPerson(detailPerson, e)} style={{ ...btnS, padding: '7px 14px', fontSize: 12 }}>Edit</button>
                  <button onClick={() => setConfirmArchive(detailPerson)} style={{ ...btnD, padding: '7px 14px', fontSize: 12 }}>Archive</button>
                </div>
              )}
            </div>

            {/* Link to user account */}
            {isAdmin && (
              <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${B.sand}` }}>
                {detailPerson.userId ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: B.teal, fontFamily: f1 }}>
                      🔗 Linked to {(users || []).find(u => u.id === detailPerson.userId)?.name || 'user account'}
                    </span>
                    <button onClick={() => { unlinkAccessPerson(detailPerson._docId); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: B.textLight, fontFamily: f1, textDecoration: 'underline' }}>
                      Unlink
                    </button>
                  </div>
                ) : showLinkUser ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={linkUserId} onChange={e => setLinkUserId(e.target.value)}
                      style={{ ...inp, fontSize: 13, padding: '6px 10px', flex: '1 1 200px' }}>
                      <option value="">Select user account…</option>
                      {(users || []).filter(u => u.active).map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                      ))}
                    </select>
                    <button onClick={() => { linkAccessPerson(detailPerson._docId, linkUserId); setShowLinkUser(false); setLinkUserId(''); }}
                      disabled={!linkUserId}
                      style={{ ...btnP, padding: '6px 12px', fontSize: 12, opacity: !linkUserId ? 0.6 : 1 }}>
                      Link
                    </button>
                    <button onClick={() => { setShowLinkUser(false); setLinkUserId(''); }}
                      style={{ ...btnS, padding: '6px 12px', fontSize: 12 }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => { setShowLinkUser(true); setLinkUserId(''); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: B.textLight, fontFamily: f1, textDecoration: 'underline' }}>
                    🔗 Link to user account
                  </button>
                )}
              </div>
            )}

            {/* Record type tabs */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 16, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {[
                ['all', 'All'],
                ['background_check', '🔍 BG Check'],
                ['key_assignment', '🔑 Keys'],
                ['certification', '🎓 Certs'],
                ['custom', '✅ Custom'],
              ].map(([k, label]) => (
                <button key={k} onClick={() => setRecordTab(k)} style={{
                  padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, fontFamily: f1, whiteSpace: 'nowrap',
                  background: recordTab === k ? B.navy : B.sand,
                  color: recordTab === k ? B.white : B.textMid,
                }}>{label}</button>
              ))}
            </div>

            {/* Records list */}
            {detailRecords.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 20px', color: B.textLight, fontFamily: f2, fontSize: 13 }}>
                No records yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {detailRecords.map(record => {
                  const eStatus = getExpiryStatus(record.expiryDate);
                  return (
                    <div key={record._docId} style={{ background: B.warmGray, borderRadius: 12, padding: '14px 16px', border: `1px solid ${B.sand}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 16 }}>{TYPE_ICONS[record.type]}</span>
                            <span style={{ fontWeight: 700, fontSize: 14, fontFamily: f1, color: B.navy }}>{TYPE_LABELS[record.type] || record.type}</span>
                            {record.keyIdentifier && <span style={{ fontSize: 12, color: B.textMid, fontFamily: f1 }}>{record.keyIdentifier}</span>}
                            {record.certType && <span style={{ fontSize: 12, color: B.textMid, fontFamily: f1 }}>{record.certType}</span>}
                            {record.requirementName && <span style={{ fontSize: 12, color: B.textMid, fontFamily: f1 }}>{record.requirementName}</span>}
                            {record.ministry && pill(record.ministry, B.tealPale, B.teal)}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: B.textMid, fontFamily: f2 }}>
                            <span>Completed: <strong>{record.completedDate}</strong></span>
                            {record.expiryDate && (
                              <span style={{ color: eStatus && eStatus !== 'ok' ? expiryColor(eStatus) : B.textMid }}>
                                Expires: <strong>{record.expiryDate}</strong>
                                {eStatus === 'expired' && ' 🔴'}
                                {eStatus === 'critical' && ' 🔴'}
                                {eStatus === 'warning' && ' 🟡'}
                              </span>
                            )}
                            {record.type === 'key_assignment' && (
                              <span style={{ color: record.returnedDate ? B.teal : B.textMid }}>
                                {record.returnedDate ? `Returned: ${record.returnedDate}` : '⚠ Not returned'}
                              </span>
                            )}
                            {record.issuingOrganization && <span>Issuer: {record.issuingOrganization}</span>}
                          </div>
                          {record.notes && <div style={{ fontSize: 12, color: B.textLight, fontFamily: f2, marginTop: 6 }}>{record.notes}</div>}
                        </div>
                        {(record.type === 'certification' ? isAdmin : canEdit) && (
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            {record.type === 'key_assignment' && !record.returnedDate && (
                              <button onClick={() => handleMarkReturned(record)}
                                style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${B.teal}`, background: B.tealPale, color: B.teal, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: f1 }}>
                                Mark Returned
                              </button>
                            )}
                            <button onClick={e => openEditRecord(record, e)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: B.textLight, fontSize: 13, padding: '4px 6px' }}>✏</button>
                            <button onClick={() => setConfirmDeleteRecord(record)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: B.red, fontSize: 16, padding: '4px 6px' }}>×</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {canEdit && (
              <button onClick={() => openAddRecord(recordTab !== 'all' ? recordTab : 'background_check')}
                style={{ ...btnP, width: '100%', textAlign: 'center' }}>
                + Add Record
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* ═══════════════════════════ ADD/EDIT PERSON MODAL ════════════════ */}
      {showAddPerson && (
        <Modal open onClose={() => setShowAddPerson(false)}>
          <h3 style={{ margin: '0 0 20px', fontSize: 18, fontFamily: f1, color: B.navy }}>
            {editPerson ? 'Edit Person' : 'Add Person'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FF label="Name *">
              <input value={personForm.name} onChange={e => setPersonForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Full name" style={inp} />
            </FF>
            <FF label="Email">
              <input value={personForm.email} onChange={e => setPersonForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@example.com" type="email" style={inp} />
            </FF>
            <FF label="Phone">
              <input value={personForm.phone} onChange={e => setPersonForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="(555) 555-5555" type="tel" style={inp} />
            </FF>
            {ministries.length > 0 && (
              <FF label="Ministries">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ministries.map(m => (
                    <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13, fontFamily: f1, color: personForm.ministries.includes(m) ? B.teal : B.textMid }}>
                      <input type="checkbox" checked={personForm.ministries.includes(m)} onChange={() => toggleMinistry(m)}
                        style={{ accentColor: B.teal }} />
                      {m}
                    </label>
                  ))}
                </div>
              </FF>
            )}
            <FF label="Notes">
              <input value={personForm.notes} onChange={e => setPersonForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes" style={inp} />
            </FF>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowAddPerson(false)} style={btnS}>Cancel</button>
            <button onClick={handleSavePerson} disabled={busy || !personForm.name.trim()} style={{ ...btnP, opacity: busy || !personForm.name.trim() ? 0.6 : 1 }}>
              {busy ? 'Saving…' : editPerson ? 'Save Changes' : 'Add Person'}
            </button>
          </div>
        </Modal>
      )}

      {/* ═══════════════════════════ ADD/EDIT RECORD MODAL ════════════════ */}
      {showAddRecord && detailPerson && (
        <Modal open onClose={() => setShowAddRecord(false)}>
          <h3 style={{ margin: '0 0 4px', fontSize: 18, fontFamily: f1, color: B.navy }}>
            {editRecord ? 'Edit Record' : 'Add Record'}
          </h3>
          <div style={{ fontSize: 13, color: B.textLight, fontFamily: f2, marginBottom: 20 }}>For {detailPerson.name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FF label="Type">
              <select value={recordForm.type} onChange={e => setRecordForm(f => ({ ...f, type: e.target.value }))} style={inp}>
                <option value="background_check">Background Check</option>
                <option value="key_assignment">Key / Fob Assignment</option>
                {isAdmin && <option value="certification">Certification</option>}
                {customRequirements.length > 0 && <option value="custom">Custom Requirement</option>}
              </select>
            </FF>

            {recordForm.type === 'key_assignment' && (
              <FF label="Key Identifier">
                <input value={recordForm.keyIdentifier} onChange={e => setRecordForm(f => ({ ...f, keyIdentifier: e.target.value }))}
                  placeholder="e.g. Key #4 — Side Entrance" style={inp} />
              </FF>
            )}

            {recordForm.type === 'certification' && (
              <>
                <FF label="Certification Type">
                  <input value={recordForm.certType} onChange={e => setRecordForm(f => ({ ...f, certType: e.target.value }))}
                    placeholder="e.g. CPR/First Aid, SafeGuarding" list="cert-suggestions" style={inp} />
                  <datalist id="cert-suggestions">
                    {['CPR/First Aid', 'SafeGuarding', 'Child Protection', 'Food Handler', 'First Aid'].map(s => <option key={s} value={s} />)}
                  </datalist>
                </FF>
                <FF label="Issuing Organization">
                  <input value={recordForm.issuingOrganization} onChange={e => setRecordForm(f => ({ ...f, issuingOrganization: e.target.value }))}
                    placeholder="e.g. Red Cross" style={inp} />
                </FF>
              </>
            )}

            {recordForm.type === 'custom' && (
              <FF label="Requirement">
                <select value={recordForm.requirementId} onChange={e => setRecordForm(f => ({ ...f, requirementId: e.target.value }))} style={inp}>
                  <option value="">Select a requirement…</option>
                  {customRequirements.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </FF>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <FF label="Date Completed *">
                <input type="date" value={recordForm.completedDate} onChange={e => setRecordForm(f => ({ ...f, completedDate: e.target.value }))} style={inp} />
              </FF>
              <FF label="Expiry Date">
                <input type="date" value={recordForm.expiryDate} onChange={e => setRecordForm(f => ({ ...f, expiryDate: e.target.value }))} style={inp} />
              </FF>
            </div>

            {recordForm.type === 'key_assignment' && (
              <FF label="Date Returned">
                <input type="date" value={recordForm.returnedDate} onChange={e => setRecordForm(f => ({ ...f, returnedDate: e.target.value }))} style={inp} />
              </FF>
            )}

            {ministries.length > 0 && (
              <FF label="Ministry">
                <select value={recordForm.ministry} onChange={e => setRecordForm(f => ({ ...f, ministry: e.target.value }))} style={inp}>
                  <option value="">— None —</option>
                  {ministries.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </FF>
            )}

            <FF label="Notes">
              <input value={recordForm.notes} onChange={e => setRecordForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes" style={inp} />
            </FF>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowAddRecord(false)} style={btnS}>Cancel</button>
            <button onClick={handleSaveRecord}
              disabled={busy || !recordForm.completedDate || (recordForm.type === 'custom' && !recordForm.requirementId)}
              style={{ ...btnP, opacity: (busy || !recordForm.completedDate || (recordForm.type === 'custom' && !recordForm.requirementId)) ? 0.6 : 1 }}>
              {busy ? 'Saving…' : editRecord ? 'Save Changes' : 'Add Record'}
            </button>
          </div>
        </Modal>
      )}

      {/* ══════════════════════════ CONFIRM ARCHIVE ═══════════════════════ */}
      {confirmArchive && (
        <Modal open onClose={() => setConfirmArchive(null)}>
          <h3 style={{ margin: '0 0 12px', fontFamily: f1, color: B.navy }}>Archive Person?</h3>
          <p style={{ margin: '0 0 20px', fontSize: 14, fontFamily: f2, color: B.textMid }}>
            {confirmArchive.name} will be moved to the archived list. Their records will be preserved.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirmArchive(null)} style={btnS}>Cancel</button>
            <button onClick={handleArchivePerson} style={btnD}>Archive</button>
          </div>
        </Modal>
      )}

      {/* ══════════════════════════ CONFIRM DELETE RECORD ═════════════════ */}
      {confirmDeleteRecord && (
        <Modal open onClose={() => setConfirmDeleteRecord(null)}>
          <h3 style={{ margin: '0 0 12px', fontFamily: f1, color: B.navy }}>Delete Record?</h3>
          <p style={{ margin: '0 0 20px', fontSize: 14, fontFamily: f2, color: B.textMid }}>
            This will permanently remove the {TYPE_LABELS[confirmDeleteRecord.type] || 'record'} entry. This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirmDeleteRecord(null)} style={btnS}>Cancel</button>
            <button onClick={handleDeleteRecord} style={btnD}>Delete</button>
          </div>
        </Modal>
      )}

      {/* ══════════════════════════ BULK ENTRY MODAL ══════════════════════ */}
      {showBulkEntry && (
        <Modal open onClose={() => setShowBulkEntry(false)}>
          <div style={{ maxWidth: 700, width: '100%' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontFamily: f1, color: B.navy }}>Bulk Entry</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: B.textLight, fontFamily: f2 }}>
              Enter records for existing people. Names must match exactly.
            </p>

            {/* Result banner */}
            {bulkResult && (
              <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10,
                background: bulkResult.skipped.length > 0 ? '#FFFBEB' : '#F0FDF4',
                border: `1px solid ${bulkResult.skipped.length > 0 ? '#FDE68A' : '#BBF7D0'}` }}>
                <div style={{ fontWeight: 700, fontSize: 13, fontFamily: f1, color: bulkResult.skipped.length > 0 ? '#92400E' : B.teal }}>
                  ✅ {bulkResult.saved} record{bulkResult.saved !== 1 ? 's' : ''} saved
                  {bulkResult.skipped.length > 0 && ` — ${bulkResult.skipped.length} name${bulkResult.skipped.length > 1 ? 's' : ''} not found`}
                </div>
                {bulkResult.skipped.length > 0 && (
                  <div style={{ fontSize: 12, color: '#92400E', fontFamily: f2, marginTop: 4 }}>
                    Not found: {bulkResult.skipped.slice(0, 5).join(', ')}{bulkResult.skipped.length > 5 ? ` +${bulkResult.skipped.length - 5} more` : ''}
                  </div>
                )}
              </div>
            )}

            {/* Controls row */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 150px' }}>
                <label style={{ fontSize: 11, fontWeight: 700, fontFamily: f1, color: B.textLight, letterSpacing: 1, textTransform: 'uppercase' }}>Record Type</label>
                <select value={bulkType} onChange={e => changeBulkType(e.target.value)} style={inp}>
                  <option value="background_check">Background Check</option>
                  <option value="key_assignment">Key / Fob</option>
                  {isAdmin && <option value="certification">Certification</option>}
                  {customRequirements.length > 0 && <option value="custom">Custom</option>}
                </select>
              </div>

              {bulkType === 'certification' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 160px' }}>
                  <label style={{ fontSize: 11, fontWeight: 700, fontFamily: f1, color: B.textLight, letterSpacing: 1, textTransform: 'uppercase' }}>Cert Type (all rows)</label>
                  <input value={bulkCertType} onChange={e => setBulkCertType(e.target.value)}
                    placeholder="e.g. CPR/First Aid" list="bulk-cert-suggestions" style={inp} />
                  <datalist id="bulk-cert-suggestions">
                    {['CPR/First Aid', 'SafeGuarding', 'Child Protection', 'Food Handler', 'First Aid'].map(s => <option key={s} value={s} />)}
                  </datalist>
                </div>
              )}

              {bulkType === 'custom' && customRequirements.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 160px' }}>
                  <label style={{ fontSize: 11, fontWeight: 700, fontFamily: f1, color: B.textLight, letterSpacing: 1, textTransform: 'uppercase' }}>Requirement (all rows)</label>
                  <select value={bulkRequirementId} onChange={e => setBulkRequirementId(e.target.value)} style={inp}>
                    <option value="">Select…</option>
                    {customRequirements.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              )}

              {bulkType !== 'key_assignment' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, fontFamily: f1, color: B.textLight, letterSpacing: 1, textTransform: 'uppercase' }}>Expiry</label>
                  <select value={bulkExpiryMode} onChange={e => setBulkExpiryMode(e.target.value)} style={inp}>
                    <option value="none">No expiry</option>
                    <option value="interval">Interval</option>
                    <option value="per_row">Per row</option>
                  </select>
                </div>
              )}

              {bulkExpiryMode === 'interval' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 100 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, fontFamily: f1, color: B.textLight, letterSpacing: 1, textTransform: 'uppercase' }}>Interval</label>
                  <select value={bulkExpiryInterval} onChange={e => setBulkExpiryInterval(Number(e.target.value))} style={inp}>
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} year{n > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Shared datalist for person name autocomplete */}
            <datalist id="bulk-person-list">
              {allPeople.filter(p => p.active).map(p => <option key={p._docId} value={p.name} />)}
            </datalist>

            {/* Table header */}
            {(() => {
              const showKeyId = bulkType === 'key_assignment';
              const showExpiry = bulkExpiryMode === 'per_row' && bulkType !== 'key_assignment';
              const cols = showKeyId ? '1fr 150px 130px 28px'
                         : showExpiry ? '1fr 130px 130px 28px'
                         : '1fr 130px 28px';
              const hStyle = { fontSize: 11, fontWeight: 700, fontFamily: f1, color: B.textLight, letterSpacing: 1, textTransform: 'uppercase' };
              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '0 8px', marginBottom: 6, padding: '0 2px' }}>
                    <span style={hStyle}>Name</span>
                    {showKeyId && <span style={hStyle}>Key ID</span>}
                    <span style={hStyle}>Completed</span>
                    {showExpiry && <span style={hStyle}>Expires</span>}
                    <span />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, maxHeight: 300, overflowY: 'auto' }}>
                    {bulkRows.map((row, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: cols, gap: '0 8px', alignItems: 'center' }}>
                        <input list="bulk-person-list" value={row.personName}
                          onChange={e => updateBulkRow(idx, 'personName', e.target.value)}
                          placeholder="Person name…"
                          style={{ ...inp, padding: '7px 10px', fontSize: 13 }} />
                        {showKeyId && (
                          <input value={row.keyIdentifier}
                            onChange={e => updateBulkRow(idx, 'keyIdentifier', e.target.value)}
                            placeholder="Key #…"
                            style={{ ...inp, padding: '7px 10px', fontSize: 13 }} />
                        )}
                        <input type="date" value={row.completedDate}
                          onChange={e => updateBulkRow(idx, 'completedDate', e.target.value)}
                          style={{ ...inp, padding: '7px 10px', fontSize: 13 }} />
                        {showExpiry && (
                          <input type="date" value={row.expiryDate}
                            onChange={e => updateBulkRow(idx, 'expiryDate', e.target.value)}
                            style={{ ...inp, padding: '7px 10px', fontSize: 13 }} />
                        )}
                        <button onClick={() => deleteBulkRow(idx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: B.textLight, fontSize: 18, lineHeight: 1, padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            <button onClick={() => setBulkRows(r => [...r, ...Array.from({ length: 5 }, blankBulkRow)])}
              style={{ ...btnS, fontSize: 12, padding: '6px 12px', marginBottom: 20 }}>
              + Add 5 Rows
            </button>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowBulkEntry(false)} style={btnS}>Close</button>
              <button onClick={handleBulkSave}
                disabled={bulkSaving || !bulkRows.some(r => r.personName.trim() && r.completedDate)}
                style={{ ...btnP, opacity: (bulkSaving || !bulkRows.some(r => r.personName.trim() && r.completedDate)) ? 0.6 : 1 }}>
                {bulkSaving ? 'Saving…' : `Save ${bulkRows.filter(r => r.personName.trim() && r.completedDate).length} Records`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
