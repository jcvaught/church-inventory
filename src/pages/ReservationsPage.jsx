import { useState } from 'react';
import { B, f1, f2, inp, btnP, btnS, btnD } from '../components/brand/tokens.js';
import { Modal } from '../components/primitives/Modal.jsx';
import { FF } from '../components/primitives/FF.jsx';
import { Stat } from '../components/primitives/Stat.jsx';
import { exportReservationsCSV } from '../utils/csv.js';

export function ReservationsPage({ store, userProfile }) {
  const { items, settings, reservations, users, notificationConfig, config, addReservation, updateReservation, checkOutItem, logActivity } = store;
  const activeItems = items.filter(i => i.status !== "Disposed");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const userId = userProfile?.id || userProfile?.uid;
  const userName = userProfile?.name || "Unknown";
  const isAdmin = userProfile?.role === "admin";
  const ministries = settings?.ministries || [];

  const emptyRes = { itemDocId:"", itemId:"", itemDesc:"", eventName:"", eventDate:"", returnDate:"", purpose:"", ministry:"", notes:"" };
  const [form, setForm] = useState(emptyRes);
  const [conflictErr, setConflictErr] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [recurrenceFreq, setRecurrenceFreq] = useState("weekly");
  const [recurrenceEnd, setRecurrenceEnd] = useState("");

  function flash(text) { setMsg(text); setTimeout(()=>setMsg(""), 3000); }

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

  const filtered = reservations.filter(r => statusFilter === "all" || r.status === statusFilter)
    .sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||""));

  async function sendNotificationEmail(templateId, requesterEmail, requesterName, params) {
    const nc = notificationConfig || {};
    if (!nc.enabled || !nc.serviceId || !nc.publicKey || !templateId || !requesterEmail) return;
    try {
      const emailjs = await import('@emailjs/browser');
      await emailjs.send(nc.serviceId, templateId, {
        to_email: requesterEmail,
        to_name: requesterName,
        church_name: config?.churchName || '',
        ...params,
      }, { publicKey: nc.publicKey });
    } catch(e) { console.error('EmailJS:', e); }
  }

  function generateRecurrenceDates(startDate, returnDate, freq, endDate) {
    const dates = [];
    const current = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    const retOffset = returnDate ? (new Date(returnDate + 'T00:00:00') - new Date(startDate + 'T00:00:00')) : 0;
    while (true) {
      if (freq === 'weekly') current.setDate(current.getDate() + 7);
      else if (freq === 'biweekly') current.setDate(current.getDate() + 14);
      else if (freq === 'monthly') current.setMonth(current.getMonth() + 1);
      if (current > end) break;
      const ev = current.toISOString().split('T')[0];
      const ret = returnDate ? new Date(current.getTime() + retOffset).toISOString().split('T')[0] : '';
      dates.push({ eventDate: ev, returnDate: ret });
    }
    return dates;
  }

  async function handleAdd() {
    if (!form.itemDocId || !form.eventName.trim() || !form.eventDate) return;
    if (form.returnDate && form.returnDate < form.eventDate) { setConflictErr("Return date cannot be before the event date."); return; }
    setConflictErr("");
    const aStart = form.eventDate;
    const aEnd = form.returnDate || form.eventDate;
    const conflict = reservations.find(r => {
      if (r.itemDocId !== form.itemDocId) return false;
      if (r.status !== "Pending" && r.status !== "Approved") return false;
      const bStart = r.eventDate;
      const bEnd = r.returnDate || r.eventDate;
      return aStart <= bEnd && aEnd >= bStart;
    });
    if (conflict) {
      setConflictErr(`Conflict: "${conflict.eventName}" (${conflict.status}) already has this item on ${conflict.eventDate}${conflict.returnDate && conflict.returnDate !== conflict.eventDate ? " – "+conflict.returnDate : ""}. Pick a different item or date.`);
      return;
    }
    setSaving(true);
    try {
      const baseRes = {
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
        const groupId = crypto.randomUUID();
        const extraDates = generateRecurrenceDates(form.eventDate, form.returnDate, recurrenceFreq, recurrenceEnd);
        await addReservation({ ...baseRes, recurrenceGroupId: groupId, recurrenceFreq }, userId, userName);
        for (const d of extraDates) {
          await addReservation({ ...baseRes, eventDate: d.eventDate, returnDate: d.returnDate, recurrenceGroupId: groupId, recurrenceFreq }, userId, userName);
        }
        flash(`Reservation series created (${1 + extraDates.length} occurrences)!`);
      } else {
        await addReservation(baseRes, userId, userName);
        flash("Reservation requested!");
      }
      setForm(emptyRes);
      setRecurring(false);
      setRecurrenceEnd("");
      setShowAdd(false);
    } catch(e) { flash("Error: "+e.message); }
    setSaving(false);
  }

  async function handleApprove(res) {
    setSaving(true);
    await updateReservation(res._docId, { status:"Approved", approvedBy:userId, approvedByName:userName, approvedAt:new Date().toISOString() });
    await logActivity("reservation_approved", res.itemId, userId, userName, { eventName:res.eventName, requestedBy:res.requestedByName });
    const requester = (users||[]).find(u => u.id === res.requestedBy);
    sendNotificationEmail(notificationConfig?.templateApproved, requester?.email, res.requestedByName, {
      event_name: res.eventName, item_desc: res.itemDesc,
      event_date: formatDate(res.eventDate), action_by: userName, status: 'approved',
    });
    flash("Reservation approved!");
    setShowDetail(null);
    setSaving(false);
  }

  async function handleDeny(res) {
    setSaving(true);
    await updateReservation(res._docId, { status:"Denied", deniedBy:userId, deniedByName:userName, deniedAt:new Date().toISOString() });
    await logActivity("reservation_denied", res.itemId, userId, userName, { eventName:res.eventName, requestedBy:res.requestedByName });
    const requester = (users||[]).find(u => u.id === res.requestedBy);
    sendNotificationEmail(notificationConfig?.templateDenied, requester?.email, res.requestedByName, {
      event_name: res.eventName, item_desc: res.itemDesc,
      event_date: formatDate(res.eventDate), action_by: userName, status: 'denied',
    });
    flash("Reservation denied.");
    setShowDetail(null);
    setSaving(false);
  }

  async function handleCancel(res) {
    setSaving(true);
    await updateReservation(res._docId, { status:"Cancelled" });
    flash("Reservation cancelled.");
    setShowDetail(null);
    setSaving(false);
  }

  async function handleCheckOutFromRes(res) {
    setSaving(true);
    try {
      await checkOutItem(res.itemDocId, {
        itemId: res.itemId,
        person: res.requestedByName,
        purpose: res.purpose || res.eventName,
        ministry: res.ministry,
        date: new Date().toISOString().split("T")[0],
        returnDate: res.returnDate || res.eventDate,
      }, userId, userName);
      await updateReservation(res._docId, { status:"Checked Out", checkedOutAt:new Date().toISOString() });
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

  const pending = reservations.filter(r => r.status === "Pending");
  const approved = reservations.filter(r => r.status === "Approved");

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <h2 style={{ fontFamily:f1, fontSize:22, fontWeight:700, color:B.navy, margin:0 }}>Reservations</h2>
        <div style={{ display:"flex", gap:8 }}>
          {reservations.length > 0 && <button onClick={()=>exportReservationsCSV(reservations)} style={{ ...btnS, fontSize:13, padding:"9px 18px" }}>⬇ Export CSV</button>}
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
        <div style={{ background:B.tealPale, border:"1px solid "+B.tealLight, borderRadius:10, padding:"10px 16px", marginBottom:16, fontSize:14, fontWeight:600, color:B.teal }}>{msg}</div>
      )}

      {/* Filter */}
      <div style={{ display:"flex", gap:6, marginBottom:18, flexWrap:"wrap" }}>
        {["all","Pending","Approved","Denied","Checked Out","Returned","Cancelled"].map(s => (
          <button key={s} onClick={()=>setStatusFilter(s)}
            style={{ padding:"7px 16px", borderRadius:20, border:"1px solid "+(statusFilter===s?B.teal:B.sand), background:statusFilter===s?"rgba(42,125,110,0.1)":B.white, color:statusFilter===s?B.teal:B.textMid, fontSize:13, fontWeight:600, fontFamily:f1, cursor:"pointer" }}>
            {s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      {/* Reservation Cards */}
      {filtered.length === 0 ? (
        <div style={{ background:B.white, borderRadius:18, padding:"48px 32px", border:"1px solid "+B.sand, textAlign:"center" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📅</div>
          <p style={{ color:B.textLight, fontSize:15 }}>{statusFilter === "all" ? "No reservations yet. Create one to get started!" : "No "+statusFilter.toLowerCase()+" reservations."}</p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {filtered.map(r => {
            const isPast = r.eventDate && r.eventDate < new Date().toISOString().split("T")[0];
            return (
              <div key={r._docId} onClick={()=>setShowDetail(r)} style={{ background:B.white, borderRadius:14, padding:"18px 22px", border:"1px solid "+B.sand, cursor:"pointer", boxShadow:"0 1px 3px rgba(27,42,74,0.06)", transition:"box-shadow 0.15s", borderLeft:"4px solid "+(statusMap[r.status]?.dt || B.sand) }}
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
                      <span style={{ fontWeight:600 }}>{r.itemDesc}</span>
                      <span style={{ color:B.textLight, marginLeft:6 }}>({r.itemId})</span>
                    </div>
                    <div style={{ fontSize:13, color:B.textLight, marginTop:4 }}>
                      Requested by <span style={{ fontWeight:600, color:B.textMid }}>{r.requestedByName}</span>
                      {r.ministry && <> · {r.ministry}</>}
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:14, fontWeight:600, color: isPast&&r.status==="Pending" ? B.red : B.navy }}>
                      {formatDate(r.eventDate)}
                    </div>
                    {r.returnDate && <div style={{ fontSize:12, color:B.textLight }}>Return: {formatDate(r.returnDate)}</div>}
                    {isPast && r.status === "Pending" && <div style={{ fontSize:11, color:B.red, fontWeight:600, marginTop:2 }}>Event date passed!</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ ADD RESERVATION MODAL ═══ */}
      <Modal open={showAdd} onClose={()=>{setShowAdd(false);setConflictErr("");}} title="New Reservation" wide>
        <FF label="Equipment *">
          <select style={{...inp, cursor:"pointer"}} value={form.itemDocId} onChange={e=>handleSelectItem(e.target.value)}>
            <option value="">Select an item...</option>
            {activeItems.map(i => <option key={i._docId} value={i._docId}>{i.description} ({i.itemId}) — {i.status}</option>)}
          </select>
        </FF>
        <div style={{ display:"flex", gap:14 }}>
          <div style={{ flex:1 }}><FF label="Event / Purpose *"><input style={inp} value={form.eventName} onChange={e=>setForm(f=>({...f, eventName:e.target.value}))} placeholder="e.g. Youth Lock-In"/></FF></div>
          <div style={{ flex:1 }}><FF label="Ministry"><select style={{...inp, cursor:"pointer"}} value={form.ministry} onChange={e=>setForm(f=>({...f, ministry:e.target.value}))}>
            <option value="">—</option>
            {ministries.map(m => <option key={m} value={m}>{m}</option>)}
          </select></FF></div>
        </div>
        <div style={{ display:"flex", gap:14 }}>
          <div style={{ flex:1 }}><FF label="Event Date *"><input type="date" style={inp} value={form.eventDate} onChange={e=>setForm(f=>({...f, eventDate:e.target.value}))}/></FF></div>
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
            const count = generateRecurrenceDates(form.eventDate, form.returnDate, recurrenceFreq, recurrenceEnd).length + 1;
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
          <button onClick={handleAdd} disabled={saving||!form.itemDocId||!form.eventName.trim()||!form.eventDate} style={{ ...btnP, opacity:(!form.itemDocId||!form.eventName.trim()||!form.eventDate||saving)?.5:1 }}>
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
                <div style={{ fontSize:12, fontWeight:600, color:B.textLight, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Equipment</div>
                <div style={{ fontSize:16, fontWeight:600, color:B.navy }}>{r.itemDesc}</div>
                <div style={{ fontSize:13, color:B.textLight, fontFamily:"monospace" }}>{r.itemId}</div>
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
            {r.status === "Approved" && r.approvedByName && (
              <div style={{ background:B.tealPale, borderRadius:10, padding:"10px 16px", marginBottom:20, fontSize:13 }}>
                Approved by <span style={{ fontWeight:600 }}>{r.approvedByName}</span> on {r.approvedAt ? new Date(r.approvedAt).toLocaleDateString() : "—"}
              </div>
            )}
            {r.status === "Denied" && r.deniedByName && (
              <div style={{ background:B.redPale, borderRadius:10, padding:"10px 16px", marginBottom:20, fontSize:13 }}>
                Denied by <span style={{ fontWeight:600 }}>{r.deniedByName}</span> on {r.deniedAt ? new Date(r.deniedAt).toLocaleDateString() : "—"}
              </div>
            )}
            {/* Actions */}
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", flexWrap:"wrap" }}>
              {r.status === "Pending" && (r.requestedBy === userId || isAdmin) && (
                <button onClick={()=>handleCancel(r)} disabled={saving} style={{ ...btnS, color:B.red, borderColor:"#FECACA" }}>Cancel Request</button>
              )}
              {r.status === "Pending" && isAdmin && <>
                <button onClick={()=>handleDeny(r)} disabled={saving} style={btnD}>Deny</button>
                <button onClick={()=>handleApprove(r)} disabled={saving} style={btnP}>Approve</button>
              </>}
              {r.status === "Approved" && isAdmin && (
                <button onClick={()=>handleCheckOutFromRes(r)} disabled={saving} style={{ ...btnP, background:"#1A65C7" }}>Check Out Now</button>
              )}
            </div>
          </>;
        })()}
      </Modal>
    </div>
  );
}
