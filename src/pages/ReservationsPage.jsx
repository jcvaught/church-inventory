import { useState, useMemo } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { B, f1, f2, inp, btnP, btnS, btnD } from '../components/brand/tokens.js';
import { Modal } from '../components/primitives/Modal.jsx';
import { FF } from '../components/primitives/FF.jsx';
import { Stat } from '../components/primitives/Stat.jsx';
import { useConfirm } from '../components/primitives/ConfirmDialog.jsx';
import { exportReservationsCSV } from '../utils/csv.js';
import { ITEM_STATUS, RES_STATUS, RESOURCE_TYPE } from '../utils/constants.js';
import { localDateStr, generateRecurrenceDates } from '../utils/date.js';

export function ReservationsPage({ store, userProfile }) {
  const { items, settings, reservations, users, rooms, notificationConfig, config, addReservation, updateReservation, checkOutItem, logActivity } = store;
  const activeItems = useMemo(() => items.filter(i => i.status !== ITEM_STATUS.DISPOSED), [items]);
  const activeRooms = useMemo(() => (rooms || []).filter(r => r.active !== false), [rooms]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const { confirm, ConfirmHost } = useConfirm();

  const userId = userProfile?.id || userProfile?.uid;
  const userName = userProfile?.name || "Unknown";
  const isAdmin = userProfile?.role === "admin";
  const isManager = userProfile?.role === "manager";
  const managedMinistries = userProfile?.managedMinistries || [];
  const ministries = settings?.ministries || [];

  function canApproveReservation(r) {
    if (isAdmin) return true;
    if (isManager && r.ministry && managedMinistries.includes(r.ministry)) return true;
    return false;
  }

  const [resourceType, setResourceType] = useState(() => localStorage.getItem('res_resourceType') || RESOURCE_TYPE.ITEM);
  function setResourceTypePersisted(val) { setResourceType(val); localStorage.setItem('res_resourceType', val); }
  const emptyRes = { itemDocId:"", itemId:"", itemDesc:"", roomDocId:"", roomName:"", eventName:"", eventDate:"", returnDate:"", purpose:"", ministry:"", notes:"" };
  const [form, setForm] = useState(emptyRes);
  const [conflictErr, setConflictErr] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [recurrenceFreq, setRecurrenceFreq] = useState("weekly");
  const [recurrenceEnd, setRecurrenceEnd] = useState("");

  function flash(text, isError = false) { setMsg({ text, isError }); setTimeout(() => setMsg(null), 5000); }

  const statusMap = {
    Pending:   { bg:"#FFF8E1", tx:"#96750E", dt:B.gold,    icon:"⏳" },
    Approved:  { bg:B.tealPale, tx:B.teal,    dt:B.tealLight, icon:"✅" },
    Denied:    { bg:B.redPale,  tx:B.red,     dt:"#E87171",  icon:"❌" },
    "Checked Out": { bg:"#E8F0FE", tx:"#1A65C7", dt:"#3B82F6", icon:"📤" },
    Returned:  { bg:B.warmGray, tx:B.textMid, dt:B.textLight, icon:"↩️" },
    Cancelled: { bg:B.warmGray, tx:B.textLight, dt:B.sand,   icon:"🚫" },
  };

  function ResBadge({ status }) {
    const s = statusMap[status] || statusMap.Pending;
    return <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 12px", borderRadius:20, fontSize:12, fontWeight:600, fontFamily:f1, background:s.bg, color:s.tx }}>{s.icon} {status}</span>;
  }

  const filtered = useMemo(() =>
    reservations
      .filter(r => statusFilter === "all" || r.status === statusFilter)
      .sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||"")),
    [reservations, statusFilter]
  );

  async function sendReservationEmail(requesterEmail, requesterName, status, params) {
    if (!(notificationConfig?.enabled) || !requesterEmail) return;
    try {
      const fn = httpsCallable(getFunctions(), 'sendReservationEmail');
      await fn({ toEmail: requesterEmail, toName: requesterName, status, churchName: config?.churchName || '', ...params });
    } catch { /* non-blocking */ }
  }

  async function handleAdd() {
    const isRoom = resourceType === RESOURCE_TYPE.ROOM;
    if (isRoom ? !form.roomDocId : !form.itemDocId) return;
    if (!form.eventName.trim() || !form.eventDate) return;
    if (form.returnDate && new Date(form.returnDate) < new Date(form.eventDate)) { setConflictErr("Return date cannot be before the event date."); return; }
    setConflictErr("");
    const aStart = form.eventDate;
    const aEnd = form.returnDate || form.eventDate;
    const conflict = reservations.find(r => {
      const sameResource = isRoom ? r.roomDocId === form.roomDocId : r.itemDocId === form.itemDocId;
      if (!sameResource) return false;
      if (r.status !== RES_STATUS.PENDING && r.status !== RES_STATUS.APPROVED) return false;
      const bStart = r.eventDate;
      const bEnd = r.returnDate || r.eventDate;
      return aStart <= bEnd && aEnd >= bStart;
    });
    if (conflict) {
      const resourceLabel = isRoom ? `this space` : `this item`;
      setConflictErr(`Conflict: "${conflict.eventName}" (${conflict.status}) already has ${resourceLabel} on ${conflict.eventDate}${conflict.returnDate && conflict.returnDate !== conflict.eventDate ? " – "+conflict.returnDate : ""}. Pick a different ${isRoom ? 'space' : 'item'} or date.`);
      return;
    }
    setSaving(true);
    try {
      const baseRes = isRoom ? {
        resourceType: RESOURCE_TYPE.ROOM,
        roomDocId: form.roomDocId,
        roomName: form.roomName,
        eventName: form.eventName,
        eventDate: form.eventDate,
        returnDate: form.returnDate,
        purpose: form.purpose,
        ministry: form.ministry,
        notes: form.notes,
      } : {
        resourceType: RESOURCE_TYPE.ITEM,
        itemDocId: form.itemDocId,
        itemId: form.itemId,
        itemDesc: form.itemDesc,
        eventName: form.eventName,
        eventDate: form.eventDate,
        returnDate: form.returnDate,
        purpose: form.purpose,
        ministry: form.ministry,
        notes: form.notes,
      };
      if (recurring && recurrenceEnd && recurrenceEnd > form.eventDate) {
        const retOffset = form.returnDate
          ? (new Date(form.returnDate + 'T00:00:00') - new Date(form.eventDate + 'T00:00:00'))
          : 0;
        const allEventDates = generateRecurrenceDates(form.eventDate, recurrenceFreq, recurrenceEnd);
        const allDates = allEventDates.map(evDate => ({
          eventDate: evDate,
          returnDate: form.returnDate ? localDateStr(new Date(new Date(evDate + 'T00:00:00').getTime() + retOffset)) : '',
        }));
        const extraDates = allDates.slice(1);
        for (const d of allDates) {
          const dStart = d.eventDate;
          const dEnd = d.returnDate || d.eventDate;
          const seriesConflict = reservations.find(r => {
            const sameResource = isRoom ? r.roomDocId === form.roomDocId : r.itemDocId === form.itemDocId;
            if (!sameResource) return false;
            if (r.status !== RES_STATUS.PENDING && r.status !== RES_STATUS.APPROVED) return false;
            const bStart = r.eventDate;
            const bEnd = r.returnDate || r.eventDate;
            return dStart <= bEnd && dEnd >= bStart;
          });
          if (seriesConflict) {
            setConflictErr(`Conflict on ${d.eventDate}: "${seriesConflict.eventName}" (${seriesConflict.status}) already has this ${isRoom ? 'space' : 'item'}. Adjust the series dates.`);
            setSaving(false);
            return;
          }
        }
        const groupId = crypto.randomUUID();
        await addReservation({ ...baseRes, recurrenceGroupId: groupId, recurrenceFreq }, userId, userName);
        for (const d of extraDates) {
          await addReservation({ ...baseRes, eventDate: d.eventDate, returnDate: d.returnDate, recurrenceGroupId: groupId, recurrenceFreq }, userId, userName);
        }
        flash(`Reservation series created (${allDates.length} occurrences)!`);
      } else {
        await addReservation(baseRes, userId, userName);
        flash("Reservation requested!");
      }
      setForm(emptyRes);
      setRecurring(false);
      setRecurrenceEnd("");
      setShowAdd(false);
    } catch(e) {
      flash("Error: "+e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(res) {
    setSaving(true);
    await updateReservation(res._docId, { status:RES_STATUS.APPROVED, approvedBy:userId, approvedByName:userName, approvedAt:new Date().toISOString() });
    await logActivity("reservation_approved", res.itemId || res.roomDocId, userId, userName, { eventName:res.eventName, requestedBy:res.requestedByName });
    const requester = (users||[]).find(u => u.id === res.requestedBy);
    sendReservationEmail(requester?.email, res.requestedByName, 'approved', {
      eventName: res.eventName, resourceDesc: res.itemDesc || res.roomName || '',
      eventDate: formatDate(res.eventDate), actionBy: userName,
    });
    flash("Reservation approved!");
    setShowDetail(null);
    setSaving(false);
  }

  async function handleDeny(res) {
    setSaving(true);
    await updateReservation(res._docId, { status:RES_STATUS.DENIED, deniedBy:userId, deniedByName:userName, deniedAt:new Date().toISOString() });
    await logActivity("reservation_denied", res.itemId || res.roomDocId, userId, userName, { eventName:res.eventName, requestedBy:res.requestedByName });
    const requester = (users||[]).find(u => u.id === res.requestedBy);
    sendReservationEmail(requester?.email, res.requestedByName, 'denied', {
      eventName: res.eventName, resourceDesc: res.itemDesc || res.roomName || '',
      eventDate: formatDate(res.eventDate), actionBy: userName,
    });
    flash("Reservation denied.");
    setShowDetail(null);
    setSaving(false);
  }

  async function handleCancel(res) {
    setSaving(true);
    await updateReservation(res._docId, { status:RES_STATUS.CANCELLED });
    flash("Reservation cancelled.");
    setShowDetail(null);
    setSaving(false);
  }

  async function handleMarkRoomComplete(res) {
    setSaving(true);
    await updateReservation(res._docId, { status: RES_STATUS.RETURNED });
    flash("Space reservation marked as complete.");
    setShowDetail(null);
    setSaving(false);
  }

  async function handleCheckOutFromRes(res) {
    if (res.resourceType === RESOURCE_TYPE.ROOM) return;
    const currentItem = items.find(i => i._docId === res.itemDocId);
    if (currentItem && currentItem.status !== ITEM_STATUS.AVAILABLE) {
      flash(`Item is currently "${currentItem.status}" and cannot be checked out.`);
      return;
    }
    setSaving(true);
    try {
      await checkOutItem(res.itemDocId, {
        itemId: res.itemId,
        person: res.requestedByName,
        purpose: res.purpose || res.eventName,
        ministry: res.ministry,
        date: localDateStr(new Date()),
        returnDate: res.returnDate || res.eventDate,
      }, userId, userName);
      await updateReservation(res._docId, { status:RES_STATUS.CHECKED_OUT, checkedOutAt:new Date().toISOString() });
      flash("Item checked out from reservation!");
      setShowDetail(null);
    } catch(e) { flash("Error: "+e.message); }
    setSaving(false);
  }

  function handleSelectItem(docId) {
    const item = activeItems.find(i => i._docId === docId);
    if (item) setForm(f => ({ ...f, itemDocId:docId, itemId:item.itemId, itemDesc:item.description }));
  }

  function formatDate(d) {
    if (!d) return "—";
    return new Date(d+"T00:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
  }

  const today = localDateStr(new Date());
  const pending = reservations.filter(r => r.status === RES_STATUS.PENDING);
  const approved = reservations.filter(r => r.status === RES_STATUS.APPROVED);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <h2 style={{ fontFamily:f1, fontSize:22, fontWeight:700, color:B.navy, margin:0 }}>Reservations</h2>
        <div style={{ display:"flex", gap:8 }}>
          {reservations.length > 0 && <button aria-label="Export reservations as CSV" onClick={()=>exportReservationsCSV(reservations)} style={{ ...btnS, fontSize:13, padding:"9px 18px" }}>⬇ Export CSV</button>}
          <button onClick={()=>{setForm(emptyRes);setRecurring(false);setRecurrenceEnd("");setShowAdd(true);}} style={btnP}>+ New Reservation</button>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginBottom:20 }}>
        <Stat label="Pending" value={pending.length} icon="⏳" color="#96750E"/>
        <Stat label="Approved" value={approved.length} icon="✅" color={B.teal}/>
        <Stat label="Total" value={reservations.length} icon="📅"/>
      </div>

      {/* Success message */}
      {msg && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:msg.isError?'#FEE8E8':B.tealPale, border:`1px solid ${msg.isError?'#FECACA':B.tealLight}`, borderRadius:10, padding:"10px 16px", marginBottom:16, fontSize:14, fontWeight:600, color:msg.isError?B.red:B.teal }}>
          <span>{msg.text}</span>
          <button onClick={()=>setMsg(null)} style={{ border:'none', background:'none', cursor:'pointer', color:'inherit', fontSize:16, lineHeight:1, marginLeft:8, padding:'0 2px', fontWeight:700 }}>&times;</button>
        </div>
      )}

      {/* Filter — Audit 2026-05-24 Phase 3 (item 8): bumped to 44px min
          height to meet WCAG 2.1 SC 2.5.5 / Apple HIG mobile touch target. */}
      <div style={{ display:"flex", gap:6, marginBottom:18, flexWrap:"wrap" }}>
        {["all","Pending","Approved","Denied","Checked Out","Returned","Cancelled"].map(s => (
          <button key={s} onClick={()=>setStatusFilter(s)}
            style={{ minHeight:44, padding:"10px 18px", borderRadius:22, border:"1px solid "+(statusFilter===s?B.teal:B.sand), background:statusFilter===s?"rgba(42,125,110,0.1)":B.white, color:statusFilter===s?B.teal:B.textMid, fontSize:13, fontWeight:600, fontFamily:f1, cursor:"pointer" }}>
            {s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      {/* Reservation Cards */}
      {filtered.length === 0 ? (
        <div style={{ background:B.white, borderRadius:18, padding:"48px 32px", border:"1px solid "+B.sand, textAlign:"center" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📅</div>
          <p style={{ color:B.textLight, fontSize:15 }}>{statusFilter === "all" ? (isAdmin || isManager ? "No reservations yet. Create one to get started!" : "No reservations yet.") : "No "+statusFilter.toLowerCase()+" reservations."}</p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {filtered.map(r => {
            const isPast = r.eventDate && r.eventDate < today;
            return (
              <div key={r._docId} onClick={()=>setShowDetail(r)} role="button" tabIndex={0} aria-label={`${r.eventName} — ${r.status}`} onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();setShowDetail(r);}}} style={{ background:B.white, borderRadius:14, padding:"18px 22px", border:"1px solid "+B.sand, cursor:"pointer", boxShadow:"0 1px 3px rgba(27,42,74,0.06)", transition:"box-shadow 0.15s", borderLeft:"4px solid "+(statusMap[r.status]?.dt || B.sand) }}
                onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(27,42,74,0.12)"}
                onMouseLeave={e=>e.currentTarget.style.boxShadow="0 1px 3px rgba(27,42,74,0.06)"}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8 }}>
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, flexWrap:"wrap" }}>
                      <span style={{ fontWeight:700, fontSize:16, fontFamily:f1, color:B.navy }}>{r.eventName}</span>
                      <ResBadge status={r.status}/>
                      {r.recurrenceGroupId && <span style={{ fontSize:11, color:B.textLight, fontWeight:600, background:B.warmGray, padding:"2px 8px", borderRadius:20 }}>🔁 recurring</span>}
                    </div>
                    <div style={{ fontSize:14, color:B.textMid }}>
                      {r.resourceType === RESOURCE_TYPE.ROOM
                        ? <><span style={{ fontSize:12, background:B.tealPale, color:B.teal, borderRadius:20, padding:"1px 8px", fontWeight:700, fontFamily:f1, marginRight:6 }}>🏛️ Space</span><span style={{ fontWeight:600 }}>{r.roomName}</span></>
                        : <><span style={{ fontWeight:600 }}>{r.itemDesc}</span><span style={{ color:B.textLight, marginLeft:6 }}>({r.itemId})</span></>
                      }
                    </div>
                    <div style={{ fontSize:13, color:B.textLight, marginTop:4 }}>
                      Requested by <span style={{ fontWeight:600, color:B.textMid }}>{r.requestedByName}</span>
                      {r.ministry && <> · {r.ministry}</>}
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:14, fontWeight:600, color: isPast&&r.status===RES_STATUS.PENDING ? B.red : B.navy }}>
                      {formatDate(r.eventDate)}
                    </div>
                    {r.returnDate && <div style={{ fontSize:12, color:B.textLight }}>Return: {formatDate(r.returnDate)}</div>}
                    {isPast && r.status === RES_STATUS.PENDING && <div style={{ fontSize:11, color:B.red, fontWeight:600, marginTop:2 }}>Event date passed!</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ ADD RESERVATION MODAL ═══ */}
      <Modal open={showAdd} onClose={()=>{setShowAdd(false);setConflictErr("");}} title="New Reservation" wide>
        {/* Resource type toggle */}
        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          {[['item','📦 Equipment'], ['room','🏛️ Space']].map(([val, label]) => (
            <button key={val} onClick={() => { setResourceTypePersisted(val); setForm(f => ({ ...f, itemDocId:'', itemId:'', itemDesc:'', roomDocId:'', roomName:'' })); setConflictErr(''); }}
              style={{ flex:1, padding:"9px 0", borderRadius:10, border:"1px solid "+(resourceType===val ? B.teal : B.sand), background:resourceType===val ? B.tealPale : B.white, color:resourceType===val ? B.teal : B.textMid, fontFamily:f1, fontWeight:700, fontSize:13, cursor:"pointer" }}>
              {label}
            </button>
          ))}
        </div>
        {resourceType === RESOURCE_TYPE.ROOM ? (
          <FF label="Space" required>
            {activeRooms.length === 0 ? (
              <div style={{ fontSize:13, color:B.textLight, fontFamily:f2, padding:'10px 12px', background:B.warmGray, borderRadius:8 }}>No spaces defined yet. Add spaces in Settings → Spaces.</div>
            ) : (
              <select autoFocus style={{...inp, cursor:"pointer"}} value={form.roomDocId} onChange={e => {
                const room = activeRooms.find(r => r._docId === e.target.value);
                setForm(f => ({ ...f, roomDocId: e.target.value, roomName: room?.name || '' }));
              }}>
                <option value="">Select a space...</option>
                {activeRooms.map(r => <option key={r._docId} value={r._docId}>{r.name}{r.capacity ? ` (cap. ${r.capacity})` : ''}{r.location ? ` — ${r.location}` : ''}</option>)}
              </select>
            )}
            {form.roomDocId && (() => { const rm = activeRooms.find(r => r._docId === form.roomDocId); return rm?.amenities?.length ? <div style={{ fontSize:12, color:B.textLight, marginTop:4, fontFamily:f2 }}>Amenities: {rm.amenities.join(', ')}</div> : null; })()}
          </FF>
        ) : (
          <FF label="Equipment" required>
            <select autoFocus style={{...inp, cursor:"pointer"}} value={form.itemDocId} onChange={e=>handleSelectItem(e.target.value)}>
              <option value="">Select an item...</option>
              {activeItems.map(i => <option key={i._docId} value={i._docId}>{i.description} ({i.itemId}) — {i.status}</option>)}
            </select>
          </FF>
        )}
        <div style={{ display:"flex", gap:14 }}>
          <div style={{ flex:1 }}><FF label="Event / Purpose" required><input style={inp} value={form.eventName} onChange={e=>setForm(f=>({...f, eventName:e.target.value}))} placeholder="e.g. Youth Lock-In"/></FF></div>
          <div style={{ flex:1 }}><FF label="Ministry"><select style={{...inp, cursor:"pointer"}} value={form.ministry} onChange={e=>setForm(f=>({...f, ministry:e.target.value}))}>
            <option value="">—</option>
            {ministries.map(m => <option key={m} value={m}>{m}</option>)}
          </select></FF></div>
        </div>
        <div style={{ display:"flex", gap:14 }}>
          <div style={{ flex:1 }}><FF label="Event Date" required><input type="date" style={inp} value={form.eventDate} onChange={e=>setForm(f=>({...f, eventDate:e.target.value}))}/></FF></div>
          <div style={{ flex:1 }}><FF label="Expected Return"><input type="date" style={inp} value={form.returnDate} onChange={e=>setForm(f=>({...f, returnDate:e.target.value}))}/></FF></div>
        </div>
        {/* Recurring */}
        <div style={{ marginBottom:16 }}>
          <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", marginBottom:recurring?12:0 }}>
            <input type="checkbox" checked={recurring} onChange={e=>{setRecurring(e.target.checked);if(!e.target.checked)setRecurrenceEnd("");}} style={{ width:16, height:16, cursor:"pointer" }}/>
            <span style={{ fontSize:14, color:B.textDark, fontWeight:500 }}>Repeat this reservation</span>
          </label>
          {recurring && (
            <div style={{ display:"flex", gap:14, paddingLeft:26 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:600, color:B.textMid, marginBottom:6, fontFamily:f1 }}>Frequency</div>
                <select style={{...inp, cursor:"pointer"}} value={recurrenceFreq} onChange={e=>setRecurrenceFreq(e.target.value)}>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:600, color:B.textMid, marginBottom:6, fontFamily:f1 }}>Repeat until *</div>
                <input type="date" style={inp} value={recurrenceEnd} min={form.eventDate||undefined} onChange={e=>setRecurrenceEnd(e.target.value)}/>
              </div>
            </div>
          )}
          {recurring && recurrenceEnd && recurrenceEnd > form.eventDate && (() => {
            const count = generateRecurrenceDates(form.eventDate, recurrenceFreq, recurrenceEnd).length;
            return <div style={{ marginTop:8, paddingLeft:26, fontSize:13, color:B.teal, fontWeight:600 }}>→ {count} reservation{count!==1?"s":""} will be created</div>;
          })()}
        </div>
        <FF label="Additional Notes">
          <textarea style={{...inp, minHeight:60, resize:"vertical"}} value={form.notes} onChange={e=>setForm(f=>({...f, notes:e.target.value}))} placeholder="Any special requirements..."/>
        </FF>
        {conflictErr && (
          <div style={{ background:B.redPale, border:"1px solid #FECACA", borderRadius:10, padding:"10px 14px", marginBottom:12, fontSize:13, color:B.red, fontWeight:500 }}>
            {conflictErr}
          </div>
        )}
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
          <button onClick={()=>{setShowAdd(false);setConflictErr("");setRecurring(false);setRecurrenceEnd("");}} style={btnS}>Cancel</button>
          <button onClick={handleAdd} disabled={saving||(resourceType===RESOURCE_TYPE.ROOM?!form.roomDocId:!form.itemDocId)||!form.eventName.trim()||!form.eventDate} style={{ ...btnP, opacity:((resourceType===RESOURCE_TYPE.ROOM?!form.roomDocId:!form.itemDocId)||!form.eventName.trim()||!form.eventDate||saving)?.5:1 }}>
            {saving?"Submitting...":"Submit Request"}
          </button>
        </div>
      </Modal>

      {/* ═══ DETAIL / ACTION MODAL ═══ */}
      <Modal open={!!showDetail} onClose={()=>setShowDetail(null)} title="Reservation Details" wide>
        {showDetail && (() => {
          const r = showDetail;
          return <>
            <div style={{ display:"flex", gap:20, flexWrap:"wrap", marginBottom:20 }}>
              <div style={{ flex:"1 1 220px" }}>
                <div style={{ fontSize:12, fontWeight:600, color:B.textLight, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>{r.resourceType === RESOURCE_TYPE.ROOM ? 'Space' : 'Equipment'}</div>
                <div style={{ fontSize:16, fontWeight:600, color:B.navy }}>{r.resourceType === RESOURCE_TYPE.ROOM ? r.roomName : r.itemDesc}</div>
                {r.resourceType !== RESOURCE_TYPE.ROOM && <div style={{ fontSize:13, color:B.textLight, fontFamily:"monospace" }}>{r.itemId}</div>}
              </div>
              <div style={{ flex:"1 1 220px" }}>
                <div style={{ fontSize:12, fontWeight:600, color:B.textLight, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Status</div>
                <ResBadge status={r.status}/>
              </div>
            </div>
            <div style={{ display:"flex", gap:20, flexWrap:"wrap", marginBottom:20 }}>
              <div style={{ flex:"1 1 200px" }}>
                <div style={{ fontSize:12, fontWeight:600, color:B.textLight, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Event</div>
                <div style={{ fontSize:15, fontWeight:600 }}>{r.eventName}</div>
                {r.purpose && <div style={{ fontSize:13, color:B.textMid }}>{r.purpose}</div>}
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:B.textLight, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Event Date</div>
                <div style={{ fontSize:15, fontWeight:600 }}>{formatDate(r.eventDate)}</div>
              </div>
              {r.returnDate && <div>
                <div style={{ fontSize:12, fontWeight:600, color:B.textLight, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Return By</div>
                <div style={{ fontSize:15, fontWeight:600 }}>{formatDate(r.returnDate)}</div>
              </div>}
            </div>
            <div style={{ display:"flex", gap:20, flexWrap:"wrap", marginBottom:20 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:B.textLight, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Requested By</div>
                <div style={{ fontSize:14, fontWeight:600 }}>{r.requestedByName}</div>
              </div>
              {r.ministry && <div>
                <div style={{ fontSize:12, fontWeight:600, color:B.textLight, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Ministry</div>
                <div style={{ fontSize:14 }}>{r.ministry}</div>
              </div>}
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:B.textLight, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Submitted</div>
                <div style={{ fontSize:13, color:B.textMid }}>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</div>
              </div>
            </div>
            {r.notes && (
              <div style={{ background:B.warmGray, borderRadius:10, padding:"12px 16px", marginBottom:20, fontSize:14, color:B.textMid }}>
                <div style={{ fontSize:12, fontWeight:600, color:B.textLight, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:4 }}>Notes</div>
                {r.notes}
              </div>
            )}
            {r.status === RES_STATUS.APPROVED && r.approvedByName && (
              <div style={{ background:B.tealPale, borderRadius:10, padding:"10px 16px", marginBottom:20, fontSize:13 }}>
                Approved by <span style={{ fontWeight:600 }}>{r.approvedByName}</span> on {r.approvedAt ? new Date(r.approvedAt).toLocaleDateString() : "—"}
              </div>
            )}
            {r.status === RES_STATUS.DENIED && r.deniedByName && (
              <div style={{ background:B.redPale, borderRadius:10, padding:"10px 16px", marginBottom:20, fontSize:13 }}>
                Denied by <span style={{ fontWeight:600 }}>{r.deniedByName}</span> on {r.deniedAt ? new Date(r.deniedAt).toLocaleDateString() : "—"}
              </div>
            )}
            {/* Actions */}
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", flexWrap:"wrap" }}>
              {r.status === RES_STATUS.PENDING && (r.requestedBy === userId || isAdmin) && (
                <button onClick={async ()=>{
                  if (!await confirm({ title: 'Cancel request?', message: 'Cancel this reservation request?', confirmLabel: 'Cancel request', danger: true })) return;
                  handleCancel(r);
                }} disabled={saving} style={{ ...btnS, color:B.red, borderColor:"#FECACA" }}>Cancel Request</button>
              )}
              {r.status === RES_STATUS.PENDING && canApproveReservation(r) && <>
                <button onClick={async ()=>{
                  if (!await confirm({ title: 'Deny request?', message: 'Deny this reservation request?', confirmLabel: 'Deny', danger: true })) return;
                  handleDeny(r);
                }} disabled={saving} style={btnD}>Deny</button>
                <button onClick={()=>handleApprove(r)} disabled={saving} style={btnP}>Approve</button>
              </>}
              {r.status === RES_STATUS.APPROVED && r.resourceType !== RESOURCE_TYPE.ROOM && canApproveReservation(r) && (
                <button onClick={()=>handleCheckOutFromRes(r)} disabled={saving} style={{ ...btnP, background:"#1A65C7" }}>Check Out Now</button>
              )}
              {r.status === RES_STATUS.APPROVED && r.resourceType === RESOURCE_TYPE.ROOM && canApproveReservation(r) && (
                <button onClick={async ()=>{
                  if (!await confirm({ title: 'Mark complete?', message: 'Mark this space booking as complete?', confirmLabel: 'Mark complete' })) return;
                  handleMarkRoomComplete(r);
                }} disabled={saving} style={btnP}>Mark Complete</button>
              )}
            </div>
          </>;
        })()}
      </Modal>
      <ConfirmHost />
    </div>
  );
}
