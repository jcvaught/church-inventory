import { useState, useContext } from 'react';
import { MobileCtx } from '../../hooks/useMobile.js';
import { B, f1, f2, inp, btnP, btnS, btnD } from '../../components/brand/tokens.js';
import { Modal } from '../../components/primitives/Modal.jsx';
import { FF } from '../../components/primitives/FF.jsx';
import { Stat } from '../../components/primitives/Stat.jsx';

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const CATEGORIES = ['Electrical', 'Mechanical', 'Cosmetic', 'Safety', 'Other'];
const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];

const priorityColors = {
  Low:    { bg: B.warmGray,  tx: B.textMid,   dot: B.textLight },
  Medium: { bg: B.goldLight, tx: '#96750E',   dot: B.gold },
  High:   { bg: '#FEE8E8',   tx: B.red,       dot: '#E87171' },
  Urgent: { bg: B.redPale,   tx: B.red,       dot: B.red },
};

const statusColors = {
  Open:         { bg: B.redPale,   tx: B.red,     dot: B.red },
  'In Progress':{ bg: '#E8F0FE',   tx: '#1A65C7', dot: '#3B82F6' },
  Resolved:     { bg: B.tealPale,  tx: B.teal,    dot: B.tealLight },
  Closed:       { bg: B.warmGray,  tx: B.textMid, dot: B.textLight },
};

function PriorityBadge({ priority }) {
  const s = priorityColors[priority] || priorityColors.Medium;
  return <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, background:s.bg, color:s.tx, fontSize:11, fontWeight:700, fontFamily:f1 }}>
    <span style={{ width:6, height:6, borderRadius:'50%', background:s.dot }}/>{priority}
  </span>;
}

function StatusBadge({ status }) {
  const s = statusColors[status] || statusColors.Open;
  return <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, background:s.bg, color:s.tx, fontSize:11, fontWeight:700, fontFamily:f1 }}>
    <span style={{ width:6, height:6, borderRadius:'50%', background:s.dot }}/>{status}
  </span>;
}

export function MaintenancePage({ store, userProfile }) {
  const { items, maintenanceTickets, vendors, addTicket, updateTicket, addVendor, updateVendor } = store;
  const isMobile = useContext(MobileCtx);

  const [statusFilter, setStatusFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showVendors, setShowVendors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const userId = userProfile?.id || userProfile?.uid;
  const userName = userProfile?.name || 'Unknown';
  const isAdmin = userProfile?.role === 'admin';

  const activeItems = items.filter(i => i.status !== 'Disposed');

  const emptyTicket = {
    itemDocId: '', itemId: '', itemDescription: '',
    issue: '', priority: 'Medium', category: 'Other',
    assignedTo: '', estimatedCost: '', vendorId: '', vendorName: '',
    partsNeeded: '', notes: ''
  };
  const [ticketForm, setTicketForm] = useState(emptyTicket);
  const [detailEdits, setDetailEdits] = useState({});

  const emptyVendor = { name: '', phone: '', email: '', specialty: '', notes: '' };
  const [vendorForm, setVendorForm] = useState(emptyVendor);

  function flash(text) { setMsg(text); setTimeout(() => setMsg(''), 3000); }

  const filtered = maintenanceTickets.filter(t => statusFilter === 'all' || t.status === statusFilter);

  // Stats
  const today = new Date().toISOString().split('T')[0];
  const thisMonthStart = today.slice(0, 7) + '-01';
  const openCount = maintenanceTickets.filter(t => t.status === 'Open').length;
  const inProgressCount = maintenanceTickets.filter(t => t.status === 'In Progress').length;
  const resolvedThisMonth = maintenanceTickets.filter(t => t.status === 'Resolved' && (t.resolvedAt || '').slice(0, 10) >= thisMonthStart).length;

  function selectItem(docId) {
    const item = activeItems.find(i => i._docId === docId);
    if (item) setTicketForm(f => ({ ...f, itemDocId: docId, itemId: item.itemId, itemDescription: item.description }));
    else setTicketForm(f => ({ ...f, itemDocId: '', itemId: '', itemDescription: '' }));
  }

  function selectVendorForTicket(docId) {
    const vendor = vendors.find(v => v._docId === docId);
    if (vendor) setTicketForm(f => ({ ...f, vendorId: docId, vendorName: vendor.name }));
    else setTicketForm(f => ({ ...f, vendorId: '', vendorName: '' }));
  }

  async function handleAddTicket() {
    if (!ticketForm.issue.trim()) return;
    setSaving(true);
    await addTicket({
      itemDocId: ticketForm.itemDocId,
      itemId: ticketForm.itemId,
      itemDescription: ticketForm.itemDescription,
      issue: ticketForm.issue.trim(),
      priority: ticketForm.priority,
      category: ticketForm.category,
      status: 'Open',
      assignedTo: ticketForm.assignedTo,
      estimatedCost: ticketForm.estimatedCost ? Number(ticketForm.estimatedCost) : null,
      actualCost: null,
      vendorId: ticketForm.vendorId,
      vendorName: ticketForm.vendorName,
      partsNeeded: ticketForm.partsNeeded,
      resolutionNotes: '',
      notes: ticketForm.notes,
    }, userId, userName);
    setShowAdd(false);
    setTicketForm(emptyTicket);
    setSaving(false);
    flash('Ticket created!');
  }

  async function handleUpdateTicket() {
    if (!showDetail) return;
    setSaving(true);
    await updateTicket(showDetail._docId, detailEdits);
    setShowDetail(null);
    setDetailEdits({});
    setSaving(false);
    flash('Ticket updated!');
  }

  async function handleAddVendor() {
    if (!vendorForm.name.trim()) return;
    setSaving(true);
    await addVendor({ ...vendorForm });
    setShowAddVendor(false);
    setVendorForm(emptyVendor);
    setSaving(false);
    flash('Vendor added!');
  }

  function openDetail(ticket) {
    setShowDetail(ticket);
    setDetailEdits({
      status: ticket.status,
      assignedTo: ticket.assignedTo || '',
      actualCost: ticket.actualCost || '',
      resolutionNotes: ticket.resolutionNotes || '',
      notes: ticket.notes || '',
      priority: ticket.priority,
    });
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ fontFamily:f1, fontSize:22, fontWeight:700, color:B.navy, margin:'0 0 2px' }}>Maintenance Hub</h2>
          <p style={{ color:B.textLight, fontSize:13, margin:0 }}>Track repair tickets and manage service vendors</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={() => setShowVendors(!showVendors)} style={{ ...btnS, fontSize:13, padding:'9px 18px' }}>
            {showVendors ? 'Hide Vendors' : `Vendors (${vendors.length})`}
          </button>
          <button onClick={() => { setTicketForm(emptyTicket); setShowAdd(true); }} style={btnP}>+ New Ticket</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:14, marginBottom:24 }}>
        <Stat label="Open" value={openCount} icon="🔴" color={B.red}/>
        <Stat label="In Progress" value={inProgressCount} icon="🔵" color="#1A65C7"/>
        <Stat label="Resolved This Month" value={resolvedThisMonth} icon="✅" color={B.teal}/>
        <Stat label="Total Vendors" value={vendors.length} icon="🏢"/>
      </div>

      {msg && <div style={{ background:B.tealPale, border:'1px solid '+B.teal, borderRadius:10, padding:'10px 16px', marginBottom:16, color:B.teal, fontWeight:600, fontSize:13, fontFamily:f1 }}>{msg}</div>}

      {/* Vendor Directory */}
      {showVendors && (
        <div style={{ background:B.white, borderRadius:14, padding:'20px 24px', border:'1px solid '+B.sand, marginBottom:20, boxShadow:'0 1px 3px rgba(27,42,74,0.06)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <h3 style={{ margin:0, fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Vendor Directory</h3>
            <button onClick={() => { setVendorForm(emptyVendor); setShowAddVendor(true); }} style={{ ...btnP, padding:'6px 14px', fontSize:12 }}>+ Add Vendor</button>
          </div>
          {vendors.length === 0 ? (
            <p style={{ color:B.textLight, fontSize:14 }}>No vendors yet. Add your service providers and contractors.</p>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:isMobile?'1fr':'repeat(auto-fill, minmax(260px, 1fr))', gap:10 }}>
              {vendors.map(v => (
                <div key={v._docId} style={{ padding:'14px 16px', borderRadius:10, background:B.warmGray, border:'1px solid '+B.sand }}>
                  <div style={{ fontWeight:600, fontSize:14, color:B.navy, marginBottom:4 }}>{v.name}</div>
                  {v.specialty && <div style={{ fontSize:12, color:B.teal, fontFamily:f1, marginBottom:4 }}>{v.specialty}</div>}
                  {v.phone && <div style={{ fontSize:12, color:B.textMid }}>📞 {v.phone}</div>}
                  {v.email && <div style={{ fontSize:12, color:B.textMid }}>✉️ {v.email}</div>}
                  {v.notes && <div style={{ fontSize:11, color:B.textLight, marginTop:4 }}>{v.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Status filter */}
      <div style={{ display:'flex', gap:6, marginBottom:18, flexWrap:'wrap' }}>
        {['all', ...STATUSES].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            style={{ padding:'7px 16px', borderRadius:20, border:'1px solid '+(statusFilter===s?B.teal:B.sand), background:statusFilter===s?'rgba(42,125,110,0.1)':B.white, color:statusFilter===s?B.teal:B.textMid, fontSize:13, fontWeight:600, fontFamily:f1, cursor:'pointer' }}>
            {s === 'all' ? 'All' : s}
            {s !== 'all' && <span style={{ marginLeft:5, fontSize:11, opacity:.7 }}>({maintenanceTickets.filter(t => t.status===s).length})</span>}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      {filtered.length === 0 ? (
        <div style={{ background:B.white, borderRadius:18, padding:'48px 32px', border:'1px solid '+B.sand, textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>🔧</div>
          <h3 style={{ fontFamily:f1, color:B.navy, margin:'0 0 8px', fontSize:18 }}>
            {maintenanceTickets.length === 0 ? 'No maintenance tickets yet' : 'No '+statusFilter.toLowerCase()+' tickets'}
          </h3>
          <p style={{ color:B.textLight, fontSize:14 }}>
            {maintenanceTickets.length === 0 ? 'Create a ticket to track repairs and maintenance.' : 'Try a different status filter.'}
          </p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map(ticket => (
            <div key={ticket._docId}
              onClick={() => openDetail(ticket)}
              style={{ background:B.white, borderRadius:14, padding:'16px 20px', border:'1px solid '+B.sand, cursor:'pointer', boxShadow:'0 1px 3px rgba(27,42,74,0.06)', transition:'box-shadow 0.15s', borderLeft:'4px solid '+(statusColors[ticket.status]?.dot || B.sand) }}
              onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 16px rgba(27,42,74,0.12)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow='0 1px 3px rgba(27,42,74,0.06)'}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
                    <span style={{ fontFamily:'monospace', fontSize:12, color:B.textLight }}>{ticket.ticketNumber}</span>
                    <StatusBadge status={ticket.status}/>
                    <PriorityBadge priority={ticket.priority}/>
                  </div>
                  <div style={{ fontWeight:600, fontSize:15, color:B.navy, marginBottom:4 }}>{ticket.issue}</div>
                  <div style={{ fontSize:12, color:B.textLight, display:'flex', gap:12, flexWrap:'wrap' }}>
                    {ticket.itemDescription && <span>📦 {ticket.itemDescription}</span>}
                    {ticket.assignedTo && <span>👤 {ticket.assignedTo}</span>}
                    {ticket.vendorName && <span>🏢 {ticket.vendorName}</span>}
                    <span>{ticket.category}</span>
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:12, color:B.textLight }}>{ticket.createdAt?.split('T')[0]}</div>
                  {ticket.reportedByName && <div style={{ fontSize:12, color:B.textMid }}>by {ticket.reportedByName}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ ADD TICKET MODAL ═══ */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Maintenance Ticket" wide>
        <FF label="Equipment (optional)">
          <select style={{ ...inp, cursor:'pointer' }} value={ticketForm.itemDocId} onChange={e => selectItem(e.target.value)}>
            <option value="">— Select item (optional) —</option>
            {activeItems.map(i => <option key={i._docId} value={i._docId}>{i.description} ({i.itemId})</option>)}
          </select>
        </FF>
        <FF label="Issue Description *">
          <textarea style={{ ...inp, minHeight:72, resize:'vertical' }} value={ticketForm.issue} onChange={e => setTicketForm(f => ({ ...f, issue:e.target.value }))} placeholder="Describe the problem or maintenance needed..."/>
        </FF>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <FF label="Priority">
            <select style={inp} value={ticketForm.priority} onChange={e => setTicketForm(f => ({ ...f, priority:e.target.value }))}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </FF>
          <FF label="Category">
            <select style={inp} value={ticketForm.category} onChange={e => setTicketForm(f => ({ ...f, category:e.target.value }))}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FF>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <FF label="Assigned To">
            <input style={inp} value={ticketForm.assignedTo} onChange={e => setTicketForm(f => ({ ...f, assignedTo:e.target.value }))} placeholder="Name or team"/>
          </FF>
          <FF label="Estimated Cost ($)">
            <input style={inp} type="number" min="0" step="0.01" value={ticketForm.estimatedCost} onChange={e => setTicketForm(f => ({ ...f, estimatedCost:e.target.value }))} placeholder="0.00"/>
          </FF>
        </div>
        {vendors.length > 0 && (
          <FF label="Vendor">
            <select style={{ ...inp, cursor:'pointer' }} value={ticketForm.vendorId} onChange={e => selectVendorForTicket(e.target.value)}>
              <option value="">— Select vendor (optional) —</option>
              {vendors.map(v => <option key={v._docId} value={v._docId}>{v.name}{v.specialty ? ' — '+v.specialty : ''}</option>)}
            </select>
          </FF>
        )}
        <FF label="Parts Needed">
          <input style={inp} value={ticketForm.partsNeeded} onChange={e => setTicketForm(f => ({ ...f, partsNeeded:e.target.value }))} placeholder="List any parts required..."/>
        </FF>
        <FF label="Notes">
          <textarea style={{ ...inp, minHeight:60, resize:'vertical' }} value={ticketForm.notes} onChange={e => setTicketForm(f => ({ ...f, notes:e.target.value }))} placeholder="Additional notes..."/>
        </FF>
        <button onClick={handleAddTicket} disabled={saving || !ticketForm.issue.trim()} style={{ ...btnP, width:'100%', opacity:(saving||!ticketForm.issue.trim())?.5:1, marginTop:4 }}>
          {saving ? 'Creating...' : 'Create Ticket'}
        </button>
      </Modal>

      {/* ═══ TICKET DETAIL MODAL ═══ */}
      <Modal open={!!showDetail} onClose={() => { setShowDetail(null); setDetailEdits({}); }} title={showDetail?.ticketNumber + ' — ' + (showDetail?.issue?.slice(0,40)||'Ticket')} wide>
        {showDetail && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:20 }}>
              <div>
                <div style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:'uppercase', fontFamily:f1 }}>Status</div>
                <div style={{ marginTop:6 }}>
                  <select style={{ ...inp, padding:'7px 12px' }} value={detailEdits.status} onChange={e => setDetailEdits(d => ({ ...d, status:e.target.value }))}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:'uppercase', fontFamily:f1 }}>Priority</div>
                <div style={{ marginTop:6 }}>
                  <select style={{ ...inp, padding:'7px 12px' }} value={detailEdits.priority} onChange={e => setDetailEdits(d => ({ ...d, priority:e.target.value }))}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ background:B.warmGray, borderRadius:10, padding:'14px 16px', marginBottom:16 }}>
              <div style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:'uppercase', fontFamily:f1, marginBottom:6 }}>Issue</div>
              <div style={{ fontSize:14, color:B.textDark, lineHeight:1.5 }}>{showDetail.issue}</div>
              {showDetail.itemDescription && (
                <div style={{ fontSize:13, color:B.textMid, marginTop:6 }}>Equipment: <strong>{showDetail.itemDescription}</strong> ({showDetail.itemId})</div>
              )}
              <div style={{ display:'flex', gap:10, marginTop:8, flexWrap:'wrap' }}>
                <span style={{ fontSize:12, color:B.textLight }}>Category: {showDetail.category}</span>
                {showDetail.vendorName && <span style={{ fontSize:12, color:B.textLight }}>Vendor: {showDetail.vendorName}</span>}
                {showDetail.partsNeeded && <span style={{ fontSize:12, color:B.textLight }}>Parts: {showDetail.partsNeeded}</span>}
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
              <FF label="Assigned To">
                <input style={inp} value={detailEdits.assignedTo} onChange={e => setDetailEdits(d => ({ ...d, assignedTo:e.target.value }))} placeholder="Name or team"/>
              </FF>
              <FF label="Actual Cost ($)">
                <input style={inp} type="number" min="0" step="0.01" value={detailEdits.actualCost} onChange={e => setDetailEdits(d => ({ ...d, actualCost:e.target.value }))} placeholder="0.00"/>
              </FF>
            </div>

            <FF label="Resolution Notes">
              <textarea style={{ ...inp, minHeight:72, resize:'vertical' }} value={detailEdits.resolutionNotes} onChange={e => setDetailEdits(d => ({ ...d, resolutionNotes:e.target.value }))} placeholder="What was done to resolve this?"/>
            </FF>
            <FF label="Notes">
              <textarea style={{ ...inp, minHeight:52, resize:'vertical' }} value={detailEdits.notes} onChange={e => setDetailEdits(d => ({ ...d, notes:e.target.value }))} placeholder="Additional notes..."/>
            </FF>

            <div style={{ fontSize:12, color:B.textLight, marginBottom:16 }}>
              Reported by <strong>{showDetail.reportedByName}</strong> on {showDetail.createdAt?.split('T')[0]}
              {showDetail.resolvedAt && <> · Resolved {showDetail.resolvedAt.split('T')[0]}</>}
            </div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', flexWrap:'wrap' }}>
              <button onClick={() => { setShowDetail(null); setDetailEdits({}); }} style={btnS}>Cancel</button>
              <button onClick={handleUpdateTicket} disabled={saving} style={{ ...btnP, opacity:saving?.5:1 }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══ ADD VENDOR MODAL ═══ */}
      <Modal open={showAddVendor} onClose={() => setShowAddVendor(false)} title="Add Vendor">
        <FF label="Vendor / Company Name *">
          <input style={inp} value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name:e.target.value }))} placeholder="e.g. Smith's HVAC"/>
        </FF>
        <FF label="Specialty">
          <input style={inp} value={vendorForm.specialty} onChange={e => setVendorForm(f => ({ ...f, specialty:e.target.value }))} placeholder="e.g. HVAC, Electrical, AV Systems"/>
        </FF>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <FF label="Phone">
            <input style={inp} value={vendorForm.phone} onChange={e => setVendorForm(f => ({ ...f, phone:e.target.value }))} placeholder="(555) 000-0000"/>
          </FF>
          <FF label="Email">
            <input style={inp} type="email" value={vendorForm.email} onChange={e => setVendorForm(f => ({ ...f, email:e.target.value }))} placeholder="contact@vendor.com"/>
          </FF>
        </div>
        <FF label="Notes">
          <textarea style={{ ...inp, minHeight:60, resize:'vertical' }} value={vendorForm.notes} onChange={e => setVendorForm(f => ({ ...f, notes:e.target.value }))} placeholder="Contract details, hours, etc."/>
        </FF>
        <button onClick={handleAddVendor} disabled={saving || !vendorForm.name.trim()} style={{ ...btnP, width:'100%', opacity:(saving||!vendorForm.name.trim())?.5:1, marginTop:4 }}>
          {saving ? 'Saving...' : 'Add Vendor'}
        </button>
      </Modal>
    </div>
  );
}
