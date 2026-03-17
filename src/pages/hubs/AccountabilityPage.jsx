import { useState, useMemo, useContext } from 'react';
import { B, f1, f2, inp, btnP, btnS } from '../../components/brand/tokens.js';
import { Modal } from '../../components/primitives/Modal.jsx';
import { FF } from '../../components/primitives/FF.jsx';
import { Stat } from '../../components/primitives/Stat.jsx';
import { MobileCtx } from '../../hooks/useMobile.js';

const CONDITIONS = ['Good', 'Fair', 'Poor', 'Damaged'];

const ACTION_LABELS = {
  add_item: 'Added to inventory',
  check_out: 'Checked out',
  return: 'Returned',
  mark_repair: 'Sent for repair',
  mark_repaired: 'Repaired, returned to stock',
  dispose: 'Disposed',
  add_ticket: 'Maintenance ticket created',
  add_supply: 'Supply added',
  use_supply: 'Supply used',
  restock: 'Supply restocked',
};

export function AccountabilityPage({ store, userProfile }) {
  const _isMobile = useContext(MobileCtx);
  const { items, activityLog, audits, addAudit, settings } = store;

  // Audit flow
  const [auditStep, setAuditStep] = useState('list'); // list | setup | scanning
  const [auditLocation, setAuditLocation] = useState('');
  const [auditProgress, setAuditProgress] = useState({});
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState('');

  // Modals
  const [viewingAudit, setViewingAudit] = useState(null);
  const [showChain, setShowChain] = useState(false);
  const [chainSearch, setChainSearch] = useState('');
  const [chainItem, setChainItem] = useState(null);

  function showFlash(msg) { setFlash(msg); setTimeout(() => setFlash(''), 3500); }

  const isAdmin = userProfile?.role === 'admin';
  const isManager = userProfile?.role === 'manager';
  const canRunAudit = isAdmin || isManager;
  const locations = settings?.locations || [];
  const activeItems = useMemo(() => (items || []).filter(i => i.status !== 'Disposed'), [items]);

  const auditItems = useMemo(() => {
    if (!auditLocation) return [];
    return activeItems.filter(i => i.location === auditLocation);
  }, [auditLocation, activeItems]);

  // Stats
  const completedAudits = useMemo(() =>
    (audits || []).filter(a => a.status === 'Complete').sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')),
    [audits]
  );
  const lastAudit = completedAudits[0];
  const totalDiscrepancies = completedAudits.reduce((s, a) => s + (a.discrepancyCount || 0), 0);
  const totalItemsChecked = completedAudits.reduce((s, a) => s + (a.itemsChecked || 0), 0);

  function markItem(docId, result) {
    setAuditProgress(p => ({ ...p, [docId]: { condition: 'Good', notes: '', ...(p[docId] || {}), result } }));
  }

  function updateItemProgress(docId, field, value) {
    setAuditProgress(p => ({ ...p, [docId]: { ...(p[docId] || { result: null }), [field]: value } }));
  }

  const confirmedCount = Object.values(auditProgress).filter(p => p.result).length;

  async function completeAudit() {
    setSaving(true);
    const now = new Date().toISOString();
    const auditItemsData = auditItems.map(item => {
      const prog = auditProgress[item._docId] || {};
      return {
        docId: item._docId,
        itemId: item.itemId,
        description: item.description,
        currentStatus: item.status,
        location: item.location,
        auditResult: prog.result || 'not_checked',
        condition: prog.condition || '',
        notes: prog.notes || '',
      };
    });
    const discrepancies = auditItemsData.filter(i => i.auditResult === 'missing' || i.auditResult === 'issue');
    await addAudit({
      location: auditLocation,
      status: 'Complete',
      startedAt: now,
      completedAt: now,
      itemsChecked: auditItems.length,
      discrepancyCount: discrepancies.length,
      items: auditItemsData,
      discrepancies,
    }, userProfile.id, userProfile.name);
    setSaving(false);
    showFlash(`Audit complete — ${discrepancies.length} discrepanc${discrepancies.length === 1 ? 'y' : 'ies'} found`);
    setAuditStep('list');
    setAuditLocation('');
    setAuditProgress({});
  }

  function exportInsuranceCSV() {
    const rows = [
      ['Item ID', 'Description', 'Status', 'Location', 'Ministry', 'Condition', 'Purchase Date', 'Purchase Price', 'Estimated Value', 'Warranty Expiry', 'Tags'].join(',')
    ];
    activeItems.forEach(item => {
      rows.push([
        item.itemId || '',
        `"${(item.description || '').replace(/"/g, '""')}"`,
        item.status || '',
        item.location || '',
        item.ministry || '',
        item.condition || '',
        item.purchaseDate || '',
        item.purchasePrice != null ? item.purchasePrice : '',
        item.estimatedValue != null ? item.estimatedValue : '',
        item.warrantyExpiry || '',
        `"${(item.tags || []).join(', ')}"`,
      ].join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insurance-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const chainResults = useMemo(() => {
    if (!chainSearch.trim() || chainItem) return [];
    const q = chainSearch.toLowerCase();
    return activeItems.filter(i =>
      (i.itemId || '').toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q)
    ).slice(0, 10);
  }, [chainSearch, chainItem, activeItems]);

  const chainHistory = useMemo(() => {
    if (!chainItem) return [];
    return (activityLog || [])
      .filter(log => log.itemId === chainItem.itemId || log.itemId === chainItem._docId)
      .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
  }, [chainItem, activityLog]);

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function formatDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  /* ── SCANNING VIEW ── */
  if (auditStep === 'scanning') {
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
          <button onClick={() => { setAuditStep('list'); setAuditLocation(''); setAuditProgress({}); }} style={{ ...btnS, padding:'8px 14px', fontSize:13 }}>← Back</button>
          <div style={{ flex:1 }}>
            <h2 style={{ margin:0, fontFamily:f1, fontSize:20, color:B.navy }}>Audit: {auditLocation}</h2>
            <p style={{ margin:'4px 0 0', color:B.textLight, fontSize:13 }}>{confirmedCount} of {auditItems.length} items reviewed</p>
          </div>
          <button onClick={completeAudit} disabled={saving} style={{ ...btnP, padding:'10px 18px' }}>
            {saving ? 'Saving...' : 'Complete Audit'}
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ background:B.sand, borderRadius:99, height:8, marginBottom:24, overflow:'hidden' }}>
          <div style={{ height:'100%', borderRadius:99, background:B.teal, transition:'width 0.3s',
            width: `${auditItems.length ? (confirmedCount / auditItems.length) * 100 : 0}%` }} />
        </div>

        {auditItems.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px 20px', color:B.textLight }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📦</div>
            <p style={{ fontFamily:f1 }}>No items assigned to this location.</p>
          </div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {auditItems.map(item => {
            const prog = auditProgress[item._docId] || {};
            const result = prog.result;
            const colors = {
              present: { bg: B.tealPale, border: B.teal },
              missing:  { bg: B.redPale,  border: B.red   },
              issue:    { bg: '#FEF3C7',  border: '#F59E0B' },
            };
            const c = colors[result] || { bg: B.white, border: B.sand };
            return (
              <div key={item._docId} style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:12, padding:'14px 16px', transition:'all 0.2s' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:f1, fontWeight:600, fontSize:14, color:B.navy }}>{item.description}</div>
                    <div style={{ fontSize:12, color:B.textLight, marginTop:2 }}>{item.itemId} · {item.status}</div>
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0, flexWrap:'wrap' }}>
                    {[
                      { val:'present', label:'✓ Present', active: B.teal,   activeTxt: B.white,    inactive: B.teal,   border: B.teal    },
                      { val:'issue',   label:'⚠ Issue',   active:'#F59E0B', activeTxt: B.white,    inactive:'#B45309', border:'#F59E0B'  },
                      { val:'missing', label:'✗ Missing', active: B.red,    activeTxt: B.white,    inactive: B.red,    border: B.red     },
                    ].map(btn => (
                      <button key={btn.val} onClick={() => markItem(item._docId, btn.val)}
                        style={{ padding:'6px 12px', borderRadius:8, border:`1.5px solid ${btn.border}`, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:f1,
                          background: result === btn.val ? btn.active : 'transparent',
                          color:       result === btn.val ? btn.activeTxt : btn.inactive }}>
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
                {result === 'issue' && (
                  <div style={{ marginTop:12, display:'flex', gap:10, flexWrap:'wrap' }}>
                    <select value={prog.condition || 'Good'} onChange={e => updateItemProgress(item._docId, 'condition', e.target.value)}
                      style={{ ...inp, width:'auto', flex:'0 0 auto', padding:'6px 10px', fontSize:13 }}>
                      {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <input value={prog.notes || ''} onChange={e => updateItemProgress(item._docId, 'notes', e.target.value)}
                      style={{ ...inp, flex:1, minWidth:160, padding:'6px 10px', fontSize:13 }}
                      placeholder="Describe the issue..." />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop:24, textAlign:'center' }}>
          <button onClick={completeAudit} disabled={saving} style={{ ...btnP, padding:'12px 28px' }}>
            {saving ? 'Saving...' : `Complete Audit (${auditItems.length - confirmedCount} unchecked)`}
          </button>
        </div>
      </div>
    );
  }

  /* ── MAIN LIST VIEW ── */
  const sortedAudits = [...(audits || [])].sort((a, b) =>
    (b.completedAt || b.startedAt || '').localeCompare(a.completedAt || a.startedAt || '')
  );

  return (
    <div style={{ fontFamily:f2 }}>
      {flash && (
        <div style={{ background:B.tealPale, border:`1px solid ${B.teal}`, borderRadius:10, padding:'10px 16px', marginBottom:16, color:B.teal, fontWeight:600, fontSize:13, fontFamily:f1 }}>
          {flash}
        </div>
      )}

      {/* Stats */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:24 }}>
        <Stat label="Audits Done"    value={completedAudits.length}  icon="📋" />
        <Stat label="Last Audit"     value={formatDate(lastAudit?.completedAt)} icon="🗓" />
        <Stat label="Items Checked"  value={totalItemsChecked}        icon="✅" />
        <Stat label="Discrepancies"  value={totalDiscrepancies}       icon="⚠️" color={totalDiscrepancies > 0 ? B.red : B.navy} />
      </div>

      {/* Action buttons */}
      <div style={{ display:'flex', gap:10, marginBottom:28, flexWrap:'wrap' }}>
        {canRunAudit && (
          <button onClick={() => setAuditStep('setup')} style={{ ...btnP, display:'flex', alignItems:'center', gap:8 }}>
            <span>📋</span> Start New Audit
          </button>
        )}
        <button onClick={() => { setShowChain(true); setChainSearch(''); setChainItem(null); }}
          style={{ ...btnS, display:'flex', alignItems:'center', gap:8 }}>
          <span>🔗</span> Chain of Custody
        </button>
        {isAdmin && (
          <button onClick={exportInsuranceCSV} style={{ ...btnS, display:'flex', alignItems:'center', gap:8 }}>
            <span>📄</span> Insurance Export
          </button>
        )}
      </div>

      {/* Audit history */}
      <h3 style={{ margin:'0 0 12px', fontFamily:f1, fontSize:17, color:B.navy }}>Audit History</h3>

      {sortedAudits.length === 0 ? (
        <div style={{ background:B.white, borderRadius:14, padding:'40px 24px', textAlign:'center', border:'1px solid '+B.sand }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
          <p style={{ fontFamily:f1, fontWeight:600, color:B.navy, margin:'0 0 8px' }}>No audits yet</p>
          <p style={{ color:B.textLight, fontSize:13, margin:0 }}>Start a physical audit to confirm items are where they should be.</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {sortedAudits.map(audit => (
            <div key={audit._docId} onClick={() => setViewingAudit(audit)}
              style={{ background:B.white, border:'1px solid '+B.sand, borderRadius:12, padding:'14px 18px', cursor:'pointer',
                display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}
              onMouseEnter={e => e.currentTarget.style.background = B.cream}
              onMouseLeave={e => e.currentTarget.style.background = B.white}>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:f1, fontWeight:600, fontSize:14, color:B.navy }}>{audit.location}</div>
                <div style={{ fontSize:12, color:B.textLight, marginTop:2 }}>
                  {formatDateTime(audit.completedAt || audit.startedAt)} · {audit.conductedByName}
                </div>
              </div>
              <div style={{ display:'flex', gap:16, fontSize:13, flexShrink:0 }}>
                <span style={{ color:B.textLight }}>{audit.itemsChecked || 0} items</span>
                {(audit.discrepancyCount || 0) > 0
                  ? <span style={{ color:B.red, fontWeight:600 }}>⚠ {audit.discrepancyCount} issue{audit.discrepancyCount !== 1 ? 's' : ''}</span>
                  : <span style={{ color:B.teal, fontWeight:600 }}>✓ All clear</span>}
              </div>
              <span style={{ color:B.textLight, fontSize:18 }}>›</span>
            </div>
          ))}
        </div>
      )}

      {/* Setup modal */}
      <Modal open={auditStep === 'setup'} onClose={() => { setAuditStep('list'); setAuditLocation(''); }} title="Start New Audit">
        <FF label="Location to Audit">
          <select value={auditLocation} onChange={e => setAuditLocation(e.target.value)} style={inp}>
            <option value="">Select a location...</option>
            {locations.map(l => <option key={l}>{l}</option>)}
          </select>
        </FF>
        {auditLocation && (
          <p style={{ color:B.textLight, fontSize:13, margin:'4px 0 16px' }}>
            {auditItems.length} item{auditItems.length !== 1 ? 's' : ''} expected at this location
          </p>
        )}
        <button onClick={() => { setAuditProgress({}); setAuditStep('scanning'); }}
          disabled={!auditLocation} style={{ ...btnP, width:'100%', opacity:auditLocation ? 1 : 0.5 }}>
          Begin Audit
        </button>
      </Modal>

      {/* Audit detail modal */}
      <Modal open={!!viewingAudit} onClose={() => setViewingAudit(null)}
        title={viewingAudit ? `Audit: ${viewingAudit.location}` : ''} wide>
        {viewingAudit && (
          <div>
            <div style={{ display:'flex', gap:20, marginBottom:20, fontSize:13, color:B.textLight, flexWrap:'wrap' }}>
              <span>📅 {formatDateTime(viewingAudit.completedAt)}</span>
              <span>👤 {viewingAudit.conductedByName}</span>
              <span>📦 {viewingAudit.itemsChecked} items</span>
              {(viewingAudit.discrepancyCount || 0) > 0 &&
                <span style={{ color:B.red, fontWeight:600 }}>⚠ {viewingAudit.discrepancyCount} discrepanc{viewingAudit.discrepancyCount === 1 ? 'y' : 'ies'}</span>}
            </div>

            {viewingAudit.discrepancies?.length > 0 && (
              <div style={{ background:B.redPale, border:`1px solid ${B.red}`, borderRadius:10, padding:'14px 16px', marginBottom:20 }}>
                <div style={{ fontFamily:f1, fontWeight:600, color:B.red, marginBottom:10 }}>Discrepancies</div>
                {viewingAudit.discrepancies.map((d, i) => (
                  <div key={i} style={{ fontSize:13, padding:'8px 0', borderTop: i > 0 ? '1px solid rgba(220,53,69,0.15)' : 'none' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <span style={{ fontWeight:600, color:B.textDark }}>{d.description}</span>
                      <span style={{ color:B.textLight, fontSize:11 }}>{d.itemId}</span>
                      <span style={{ padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600, color:B.white,
                        background: d.auditResult === 'missing' ? B.red : '#F59E0B' }}>
                        {d.auditResult === 'missing' ? 'Missing' : 'Condition Issue'}
                      </span>
                      {d.condition && d.condition !== 'Good' && <span style={{ color:B.textLight }}>· {d.condition}</span>}
                    </div>
                    {d.notes && <div style={{ color:B.textLight, marginTop:4, paddingLeft:4 }}>{d.notes}</div>}
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontFamily:f1, fontWeight:600, fontSize:14, color:B.navy, marginBottom:10 }}>All Items</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {(viewingAudit.items || []).map((item, i) => {
                const bg = item.auditResult === 'present' ? B.tealPale : item.auditResult === 'missing' ? B.redPale : item.auditResult === 'issue' ? '#FEF3C7' : B.white;
                const icon = item.auditResult === 'present' ? '✅' : item.auditResult === 'missing' ? '❌' : item.auditResult === 'issue' ? '⚠️' : '⬜';
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 12px', background:bg, borderRadius:8, fontSize:13 }}>
                    <span>{icon}</span>
                    <span style={{ flex:1, color:B.textDark }}>{item.description}</span>
                    <span style={{ color:B.textLight, fontSize:11 }}>{item.itemId}</span>
                    {item.notes && <span style={{ color:B.textLight, fontStyle:'italic', fontSize:12 }}>{item.notes}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* Chain of custody modal */}
      <Modal open={showChain} onClose={() => { setShowChain(false); setChainItem(null); setChainSearch(''); }}
        title="Chain of Custody" wide>
        <FF label="Search Item">
          <input style={inp} value={chainSearch}
            onChange={e => { setChainSearch(e.target.value); setChainItem(null); }}
            placeholder="Type item ID or name..." autoFocus />
        </FF>

        {/* Search results dropdown */}
        {chainSearch && !chainItem && chainResults.length > 0 && (
          <div style={{ border:'1px solid '+B.sand, borderRadius:10, overflow:'hidden', marginBottom:16 }}>
            {chainResults.map(item => (
              <div key={item._docId} onClick={() => { setChainItem(item); setChainSearch(item.description); }}
                style={{ padding:'10px 16px', cursor:'pointer', borderTop:'1px solid '+B.sand, background:B.white, fontSize:13 }}
                onMouseEnter={e => e.currentTarget.style.background = B.cream}
                onMouseLeave={e => e.currentTarget.style.background = B.white}>
                <span style={{ fontWeight:600, color:B.navy }}>{item.description}</span>
                <span style={{ color:B.textLight, marginLeft:8 }}>{item.itemId}</span>
              </div>
            ))}
          </div>
        )}
        {chainSearch && !chainItem && chainResults.length === 0 && (
          <p style={{ color:B.textLight, fontSize:13, margin:'0 0 16px' }}>No items found.</p>
        )}

        {chainItem && (
          <div>
            <div style={{ background:B.tealPale, borderRadius:10, padding:'10px 14px', marginBottom:20, display:'flex', alignItems:'center', gap:10 }}>
              <div>
                <div style={{ fontFamily:f1, fontWeight:600, color:B.teal, fontSize:14 }}>{chainItem.description}</div>
                <div style={{ color:B.textLight, fontSize:12, marginTop:2 }}>{chainItem.itemId} · {chainItem.status} · {chainItem.location}</div>
              </div>
              <button onClick={() => { setChainItem(null); setChainSearch(''); }}
                style={{ marginLeft:'auto', background:'none', border:'none', color:B.textLight, cursor:'pointer', fontSize:18 }}>&times;</button>
            </div>

            {chainHistory.length === 0 ? (
              <p style={{ color:B.textLight, fontSize:13, textAlign:'center', padding:'20px 0' }}>No activity recorded for this item.</p>
            ) : (
              <div style={{ position:'relative' }}>
                <div style={{ position:'absolute', left:15, top:0, bottom:0, width:2, background:B.sand }} />
                {chainHistory.map((log, i) => (
                  <div key={i} style={{ display:'flex', gap:16, marginBottom:16, paddingLeft:8 }}>
                    <div style={{ width:16, height:16, borderRadius:'50%', background:B.teal, border:'2px solid '+B.white, flexShrink:0, marginTop:3, position:'relative', zIndex:1 }} />
                    <div>
                      <div style={{ fontFamily:f1, fontWeight:600, fontSize:13, color:B.navy }}>
                        {ACTION_LABELS[log.action] || log.action}
                      </div>
                      <div style={{ fontSize:12, color:B.textLight }}>{formatDateTime(log.timestamp)} · {log.performedByName}</div>
                      {log.details?.person && (
                        <div style={{ fontSize:12, color:B.textLight, marginTop:2 }}>
                          → {log.details.person}{log.details.ministry ? ` (${log.details.ministry})` : ''}
                          {log.details.expectedReturn ? ` · Due ${formatDate(log.details.expectedReturn)}` : ''}
                        </div>
                      )}
                      {log.details?.condition && <div style={{ fontSize:12, color:B.textLight }}>Condition: {log.details.condition}</div>}
                      {log.details?.reason && <div style={{ fontSize:12, color:B.textLight }}>Reason: {log.details.reason}</div>}
                      {log.details?.notes && <div style={{ fontSize:12, color:B.textLight, fontStyle:'italic' }}>{log.details.notes}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
