import { useState, useMemo, useContext } from 'react';
import { B, f1, inp, btnP, btnS } from '../../components/brand/tokens.js';
import { Modal } from '../../components/primitives/Modal.jsx';
import { FF } from '../../components/primitives/FF.jsx';
import { Stat } from '../../components/primitives/Stat.jsx';
import { MobileCtx } from '../../hooks/useMobile.js';

export function CoordinationPage({ store, userProfile }) {
  const {
    items, bundles, notificationConfig, settings, config,
    addBundle, updateBundle, deleteBundle, updateNotificationConfig,
    checkOutItem,
  } = store;
  const isMobile = useContext(MobileCtx);

  const isAdmin = userProfile?.role === 'admin';
  const isManager = userProfile?.role === 'manager';
  const canManageBundles = isAdmin || isManager;
  const userId = userProfile?.id || userProfile?.uid;
  const userName = userProfile?.name || 'Unknown';
  const activeItems = useMemo(() => items.filter(i => i.status !== 'Disposed'), [items]);
  const ministries = settings?.ministries || [];
  const today = new Date().toISOString().split('T')[0];

  const [msg, setMsg] = useState('');
  function flash(text) { setMsg(text); setTimeout(() => setMsg(''), 3500); }

  // ── Bundle modal state ──
  const [showBundleModal, setShowBundleModal] = useState(false);
  const [editBundle, setEditBundle] = useState(null);
  const [bundleForm, setBundleForm] = useState({ name: '', description: '', items: [] });
  const [bundleItemSearch, setBundleItemSearch] = useState('');
  const [savingBundle, setSavingBundle] = useState(false);

  // ── Checkout modal state ──
  const [checkoutBundle, setCheckoutBundle] = useState(null);
  const [coForm, setCoForm] = useState({ person: '', purpose: '', ministry: '', date: today, returnDate: '' });
  const [checkingOut, setCheckingOut] = useState(false);

  // ── Notification form state ──
  const [notifForm, setNotifForm] = useState(null);
  const [savingNotif, setSavingNotif] = useState(false);

  // ── Bundle helpers ──
  function openCreateBundle() {
    setEditBundle(null);
    setBundleForm({ name: '', description: '', items: [] });
    setBundleItemSearch('');
    setShowBundleModal(true);
  }

  function openEditBundle(b) {
    setEditBundle(b);
    setBundleForm({ name: b.name, description: b.description || '', items: [...(b.items || [])] });
    setBundleItemSearch('');
    setShowBundleModal(true);
  }

  function toggleBundleItem(item) {
    const already = bundleForm.items.some(i => i.docId === item._docId);
    if (already) {
      setBundleForm(f => ({ ...f, items: f.items.filter(i => i.docId !== item._docId) }));
    } else {
      setBundleForm(f => ({
        ...f,
        items: [...f.items, { docId: item._docId, itemId: item.itemId, description: item.description, location: item.location || '' }]
      }));
    }
  }

  async function handleSaveBundle() {
    if (!bundleForm.name.trim() || bundleForm.items.length === 0) return;
    setSavingBundle(true);
    try {
      if (editBundle) {
        await updateBundle(editBundle._docId, {
          name: bundleForm.name.trim(),
          description: bundleForm.description.trim(),
          items: bundleForm.items
        });
        flash('Bundle updated!');
      } else {
        await addBundle(
          { name: bundleForm.name.trim(), description: bundleForm.description.trim(), items: bundleForm.items },
          userId, userName
        );
        flash('Bundle created!');
      }
      setShowBundleModal(false);
    } catch (e) { flash('Error: ' + e.message); }
    setSavingBundle(false);
  }

  async function handleDeleteBundle(b) {
    if (!window.confirm(`Delete bundle "${b.name}"? This cannot be undone.`)) return;
    await deleteBundle(b._docId);
    flash('Bundle deleted.');
  }

  function openCheckout(b) {
    setCheckoutBundle(b);
    setCoForm({ person: userName, purpose: '', ministry: '', date: today, returnDate: '' });
  }

  async function handleCheckoutBundle() {
    if (!checkoutBundle || !coForm.person.trim() || !coForm.date) return;
    setCheckingOut(true);
    try {
      let checkedOut = 0;
      let skipped = 0;
      for (const bi of (checkoutBundle.items || [])) {
        const full = activeItems.find(i => i._docId === bi.docId);
        if (!full || full.status === 'Checked Out' || full.status === 'Under Repair' || full.status === 'Disposed') {
          skipped++;
          continue;
        }
        await checkOutItem(bi.docId, {
          itemId: bi.itemId,
          person: coForm.person,
          purpose: coForm.purpose || checkoutBundle.name,
          ministry: coForm.ministry,
          date: coForm.date,
          returnDate: coForm.returnDate,
        }, userId, userName);
        checkedOut++;
      }
      flash(`Checked out ${checkedOut} item${checkedOut !== 1 ? 's' : ''}${skipped > 0 ? ` (${skipped} skipped — unavailable)` : ''}.`);
      setCheckoutBundle(null);
    } catch (e) { flash('Error: ' + e.message); }
    setCheckingOut(false);
  }

  // ── Notification helpers ──
  function openNotifEdit() {
    setNotifForm({ enabled: notificationConfig?.enabled || false });
  }

  async function handleSaveNotif() {
    if (!notifForm) return;
    setSavingNotif(true);
    await updateNotificationConfig({ ...notificationConfig, enabled: notifForm.enabled });
    setNotifForm(null);
    flash('Notification settings saved!');
    setSavingNotif(false);
  }

  // ── Derived ──
  const filteredItemsForBundle = useMemo(() => {
    const q = bundleItemSearch.toLowerCase();
    if (!q) return activeItems;
    return activeItems.filter(i =>
      i.description?.toLowerCase().includes(q) ||
      i.itemId?.toLowerCase().includes(q) ||
      i.location?.toLowerCase().includes(q)
    );
  }, [activeItems, bundleItemSearch]);

  const notifActive = notificationConfig?.enabled;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontFamily: f1, fontSize: 22, fontWeight: 700, color: B.navy, margin: 0 }}>Coordination Hub</h2>
        {canManageBundles && <button onClick={openCreateBundle} style={btnP}>+ New Bundle</button>}
      </div>

      {msg && (
        <div style={{ background: B.tealPale, border: '1px solid ' + B.tealLight, borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 14, fontWeight: 600, color: B.teal }}>{msg}</div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 28 }}>
        <Stat label="Bundles" value={bundles.length} icon="📦" color={B.navy} />
        <Stat label="Items in Bundles" value={bundles.reduce((s, b) => s + (b.items || []).length, 0)} icon="🧩" color={B.teal} />
        <Stat label="Notifications" value={notifActive ? 'On' : 'Off'} icon="📧" color={notifActive ? B.teal : B.textLight} />
      </div>

      {/* ═══ BUNDLES ═══ */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
          <h3 style={{ fontFamily: f1, fontSize: 16, fontWeight: 700, color: B.navy, margin: 0 }}>Checkout Bundles</h3>
          <span style={{ fontSize: 13, color: B.textLight }}>Pre-defined item groups for one-click checkout</span>
        </div>

        {bundles.length === 0 ? (
          <div style={{ background: B.white, borderRadius: 18, padding: '44px 32px', border: '1px solid ' + B.sand, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <p style={{ color: B.textLight, margin: '0 0 20px', fontSize: 15 }}>No bundles yet. Create one to speed up common setups like "Sunday Morning AV" or "Youth Room Pack."</p>
            {canManageBundles && <button onClick={openCreateBundle} style={btnP}>+ Create Your First Bundle</button>}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(310px,1fr))', gap: 16 }}>
            {bundles.map(b => {
              const totalCount = (b.items || []).length;
              const availCount = (b.items || []).filter(bi => {
                const item = activeItems.find(i => i._docId === bi.docId);
                return item && item.status !== 'Checked Out' && item.status !== 'Under Repair';
              }).length;
              const allAvail = availCount === totalCount;
              return (
                <div key={b._docId} style={{ background: B.white, borderRadius: 14, padding: 20, border: '1px solid ' + B.sand, boxShadow: '0 1px 4px rgba(27,42,74,0.06)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: f1, fontWeight: 700, fontSize: 15, color: B.navy, marginBottom: 2 }}>{b.name}</div>
                      {b.description && <div style={{ fontSize: 13, color: B.textMid }}>{b.description}</div>}
                    </div>
                    {canManageBundles && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                        <button onClick={() => openEditBundle(b)} style={{ ...btnS, padding: '5px 10px', fontSize: 12 }}>Edit</button>
                        <button onClick={() => handleDeleteBundle(b)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: B.textLight, fontSize: 18, lineHeight: 1, padding: '2px 4px' }} title="Delete">✕</button>
                      </div>
                    )}
                  </div>

                  {/* Item list */}
                  <div style={{ flex: 1 }}>
                    {(b.items || []).slice(0, 5).map(bi => {
                      const item = activeItems.find(i => i._docId === bi.docId);
                      const avail = item && item.status !== 'Checked Out' && item.status !== 'Under Repair';
                      return (
                        <div key={bi.docId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 0', color: avail ? B.textDark : B.textLight }}>
                          <span style={{ color: avail ? B.teal : B.red, fontSize: 10 }}>●</span>
                          <span style={{ flex: 1 }}>{bi.description}</span>
                          <span style={{ fontFamily: 'monospace', color: B.textLight }}>{bi.itemId}</span>
                          {!avail && item && <span style={{ color: B.textLight, fontStyle: 'italic' }}>{item.status}</span>}
                          {!item && <span style={{ color: B.red, fontStyle: 'italic' }}>removed</span>}
                        </div>
                      );
                    })}
                    {totalCount > 5 && <div style={{ fontSize: 11, color: B.teal, fontWeight: 600, marginTop: 4, display: 'inline-block', background: B.tealPale, borderRadius: 10, padding: '2px 8px' }}>+{totalCount - 5} more</div>}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, borderTop: '1px solid ' + B.sand }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: allAvail ? B.teal : B.gold }}>
                      {availCount}/{totalCount} available
                    </span>
                    <button
                      onClick={() => openCheckout(b)}
                      disabled={availCount === 0}
                      style={{ ...btnP, padding: '7px 14px', fontSize: 12, opacity: availCount === 0 ? 0.4 : 1 }}
                    >
                      Check Out Bundle
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ EMAIL NOTIFICATIONS ═══ */}
      {isAdmin && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
            <h3 style={{ fontFamily: f1, fontSize: 16, fontWeight: 700, color: B.navy, margin: 0 }}>Email Notifications</h3>
            <span style={{ fontSize: 13, color: B.textLight }}>Powered by SendGrid — reservation approvals, denials, ticket assignments, and job announcements</span>
          </div>

          <div style={{ background: B.white, borderRadius: 14, padding: 24, border: '1px solid ' + B.sand }}>
            {notifForm ? (
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, cursor: 'pointer' }}>
                  <input type="checkbox" checked={notifForm.enabled} onChange={e => setNotifForm(f => ({ ...f, enabled: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  <span style={{ fontSize: 14, color: B.textDark }}>Enable automatic email notifications</span>
                </label>
                <div style={{ fontSize: 13, color: B.textMid, marginBottom: 20, lineHeight: 1.6 }}>
                  When enabled, emails are sent automatically for: reservation approved/denied, maintenance ticket assigned, and new Job Hub announcements.
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setNotifForm(null)} style={btnS}>Cancel</button>
                  <button onClick={handleSaveNotif} disabled={savingNotif} style={{ ...btnP, opacity: savingNotif ? 0.5 : 1 }}>
                    {savingNotif ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: notifActive ? B.teal : B.sand }} />
                    <span style={{ fontWeight: 600, fontSize: 14, color: B.textDark }}>
                      {notifActive ? 'Notifications enabled' : 'Notifications disabled'}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: B.textLight }}>
                    {notifActive
                      ? 'Members receive emails when reservations are approved/denied, tickets are assigned, and announcements are posted.'
                      : 'Enable to auto-email members on reservation decisions, ticket assignments, and job announcements.'}
                  </div>
                </div>
                <button onClick={openNotifEdit} style={{ ...btnS, fontSize: 13, padding: '9px 18px' }}>Configure</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ BUNDLE EDIT MODAL ═══ */}
      <Modal open={showBundleModal} onClose={() => setShowBundleModal(false)} title={editBundle ? 'Edit Bundle' : 'New Bundle'} wide>
        <FF label="Bundle Name *">
          <input style={inp} value={bundleForm.name} onChange={e => setBundleForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sunday Morning AV Setup" />
        </FF>
        <FF label="Description">
          <input style={inp} value={bundleForm.description} onChange={e => setBundleForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional — what is this bundle for?" />
        </FF>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: B.textMid, marginBottom: 8, fontFamily: f1 }}>
            Select Items <span style={{ color: B.textLight, fontWeight: 400 }}>({bundleForm.items.length} selected)</span>
          </div>
          <input
            style={{ ...inp, marginBottom: 8 }}
            value={bundleItemSearch}
            onChange={e => setBundleItemSearch(e.target.value)}
            placeholder="Search items..."
          />
          <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid ' + B.sand, borderRadius: 10 }}>
            {filteredItemsForBundle.length === 0 ? (
              <div style={{ padding: 16, color: B.textLight, fontSize: 13, textAlign: 'center' }}>No items match</div>
            ) : filteredItemsForBundle.map(item => {
              const checked = bundleForm.items.some(i => i.docId === item._docId);
              return (
                <label key={item._docId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer', background: checked ? B.tealPale : 'transparent', borderBottom: '1px solid ' + B.warmGray }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleBundleItem(item)} style={{ cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: B.textDark }}>{item.description}</span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: B.textLight }}>{item.itemId}</span>
                  <span style={{ fontSize: 11, color: item.status === 'Available' ? B.teal : B.textLight, fontWeight: 600 }}>{item.status}</span>
                </label>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setShowBundleModal(false)} style={btnS}>Cancel</button>
          <button
            onClick={handleSaveBundle}
            disabled={savingBundle || !bundleForm.name.trim() || bundleForm.items.length === 0}
            style={{ ...btnP, opacity: (savingBundle || !bundleForm.name.trim() || bundleForm.items.length === 0) ? 0.5 : 1 }}
          >
            {savingBundle ? 'Saving...' : editBundle ? 'Save Changes' : 'Create Bundle'}
          </button>
        </div>
      </Modal>

      {/* ═══ BUNDLE CHECKOUT MODAL ═══ */}
      <Modal open={!!checkoutBundle} onClose={() => setCheckoutBundle(null)} title={`Check Out: ${checkoutBundle?.name || ''}`} wide>
        {checkoutBundle && (() => {
          const totalCount = (checkoutBundle.items || []).length;
          const checkableItems = (checkoutBundle.items || []).map(bi => {
            const item = activeItems.find(i => i._docId === bi.docId);
            const canCheckout = item && item.status !== 'Checked Out' && item.status !== 'Under Repair' && item.status !== 'Disposed';
            return { ...bi, item, canCheckout };
          });
          const availCount = checkableItems.filter(i => i.canCheckout).length;
          return <>
            {/* Item status summary */}
            <div style={{ background: B.warmGray, borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: B.textLight, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: f1, marginBottom: 8 }}>
                Items ({availCount}/{totalCount} available)
              </div>
              {checkableItems.map(bi => (
                <div key={bi.docId} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '2px 0', color: bi.canCheckout ? B.textDark : B.textLight }}>
                  <span style={{ color: bi.canCheckout ? B.teal : B.red }}>{bi.canCheckout ? '✓' : '✕'}</span>
                  <span>{bi.description}</span>
                  {!bi.canCheckout && <span style={{ fontStyle: 'italic' }}>({bi.item?.status || 'not found'} — will skip)</span>}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              <FF label="Person *">
                <input style={{ ...inp, borderColor: !coForm.person.trim() ? B.red : undefined }} value={coForm.person} onChange={e => setCoForm(f => ({ ...f, person: e.target.value }))} placeholder="Who is checking out?" />
                {!coForm.person.trim() && <div style={{ fontSize: 12, color: B.red, marginTop: 4 }}>Person is required</div>}
              </FF>
              <FF label="Ministry">
                <select style={{ ...inp, cursor: 'pointer' }} value={coForm.ministry} onChange={e => setCoForm(f => ({ ...f, ministry: e.target.value }))}>
                  <option value="">—</option>
                  {ministries.map(m => <option key={m}>{m}</option>)}
                </select>
              </FF>
              <FF label="Purpose">
                <input style={inp} value={coForm.purpose} onChange={e => setCoForm(f => ({ ...f, purpose: e.target.value }))} placeholder={checkoutBundle.name} />
              </FF>
              <div />
              <FF label="Date *">
                <input type="date" style={{ ...inp, borderColor: !coForm.date ? B.red : undefined }} value={coForm.date} onChange={e => setCoForm(f => ({ ...f, date: e.target.value }))} />
                {!coForm.date && <div style={{ fontSize: 12, color: B.red, marginTop: 4 }}>Date is required</div>}
              </FF>
              <FF label="Expected Return">
                <input type="date" style={inp} value={coForm.returnDate} onChange={e => setCoForm(f => ({ ...f, returnDate: e.target.value }))} />
              </FF>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button onClick={() => setCheckoutBundle(null)} style={btnS}>Cancel</button>
              <button
                onClick={handleCheckoutBundle}
                disabled={checkingOut || !coForm.person.trim() || !coForm.date || availCount === 0}
                style={{ ...btnP, opacity: (checkingOut || !coForm.person.trim() || !coForm.date || availCount === 0) ? 0.5 : 1 }}
              >
                {checkingOut ? 'Checking out...' : `Check Out ${availCount} Item${availCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>;
        })()}
      </Modal>
    </div>
  );
}
