import { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { collection, onSnapshot, query as fsQuery, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase.js';
import { MobileCtx } from '../../hooks/useMobile.js';
import { B, f1, f2, inp, btnP, btnS, btnD } from '../../components/brand/tokens.js';
import { Modal } from '../../components/primitives/Modal.jsx';
import { FF } from '../../components/primitives/FF.jsx';
import { Stat } from '../../components/primitives/Stat.jsx';
import { resizeImageForUpload } from '../../utils/imageResize.js';

const STATUSES = ['Backlog', 'Planning', 'In Progress', 'On Hold', 'Complete', 'Cancelled'];

function initials(name) {
  const parts = (name || '?').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
const PRIORITIES = ['High', 'Medium', 'Low'];

const priorityColors = {
  High:   { bg: '#FEE8E8', tx: B.red,      dot: '#E87171' },
  Medium: { bg: B.goldLight, tx: '#96750E', dot: B.gold },
  Low:    { bg: B.warmGray,  tx: B.textMid, dot: B.textLight },
};

const statusColors = {
  'Backlog':     { bg: B.warmGray,  tx: B.textMid,  dot: B.textLight },
  'Planning':    { bg: B.goldLight, tx: '#96750E',   dot: B.gold },
  'In Progress': { bg: '#E8F0FE',   tx: '#1A65C7',   dot: '#3B82F6' },
  'On Hold':     { bg: '#FEF3E8',   tx: '#9A5E10',   dot: '#F59E42' },
  'Complete':    { bg: B.tealPale,  tx: B.teal,      dot: B.tealLight },
  'Cancelled':   { bg: B.warmGray,  tx: B.textMid,   dot: B.textLight },
};

function PriorityBadge({ priority }) {
  const s = priorityColors[priority] || priorityColors.Medium;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, background:s.bg, color:s.tx, fontSize:11, fontWeight:700, fontFamily:f1 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:s.dot }}/>{priority}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = statusColors[status] || statusColors['Backlog'];
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, background:s.bg, color:s.tx, fontSize:11, fontWeight:700, fontFamily:f1 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:s.dot }}/>{status}
    </span>
  );
}

function TicketCard({ ticket, onClick, onDragStart }) {
  const sc = statusColors[ticket.status] || statusColors['Backlog'];
  const isOverdue = ticket.dueDate && new Date(ticket.dueDate) < new Date() && ticket.status !== 'Complete' && ticket.status !== 'Cancelled';
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart ? e => { e.dataTransfer.setData('ticketDocId', ticket._docId); e.dataTransfer.effectAllowed = 'move'; } : undefined}
      onClick={() => onClick(ticket)}
      style={{ background:B.white, borderRadius:12, padding:'14px 16px', border:'1px solid '+B.sand, cursor:onDragStart ? 'grab' : 'pointer', borderLeft:'4px solid '+sc.dot, boxShadow:'0 1px 3px rgba(27,42,74,0.06)', marginBottom:8, transition:'box-shadow 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 16px rgba(27,42,74,0.12)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow='0 1px 3px rgba(27,42,74,0.06)'}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
          {ticket.assignees?.length > 0
            ? ticket.assignees.slice(0,3).map((a, i) => (
                <div key={a.uid || i} title={a.name} style={{ width:22, height:22, borderRadius:'50%', background:B.teal, color:B.white, fontSize:9, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:f1 }}>
                  {initials(a.name)}
                </div>
              ))
            : <span style={{ fontSize:11, color:B.textLight, fontFamily:f1 }}>Unassigned</span>
          }
        </div>
        <PriorityBadge priority={ticket.priority}/>
      </div>
      <div style={{ fontWeight:600, fontSize:14, color:B.navy, marginBottom:4, lineHeight:1.3 }}>{ticket.name}</div>
      {ticket.description && (
        <div style={{ fontSize:12, color:B.textMid, lineHeight:1.4, marginBottom:6, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
          {ticket.description}
        </div>
      )}
      {ticket.tags?.length > 0 && (
        <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:6 }}>
          {ticket.tags.slice(0,4).map(tag => (
            <span key={tag} style={{ padding:'2px 8px', borderRadius:12, background:B.warmGray, color:B.textMid, fontSize:10, fontFamily:f1 }}>{tag}</span>
          ))}
        </div>
      )}
      {(ticket.photos?.length > 0 || ticket.dueDate) && (
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, alignItems:'center' }}>
          {ticket.photos?.length > 0 && <span style={{ fontSize:11, color:B.textLight }}>📷 {ticket.photos.length}</span>}
          {ticket.dueDate && <span style={{ fontSize:11, color: isOverdue ? B.red : B.textLight }}>📅 {ticket.dueDate}</span>}
        </div>
      )}
    </div>
  );
}

function TagInput({ tags = [], onChange, suggestions = [] }) {
  const [inputVal, setInputVal] = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const filtered = suggestions.filter(s => !tags.includes(s) && s.toLowerCase().includes(inputVal.toLowerCase()));

  function addTag(t) {
    const tag = t.trim().toLowerCase();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setInputVal('');
    setShowDrop(false);
  }
  function onKey(e) {
    if ((e.key === 'Enter' || e.key === ',') && inputVal.trim()) { e.preventDefault(); addTag(inputVal); }
    else if (e.key === 'Backspace' && !inputVal && tags.length) onChange(tags.slice(0, -1));
  }
  return (
    <div style={{ position:'relative' }}>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, padding:'7px 10px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, minHeight:42, alignItems:'center' }}>
        {tags.map(t => (
          <span key={t} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:12, background:B.tealPale, color:B.teal, fontSize:12, fontFamily:f1 }}>
            {t}
            <button onMouseDown={e => { e.preventDefault(); onChange(tags.filter(x => x !== t)); }} style={{ border:'none', background:'none', color:B.teal, cursor:'pointer', padding:'0 0 0 2px', fontSize:14, lineHeight:1 }}>×</button>
          </span>
        ))}
        <input
          value={inputVal}
          onChange={e => { setInputVal(e.target.value); setShowDrop(true); }}
          onKeyDown={onKey}
          onFocus={() => setShowDrop(true)}
          onBlur={() => setTimeout(() => setShowDrop(false), 150)}
          placeholder={tags.length ? '' : 'Type tag, press Enter...'}
          style={{ border:'none', outline:'none', fontSize:13, flex:1, minWidth:80, fontFamily:f2, color:B.textDark, background:'transparent' }}
        />
      </div>
      {showDrop && filtered.length > 0 && (
        <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:200, background:B.white, border:'1px solid '+B.sand, borderRadius:10, boxShadow:'0 4px 16px rgba(27,42,74,0.1)', maxHeight:130, overflowY:'auto', marginTop:2 }}>
          {filtered.map(s => (
            <div key={s} onMouseDown={() => addTag(s)} style={{ padding:'8px 14px', cursor:'pointer', fontSize:13, fontFamily:f2, color:B.textDark }}
              onMouseEnter={e => e.currentTarget.style.background=B.warmGray}
              onMouseLeave={e => e.currentTarget.style.background=''}
            >{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssigneeSelect({ assignees = [], onChange, users = [], currentUserId, currentUserName }) {
  const isSelf = assignees.some(a => a.uid === currentUserId);
  function toggle(user) {
    const ex = assignees.find(a => a.uid === user.id);
    if (ex) onChange(assignees.filter(a => a.uid !== user.id));
    else onChange([...assignees, { uid: user.id, name: user.name }]);
  }
  function toggleSelf() {
    if (isSelf) onChange(assignees.filter(a => a.uid !== currentUserId));
    else onChange([...assignees, { uid: currentUserId, name: currentUserName }]);
  }
  function pill(selected, label, onClick) {
    return (
      <button key={label} type="button" onClick={onClick} style={{ padding:'5px 12px', borderRadius:20, border:'1px solid '+(selected ? B.teal : B.sand), background:selected ? B.tealPale : B.white, color:selected ? B.teal : B.textMid, fontSize:12, fontFamily:f1, cursor:'pointer', fontWeight:600 }}>
        {selected ? '✓ ' : ''}{label}
      </button>
    );
  }
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
      {pill(isSelf, 'Me', toggleSelf)}
      {users.filter(u => u.active !== false && u.id !== currentUserId).map(u =>
        pill(assignees.some(a => a.uid === u.id), u.name, () => toggle(u))
      )}
    </div>
  );
}

function PhotoGrid({ photos = [], onAdd, onRemove, uploading }) {
  const fileRef = useRef();
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(90px, 1fr))', gap:8 }}>
        {photos.map((url, i) => (
          <div key={i} style={{ position:'relative', borderRadius:8, overflow:'hidden', aspectRatio:'1', background:B.warmGray }}>
            <img src={url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            {onRemove && (
              <button onClick={() => onRemove(i)} style={{ position:'absolute', top:3, right:3, width:20, height:20, borderRadius:'50%', background:'rgba(0,0,0,0.55)', border:'none', color:B.white, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>×</button>
            )}
          </div>
        ))}
        {onAdd && (
          <div
            onClick={() => !uploading && fileRef.current?.click()}
            style={{ borderRadius:8, border:'2px dashed '+B.sand, aspectRatio:'1', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:uploading ? 'wait' : 'pointer', background:B.warmGray, color:B.textLight, fontSize:11, gap:2 }}
          >
            {uploading ? '⏳' : <><span style={{ fontSize:22, lineHeight:1 }}>+</span>Photo</>}
          </div>
        )}
      </div>
      {onAdd && <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={e => { if (e.target.files?.length) onAdd(Array.from(e.target.files)); e.target.value = ''; }}/>}
    </div>
  );
}

function CommentThread({ comments, loading, newComment, onChange, onPost, posting }) {
  const endRef = useRef();
  useEffect(() => { if (comments.length) endRef.current?.scrollIntoView({ behavior:'smooth' }); }, [comments.length]);
  return (
    <div>
      <div style={{ maxHeight:200, overflowY:'auto', display:'flex', flexDirection:'column', gap:10, marginBottom:10, paddingRight:2 }}>
        {loading
          ? <div style={{ color:B.textLight, fontSize:13 }}>Loading...</div>
          : comments.length === 0
            ? <div style={{ color:B.textLight, fontSize:13 }}>No comments yet.</div>
            : comments.map(c => (
                <div key={c.id} style={{ background:B.warmGray, borderRadius:10, padding:'10px 14px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                    <span style={{ fontWeight:700, fontSize:13, color:B.navy, fontFamily:f1 }}>{c.authorName}</span>
                    <span style={{ fontSize:11, color:B.textLight }}>{c.createdAt ? (c.createdAt.slice(0,10) === new Date().toISOString().slice(0,10) ? new Date(c.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : c.createdAt.slice(0,10)) : ''}</span>
                  </div>
                  <div style={{ fontSize:13, color:B.textDark, lineHeight:1.5 }}>{c.text}</div>
                </div>
              ))
        }
        <div ref={endRef}/>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <input
          style={{ ...inp, flex:1 }}
          value={newComment}
          onChange={e => onChange(e.target.value)}
          placeholder="Add a comment..."
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && newComment.trim()) { e.preventDefault(); onPost(); } }}
        />
        <button onClick={onPost} disabled={posting || !newComment.trim()} style={{ ...btnP, padding:'11px 18px', opacity:(posting || !newComment.trim()) ? .5 : 1 }}>Post</button>
      </div>
    </div>
  );
}

function KanbanColumn({ status, tickets, onTicketClick, onDrop, isMobile }) {
  const sc = statusColors[status] || statusColors['Backlog'];
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onDragOver={onDrop ? e => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={onDrop ? () => setDragOver(false) : undefined}
      onDrop={onDrop ? e => { e.preventDefault(); setDragOver(false); const docId = e.dataTransfer.getData('ticketDocId'); if (docId) onDrop(docId); } : undefined}
      style={{ minWidth:isMobile ? '100%' : 260, maxWidth:isMobile ? '100%' : 280, flexShrink:0, background:dragOver ? B.tealPale : B.warmGray, borderRadius:14, padding:'12px 10px', border:'2px solid '+(dragOver ? B.teal : 'transparent'), transition:'background 0.15s, border-color 0.15s' }}
    >
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, paddingLeft:4 }}>
        <span style={{ width:10, height:10, borderRadius:'50%', background:sc.dot, flexShrink:0 }}/>
        <span style={{ fontWeight:700, fontSize:13, color:B.navy, fontFamily:f1 }}>{status}</span>
        <span style={{ marginLeft:'auto', background:B.white, borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:700, color:B.textMid, fontFamily:f1 }}>{tickets.length}</span>
      </div>
      <div style={{ overflowY:'auto', maxHeight:isMobile ? 'none' : 'calc(100vh - 380px)', minHeight:80 }}>
        {tickets.length === 0
          ? <div style={{ textAlign:'center', color:B.textLight, fontSize:12, padding:'16px 0', fontStyle:'italic' }}>Empty</div>
          : tickets.map(t => <TicketCard key={t._docId} ticket={t} onClick={onTicketClick} onDragStart={onDrop ? true : undefined}/>)
        }
      </div>
    </div>
  );
}

const getEmptyTicket = () => ({ name:'', description:'', priority:'Medium', tags:[], dueDate:'', assignees:[], linkedItemDocId:'', vendorId:'', estimatedCost:'', notes:'' });
const getEmptyVendor = () => ({ name:'', phone:'', email:'', specialty:'', notes:'' });

export function MaintenancePage({ store, userProfile }) {
  const { items, maintenanceTickets, vendors, users, settings, addTicket, updateTicket, deleteTicket, addTicketComment, addMaintenanceTags, addVendor, updateVendor, deleteVendor } = store;
  const isMobile = useContext(MobileCtx);

  const userId = userProfile?.id || userProfile?.uid;
  const userName = userProfile?.name || 'Unknown';
  const churchId = userProfile?.churchId;
  const isAdmin = userProfile?.role === 'admin';
  const isManager = userProfile?.role === 'manager';
  const canOperate = isAdmin || isManager;

  const activeItems = items.filter(i => i.status !== 'Disposed');
  const maintenanceTags = settings?.maintenanceTags || [];

  // ── State ──
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('maint_viewMode') || 'kanban');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterMyTickets, setFilterMyTickets] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showEditVendor, setShowEditVendor] = useState(null); // vendor object being edited
  const [showVendors, setShowVendors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [collapsedStatuses, setCollapsedStatuses] = useState(new Set());
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const [ticketForm, setTicketForm] = useState(getEmptyTicket);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [detailEdits, setDetailEdits] = useState({});
  const [vendorForm, setVendorForm] = useState(getEmptyVendor);

  // Comments
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  // Comments subscription — fires whenever a ticket detail is opened
  useEffect(() => {
    if (!showDetail?._docId || !churchId) { setComments([]); return; }
    setCommentsLoading(true);
    setComments([]);
    const q = fsQuery(
      collection(db, 'churches', churchId, 'maintenanceTickets', showDetail._docId, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setComments(snap.docs.map(d => ({ id:d.id, ...d.data() })));
      setCommentsLoading(false);
    }, () => setCommentsLoading(false));
    return unsub;
  }, [showDetail?._docId, churchId]);

  // ── Helpers ──
  function flash(text) { setMsg(text); setTimeout(() => setMsg(''), 3000); }

  function switchViewMode(mode) {
    setViewMode(mode);
    localStorage.setItem('maint_viewMode', mode);
  }

  function openDetail(ticket) {
    setShowDetail(ticket);
    setNewComment('');
    setDetailEdits({
      name: ticket.name || '',
      description: ticket.description || '',
      status: ticket.status || 'Backlog',
      priority: ticket.priority || 'Medium',
      tags: ticket.tags || [],
      dueDate: ticket.dueDate || '',
      assignees: ticket.assignees || [],
      linkedItemDocId: ticket.linkedItemDocId || '',
      vendorId: ticket.vendorId || '',
      estimatedCost: ticket.estimatedCost != null ? String(ticket.estimatedCost) : '',
      actualCost: ticket.actualCost != null ? String(ticket.actualCost) : '',
      notes: ticket.notes || '',
    });
  }

  async function uploadPhotos(docId, files) {
    const urls = [];
    for (const file of files) {
      const resized = await resizeImageForUpload(file);
      const storageRef = ref(storage, `churches/${churchId}/maintenance/${docId}/${Date.now()}_${file.name}`);
      const snap = await uploadBytes(storageRef, resized);
      urls.push(await getDownloadURL(snap.ref));
    }
    return urls;
  }

  // ── Handlers ──
  async function handleAddTicket() {
    if (!ticketForm.name.trim()) return;
    setSaving(true);
    try {
      const vendorName = ticketForm.vendorId ? (vendors.find(v => v._docId === ticketForm.vendorId)?.name || null) : null;
      const linkedItem = activeItems.find(i => i._docId === ticketForm.linkedItemDocId);
      const docId = await addTicket({
        name: ticketForm.name.trim(),
        description: ticketForm.description.trim(),
        priority: ticketForm.priority,
        status: 'Backlog',
        tags: ticketForm.tags,
        dueDate: ticketForm.dueDate || null,
        assignees: ticketForm.assignees,
        photos: [],
        linkedItemDocId: ticketForm.linkedItemDocId || null,
        linkedItemId: linkedItem?.itemId || null,
        linkedItemDescription: linkedItem?.description || null,
        vendorId: ticketForm.vendorId || null,
        vendorName,
        estimatedCost: ticketForm.estimatedCost ? Number(ticketForm.estimatedCost) : null,
        actualCost: null,
        completedAt: null,
      }, userId, userName);
      if (photoFiles.length > 0 && docId) {
        try {
          const urls = await uploadPhotos(docId, photoFiles);
          await updateTicket(docId, { photos: urls });
        } catch (err) { flash('Photo upload failed — ticket saved without photos.'); }
      }
      if (ticketForm.tags.length > 0 && addMaintenanceTags) {
        await addMaintenanceTags(ticketForm.tags);
      }
      setShowAdd(false);
      setTicketForm(getEmptyTicket());
      setPhotoFiles([]);
      setPhotoPreviews([]);
      flash('Ticket created!');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateTicket() {
    if (!showDetail) return;
    setSaving(true);
    try {
      const vendorName = detailEdits.vendorId ? (vendors.find(v => v._docId === detailEdits.vendorId)?.name || null) : null;
      const linkedItem = activeItems.find(i => i._docId === detailEdits.linkedItemDocId);
      const wasComplete = showDetail.status === 'Complete';
      const isNowComplete = detailEdits.status === 'Complete';
      const updates = {
        ...detailEdits,
        vendorName,
        vendorId: detailEdits.vendorId || null,
        linkedItemDocId: detailEdits.linkedItemDocId || null,
        linkedItemId: linkedItem?.itemId || null,
        linkedItemDescription: linkedItem?.description || null,
        estimatedCost: detailEdits.estimatedCost ? Number(detailEdits.estimatedCost) : null,
        actualCost: detailEdits.actualCost ? Number(detailEdits.actualCost) : null,
        completedAt: isNowComplete && !wasComplete ? new Date().toISOString() : (isNowComplete ? showDetail.completedAt : null),
      };
      await updateTicket(showDetail._docId, updates);
      if (detailEdits.tags?.length > 0 && addMaintenanceTags) {
        await addMaintenanceTags(detailEdits.tags);
      }
      setShowDetail(null);
      setDetailEdits({});
      flash('Ticket updated!');
    } finally {
      setSaving(false);
    }
  }

  async function handlePostComment() {
    if (!newComment.trim() || !showDetail?._docId) return;
    setPostingComment(true);
    try {
      await addTicketComment(showDetail._docId, newComment.trim(), userId, userName);
      setNewComment('');
    } finally {
      setPostingComment(false);
    }
  }

  async function handleDetailPhotoAdd(files) {
    if (!showDetail?._docId) return;
    setUploadingPhotos(true);
    try {
      const newUrls = await uploadPhotos(showDetail._docId, files);
      const updatedPhotos = [...(showDetail.photos || []), ...newUrls];
      await updateTicket(showDetail._docId, { photos: updatedPhotos });
      setShowDetail(prev => ({ ...prev, photos: updatedPhotos }));
    } finally {
      setUploadingPhotos(false);
    }
  }

  async function handleDetailPhotoRemove(index) {
    if (!showDetail?._docId) return;
    const updatedPhotos = (showDetail.photos || []).filter((_, i) => i !== index);
    await updateTicket(showDetail._docId, { photos: updatedPhotos });
    setShowDetail(prev => ({ ...prev, photos: updatedPhotos }));
  }

  function handlePhotoSelect(files) {
    setPhotoFiles(prev => [...prev, ...files]);
    setPhotoPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
  }

  function handlePreviewRemove(index) {
    setPhotoFiles(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  }

  async function handleAddVendor() {
    if (!vendorForm.name.trim()) return;
    setSaving(true);
    await addVendor({ ...vendorForm });
    setShowAddVendor(false);
    setVendorForm(getEmptyVendor());
    setSaving(false);
    flash('Vendor added!');
  }

  async function handleUpdateVendor() {
    if (!showEditVendor || !vendorForm.name.trim()) return;
    setSaving(true);
    const { _docId, createdAt, ...rest } = showEditVendor;
    await updateVendor(_docId, { ...rest, ...vendorForm });
    setShowEditVendor(null);
    setVendorForm(getEmptyVendor());
    setSaving(false);
    flash('Vendor updated!');
  }

  async function handleDeleteVendor(vendor) {
    if (!window.confirm(`Delete "${vendor.name}"? This cannot be undone.`)) return;
    await deleteVendor(vendor._docId);
    flash('Vendor deleted.');
  }

  async function handleDrop(docId, newStatus) {
    const ticket = maintenanceTickets.find(t => t._docId === docId);
    if (!ticket || ticket.status === newStatus) return;
    const wasComplete = ticket.status === 'Complete';
    const isNowComplete = newStatus === 'Complete';
    await updateTicket(docId, {
      status: newStatus,
      completedAt: isNowComplete && !wasComplete ? new Date().toISOString() : (isNowComplete ? ticket.completedAt : null),
    });
  }

  async function handleDeleteTicket() {
    if (!showDetail?._docId) return;
    if (!window.confirm(`Delete "${showDetail.name}"? This cannot be undone.`)) return;
    await deleteTicket(showDetail._docId);
    setShowDetail(null);
    setDetailEdits({});
    flash('Ticket deleted.');
  }

  function toggleCollapse(status) {
    setCollapsedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  // ── Stats ──
  const thisMonthStart = new Date().toISOString().slice(0, 7) + '-01';
  const today = new Date();
  const openCount = maintenanceTickets.filter(t => t.status !== 'Complete' && t.status !== 'Cancelled').length;
  const inProgressCount = maintenanceTickets.filter(t => t.status === 'In Progress').length;
  const completedThisMonth = maintenanceTickets.filter(t => t.status === 'Complete' && (t.completedAt || '').slice(0, 10) >= thisMonthStart).length;
  const overdueCount = maintenanceTickets.filter(t => t.dueDate && new Date(t.dueDate) < today && t.status !== 'Complete' && t.status !== 'Cancelled').length;

  // ── Filtered tickets ──
  const filteredTickets = useMemo(() => {
    const search = filterSearch.toLowerCase();
    return maintenanceTickets.filter(t => {
      if (filterPriority && t.priority !== filterPriority) return false;
      if (filterMyTickets && !t.assignees?.some(a => a.uid === userId)) return false;
      if (search && !t.name?.toLowerCase().includes(search) && !t.description?.toLowerCase().includes(search) && !t.tags?.some(tag => tag.includes(search))) return false;
      return true;
    });
  }, [maintenanceTickets, filterSearch, filterPriority, filterMyTickets, userId]);

  // ── Render ──
  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ fontFamily:f1, fontSize:22, fontWeight:700, color:B.navy, margin:'0 0 2px' }}>Maintenance Hub</h2>
          <p style={{ color:B.textLight, fontSize:13, margin:0 }}>Track repair tickets and manage service vendors</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {canOperate && (
            <button onClick={() => setShowVendors(v => !v)} style={{ ...btnS, fontSize:13, padding:'9px 18px' }}>
              {showVendors ? 'Hide Vendors' : `Vendors (${vendors.length})`}
            </button>
          )}
          {canOperate && (
            <button onClick={() => { setTicketForm(getEmptyTicket()); setPhotoFiles([]); setPhotoPreviews([]); setShowAdd(true); }} style={btnP}>
              + New Ticket
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:20 }}>
        {[
          { label:'Open', value:openCount, icon:'📋', color:B.textMid },
          { label:'In Progress', value:inProgressCount, icon:'🔵', color:'#1A65C7' },
          { label:'Completed This Month', value:completedThisMonth, icon:'✅', color:B.teal },
          { label:'Overdue', value:overdueCount, icon:'⚠️', color:overdueCount > 0 ? B.red : B.textMid },
        ].map(s => (
          <div key={s.label} style={{ background:B.white, borderRadius:10, padding:'10px 16px', border:'1px solid '+B.sand, display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:15 }}>{s.icon}</span>
            <span style={{ fontSize:20, fontWeight:700, color:s.color, fontFamily:f1 }}>{s.value}</span>
            <span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:'uppercase', letterSpacing:0.8, fontFamily:f1 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {msg && (
        <div style={{ background:B.tealPale, border:'1px solid '+B.teal, borderRadius:10, padding:'10px 16px', marginBottom:16, color:B.teal, fontWeight:600, fontSize:13, fontFamily:f1 }}>{msg}</div>
      )}

      {/* Vendor Directory */}
      {showVendors && (
        <div style={{ background:B.white, borderRadius:14, padding:'20px 24px', border:'1px solid '+B.sand, marginBottom:20, boxShadow:'0 1px 3px rgba(27,42,74,0.06)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <h3 style={{ margin:0, fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Vendor Directory</h3>
            {canOperate && <button onClick={() => { setVendorForm(getEmptyVendor()); setShowAddVendor(true); }} style={{ ...btnP, padding:'6px 14px', fontSize:12 }}>+ Add Vendor</button>}
          </div>
          {vendors.length === 0
            ? <p style={{ color:B.textLight, fontSize:14 }}>No vendors yet. Add your service providers and contractors.</p>
            : (
              <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap:10 }}>
                {vendors.map(v => (
                  <div key={v._docId} style={{ padding:'14px 16px', borderRadius:10, background:B.warmGray, border:'1px solid '+B.sand }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                      <div style={{ fontWeight:600, fontSize:14, color:B.navy }}>{v.name}</div>
                      {canOperate && <div style={{ display:'flex', gap:6, flexShrink:0, marginLeft:8 }}>
                        <button onClick={() => { setVendorForm({ name:v.name||'', phone:v.phone||'', email:v.email||'', specialty:v.specialty||'', notes:v.notes||'' }); setShowEditVendor(v); }} style={{ border:'none', background:'none', cursor:'pointer', fontSize:13, color:B.textLight, padding:'2px 4px' }} title="Edit">✏️</button>
                        <button onClick={() => handleDeleteVendor(v)} style={{ border:'none', background:'none', cursor:'pointer', fontSize:13, color:B.textLight, padding:'2px 4px' }} title="Delete">🗑️</button>
                      </div>}
                    </div>
                    {v.specialty && <div style={{ fontSize:12, color:B.teal, fontFamily:f1, marginBottom:4 }}>{v.specialty}</div>}
                    {v.phone && <div style={{ fontSize:12, color:B.textMid }}>📞 {v.phone}</div>}
                    {v.email && <div style={{ fontSize:12, color:B.textMid }}>✉️ {v.email}</div>}
                    {v.notes && <div style={{ fontSize:11, color:B.textLight, marginTop:4 }}>{v.notes}</div>}
                  </div>
                ))}
              </div>
            )
          }
        </div>
      )}

      {/* Filter Bar */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
        <input
          style={{ ...inp, flex:1, minWidth:160, maxWidth:280 }}
          placeholder="Search tickets..."
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
        />
        <select style={{ ...inp, width:'auto', cursor:'pointer' }} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setFilterMyTickets(v => !v)}
          style={{ padding:'9px 14px', borderRadius:10, border:'1px solid '+(filterMyTickets ? B.teal : B.sand), background:filterMyTickets ? B.tealPale : B.white, color:filterMyTickets ? B.teal : B.textMid, fontSize:13, fontFamily:f1, cursor:'pointer', fontWeight:filterMyTickets ? 700 : 500, whiteSpace:'nowrap' }}
        >
          My tickets
        </button>
        {(filterSearch || filterPriority || filterMyTickets) && (
          <button type="button" onClick={() => { setFilterSearch(''); setFilterPriority(''); setFilterMyTickets(false); }} style={{ padding:'9px 12px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, color:B.textMid, fontSize:13, cursor:'pointer' }}>Clear</button>
        )}
      </div>

      {/* View Toggle */}
      <div style={{ display:'flex', gap:8, marginBottom:18, alignItems:'center' }}>
        <div style={{ display:'flex', background:B.warmGray, borderRadius:10, padding:3 }}>
          {[['kanban', 'Kanban'], ['list', 'List']].map(([mode, label]) => (
            <button key={mode} onClick={() => switchViewMode(mode)} style={{ padding:'7px 18px', borderRadius:8, border:'none', background:viewMode===mode ? B.white : 'transparent', color:viewMode===mode ? B.navy : B.textMid, fontWeight:viewMode===mode ? 700 : 500, fontSize:13, fontFamily:f1, cursor:'pointer', boxShadow:viewMode===mode ? '0 1px 3px rgba(27,42,74,0.1)' : 'none', transition:'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>
        <span style={{ color:B.textLight, fontSize:13, marginLeft:4 }}>
          {filteredTickets.length}{filteredTickets.length !== maintenanceTickets.length ? ` of ${maintenanceTickets.length}` : ''} ticket{maintenanceTickets.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Empty state — no tickets at all */}
      {maintenanceTickets.length === 0 && (
        <div style={{ background:B.white, borderRadius:18, padding:'48px 32px', border:'1px solid '+B.sand, textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>🔧</div>
          <h3 style={{ fontFamily:f1, color:B.navy, margin:'0 0 8px', fontSize:18 }}>No maintenance tickets yet</h3>
          <p style={{ color:B.textLight, fontSize:14 }}>Create a ticket to track repairs and maintenance tasks.</p>
        </div>
      )}

      {/* Empty state — My Tickets filter active but no assigned tickets */}
      {filterMyTickets && filteredTickets.length === 0 && maintenanceTickets.length > 0 && (
        <div style={{ background:B.white, borderRadius:14, padding:'32px 24px', border:'1px solid '+B.sand, textAlign:'center', marginBottom:16 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>👤</div>
          <h3 style={{ fontFamily:f1, color:B.navy, margin:'0 0 6px', fontSize:16 }}>No tickets assigned to you</h3>
          <p style={{ color:B.textLight, fontSize:13, margin:'0 0 12px' }}>Open any ticket and click <strong>Me</strong> in the Assignees field, then save to assign yourself.</p>
          <button type="button" onClick={() => setFilterMyTickets(false)} style={{ padding:'8px 18px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, color:B.teal, fontSize:13, fontFamily:f1, cursor:'pointer', fontWeight:600 }}>
            Show all tickets
          </button>
        </div>
      )}

      {/* Kanban View */}
      {viewMode === 'kanban' && maintenanceTickets.length > 0 && (
        <div style={{ display:'flex', gap:12, overflowX:isMobile ? 'hidden' : 'auto', flexDirection:isMobile ? 'column' : 'row', paddingBottom:8, alignItems:'flex-start' }}>
          {STATUSES.map(status => (
            <KanbanColumn key={status} status={status} tickets={filteredTickets.filter(t => t.status === status)} onTicketClick={openDetail} onDrop={canOperate ? docId => handleDrop(docId, status) : undefined} isMobile={isMobile}/>
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && maintenanceTickets.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {STATUSES.map(status => {
            const tickets = filteredTickets.filter(t => t.status === status);
            const collapsed = collapsedStatuses.has(status);
            const sc = statusColors[status];
            return (
              <div key={status} style={{ background:B.white, borderRadius:14, border:'1px solid '+B.sand, overflow:'hidden' }}>
                <div onClick={() => toggleCollapse(status)} style={{ display:'flex', alignItems:'center', gap:10, padding:'13px 20px', cursor:'pointer', background:B.warmGray, userSelect:'none' }}>
                  <span style={{ width:10, height:10, borderRadius:'50%', background:sc.dot, flexShrink:0 }}/>
                  <span style={{ fontWeight:700, fontSize:14, color:B.navy, fontFamily:f1 }}>{status}</span>
                  <span style={{ background:B.white, borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:700, color:B.textMid, fontFamily:f1 }}>{tickets.length}</span>
                  <span style={{ marginLeft:'auto', color:B.textLight, fontSize:14, display:'inline-block', transform:collapsed ? 'rotate(-90deg)' : 'none', transition:'transform 0.2s' }}>▼</span>
                </div>
                {!collapsed && (
                  <div style={{ padding:'12px 16px 4px' }}>
                    {tickets.length === 0
                      ? <div style={{ color:B.textLight, fontSize:13, textAlign:'center', padding:'12px 0' }}>No tickets in {status}</div>
                      : tickets.map(t => <TicketCard key={t._docId} ticket={t} onClick={openDetail}/>)
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ ADD TICKET MODAL ═══ */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setPhotoFiles([]); setPhotoPreviews([]); }} title="New Maintenance Ticket" wide>
        <FF label="Ticket Name *">
          <input style={inp} value={ticketForm.name} onChange={e => setTicketForm(f => ({ ...f, name:e.target.value }))} placeholder="Short descriptive name..."/>
        </FF>
        <FF label="Description">
          <textarea style={{ ...inp, minHeight:72, resize:'vertical' }} value={ticketForm.description} onChange={e => setTicketForm(f => ({ ...f, description:e.target.value }))} placeholder="Full details of the issue or maintenance needed..."/>
        </FF>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <FF label="Priority">
            <select style={{ ...inp, cursor:'pointer' }} value={ticketForm.priority} onChange={e => setTicketForm(f => ({ ...f, priority:e.target.value }))}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </FF>
          <FF label="Due Date">
            <input style={inp} type="date" value={ticketForm.dueDate} onChange={e => setTicketForm(f => ({ ...f, dueDate:e.target.value }))}/>
          </FF>
        </div>
        <FF label="Tags">
          <TagInput tags={ticketForm.tags} onChange={tags => setTicketForm(f => ({ ...f, tags }))} suggestions={maintenanceTags}/>
        </FF>
        <FF label="Assignees">
          <AssigneeSelect assignees={ticketForm.assignees} onChange={assignees => setTicketForm(f => ({ ...f, assignees }))} users={users} currentUserId={userId} currentUserName={userName}/>
        </FF>
        <FF label="Linked Equipment (optional)">
          <select style={{ ...inp, cursor:'pointer' }} value={ticketForm.linkedItemDocId} onChange={e => setTicketForm(f => ({ ...f, linkedItemDocId:e.target.value }))}>
            <option value="">— None —</option>
            {activeItems.map(i => <option key={i._docId} value={i._docId}>{i.description} ({i.itemId})</option>)}
          </select>
        </FF>
        <div style={{ display:'grid', gridTemplateColumns:vendors.length > 0 ? '1fr 1fr' : '1fr', gap:12 }}>
          {vendors.length > 0 && (
            <FF label="Vendor">
              <select style={{ ...inp, cursor:'pointer' }} value={ticketForm.vendorId} onChange={e => setTicketForm(f => ({ ...f, vendorId:e.target.value }))}>
                <option value="">— None —</option>
                {vendors.map(v => <option key={v._docId} value={v._docId}>{v.name}{v.specialty ? ' — '+v.specialty : ''}</option>)}
              </select>
            </FF>
          )}
          <FF label="Estimated Cost ($)">
            <input style={inp} type="number" min="0" step="0.01" value={ticketForm.estimatedCost} onChange={e => setTicketForm(f => ({ ...f, estimatedCost:e.target.value }))} placeholder="0.00"/>
          </FF>
        </div>
        <FF label="Photos">
          <PhotoGrid photos={photoPreviews} onAdd={handlePhotoSelect} onRemove={handlePreviewRemove} uploading={false}/>
        </FF>
        <FF label="Notes">
          <textarea style={{ ...inp, minHeight:52, resize:'vertical' }} value={ticketForm.notes} onChange={e => setTicketForm(f => ({ ...f, notes:e.target.value }))} placeholder="Additional notes..."/>
        </FF>
        <button onClick={handleAddTicket} disabled={saving || !ticketForm.name.trim()} style={{ ...btnP, width:'100%', opacity:(saving || !ticketForm.name.trim()) ? .5 : 1, marginTop:4 }}>
          {saving ? 'Creating...' : 'Create Ticket'}
        </button>
      </Modal>

      {/* ═══ TICKET DETAIL MODAL ═══ */}
      <Modal open={!!showDetail} onClose={() => { setShowDetail(null); setDetailEdits({}); setComments([]); }} title={(showDetail?.ticketNumber || '') + (showDetail?.name ? ' — ' + showDetail.name.slice(0, 40) : '')} wide>
        {showDetail && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <FF label="Status">
                <select style={{ ...inp, cursor:'pointer' }} value={detailEdits.status} onChange={e => setDetailEdits(d => ({ ...d, status:e.target.value }))}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FF>
              <FF label="Priority">
                <select style={{ ...inp, cursor:'pointer' }} value={detailEdits.priority} onChange={e => setDetailEdits(d => ({ ...d, priority:e.target.value }))}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </FF>
            </div>
            <FF label="Name">
              <input style={inp} value={detailEdits.name} onChange={e => setDetailEdits(d => ({ ...d, name:e.target.value }))}/>
            </FF>
            <FF label="Description">
              <textarea style={{ ...inp, minHeight:72, resize:'vertical' }} value={detailEdits.description} onChange={e => setDetailEdits(d => ({ ...d, description:e.target.value }))} placeholder="Full details..."/>
            </FF>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <FF label="Due Date">
                <input style={inp} type="date" value={detailEdits.dueDate} onChange={e => setDetailEdits(d => ({ ...d, dueDate:e.target.value }))}/>
              </FF>
              <FF label="Actual Cost ($)">
                <input style={inp} type="number" min="0" step="0.01" value={detailEdits.actualCost} onChange={e => setDetailEdits(d => ({ ...d, actualCost:e.target.value }))} placeholder="0.00"/>
              </FF>
            </div>
            <FF label="Tags">
              <TagInput tags={detailEdits.tags || []} onChange={tags => setDetailEdits(d => ({ ...d, tags }))} suggestions={maintenanceTags}/>
            </FF>
            <FF label="Assignees">
              <AssigneeSelect assignees={detailEdits.assignees || []} onChange={assignees => setDetailEdits(d => ({ ...d, assignees }))} users={users} currentUserId={userId} currentUserName={userName}/>
            </FF>
            <FF label="Linked Equipment">
              <select style={{ ...inp, cursor:'pointer' }} value={detailEdits.linkedItemDocId} onChange={e => setDetailEdits(d => ({ ...d, linkedItemDocId:e.target.value }))}>
                <option value="">— None —</option>
                {activeItems.map(i => <option key={i._docId} value={i._docId}>{i.description} ({i.itemId})</option>)}
              </select>
            </FF>
            <div style={{ display:'grid', gridTemplateColumns:vendors.length > 0 ? '1fr 1fr' : '1fr', gap:12 }}>
              {vendors.length > 0 && (
                <FF label="Vendor">
                  <select style={{ ...inp, cursor:'pointer' }} value={detailEdits.vendorId} onChange={e => setDetailEdits(d => ({ ...d, vendorId:e.target.value }))}>
                    <option value="">— None —</option>
                    {vendors.map(v => <option key={v._docId} value={v._docId}>{v.name}</option>)}
                  </select>
                </FF>
              )}
              <FF label="Estimated Cost ($)">
                <input style={inp} type="number" min="0" step="0.01" value={detailEdits.estimatedCost} onChange={e => setDetailEdits(d => ({ ...d, estimatedCost:e.target.value }))} placeholder="0.00"/>
              </FF>
            </div>
            <FF label="Notes">
              <textarea style={{ ...inp, minHeight:52, resize:'vertical' }} value={detailEdits.notes} onChange={e => setDetailEdits(d => ({ ...d, notes:e.target.value }))} placeholder="Additional notes..."/>
            </FF>
            <div style={{ display:'flex', gap:10, justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', marginBottom:20 }}>
              <div style={{ fontSize:12, color:B.textLight }}>
                Created by <strong>{showDetail.createdByName || showDetail.reportedByName}</strong> on {showDetail.createdAt?.split('T')[0]}
                {showDetail.completedAt && <> · Completed {showDetail.completedAt.split('T')[0]}</>}
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button onClick={handleDeleteTicket} style={{ ...btnD, fontSize:13, padding:'9px 14px' }}>Delete</button>
                <button onClick={() => { setShowDetail(null); setDetailEdits({}); }} style={btnS}>Cancel</button>
                <button onClick={handleUpdateTicket} disabled={saving || !detailEdits.name?.trim()} style={{ ...btnP, opacity:(saving || !detailEdits.name?.trim()) ? .5 : 1 }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>

            {/* Photos */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontWeight:700, fontSize:12, color:B.textMid, fontFamily:f1, textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>Photos</div>
              <PhotoGrid photos={showDetail.photos || []} onAdd={handleDetailPhotoAdd} onRemove={handleDetailPhotoRemove} uploading={uploadingPhotos}/>
            </div>

            {/* Comments */}
            <div>
              <div style={{ fontWeight:700, fontSize:12, color:B.textMid, fontFamily:f1, textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>Comments</div>
              <CommentThread comments={comments} loading={commentsLoading} newComment={newComment} onChange={setNewComment} onPost={handlePostComment} posting={postingComment}/>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══ EDIT VENDOR MODAL ═══ */}
      <Modal open={!!showEditVendor} onClose={() => { setShowEditVendor(null); setVendorForm(getEmptyVendor()); }} title="Edit Vendor">
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
        <button onClick={handleUpdateVendor} disabled={saving || !vendorForm.name.trim()} style={{ ...btnP, width:'100%', opacity:(saving || !vendorForm.name.trim()) ? .5 : 1, marginTop:4 }}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
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
        <button onClick={handleAddVendor} disabled={saving || !vendorForm.name.trim()} style={{ ...btnP, width:'100%', opacity:(saving || !vendorForm.name.trim()) ? .5 : 1, marginTop:4 }}>
          {saving ? 'Saving...' : 'Add Vendor'}
        </button>
      </Modal>
    </div>
  );
}
