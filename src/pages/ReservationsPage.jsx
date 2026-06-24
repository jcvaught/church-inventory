import { useState, useMemo, useContext } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { MobileCtx } from '../hooks/useMobile.js';
import { notify } from '../utils/notify.js';
import { B, f1, f2, inp, btnP, btnS, btnD } from '../components/brand/tokens.js';
import { Modal } from '../components/primitives/Modal.jsx';
import { FF } from '../components/primitives/FF.jsx';
import { Stat } from '../components/primitives/Stat.jsx';
import { useConfirm } from '../components/primitives/ConfirmDialog.jsx';
import { exportReservationsCSV } from '../utils/csv.js';
import { ITEM_STATUS, RES_STATUS, RESOURCE_TYPE } from '../utils/constants.js';
import { localDateStr, generateRecurrenceDates, RECURRENCE_FREQS } from '../utils/date.js';
import { findRoomConflict, roomUnavailability, seriesCancelTargets } from '../utils/reservationConflict.js';
import { monthMatrix, windowGroups } from '../utils/calendarGrid.js';
import { EmojiIcon } from '../components/primitives/EmojiIcon.jsx';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
// Stable per-room calendar palette (Phase 3 adds an editable per-room `color`;
// until then we assign from this by room index). Equipment bookings = slate.
const ROOM_PALETTE = ['#2A7D6E','#0D9488','#7C3AED','#D97706','#2563EB','#DC2626','#DB2777','#65A30D','#0891B2','#9333EA'];
const EQUIP_COLOR = '#94A3B8';

// ── Month-grid + mobile-list calendar for reservations (room-calendar Phase 2).
// Mirrors JobCalendar's chrome; chips are colored by room (with a legend) and
// open the reservation on click. Reads the already-filtered reservations.
function ReservationCalendar({ reservations, rooms, onClick, isMobile, todayStr }) {
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [expandedDay, setExpandedDay] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const roomColorMap = useMemo(() => {
    const m = new Map();
    (rooms || []).filter(r => r.active !== false).forEach((r, i) => m.set(r._docId, r.color || ROOM_PALETTE[i % ROOM_PALETTE.length]));
    return m;
  }, [rooms]);
  const colorFor = (r) => r.resourceType === 'room' ? (roomColorMap.get(r.roomDocId) || ROOM_PALETTE[0]) : EQUIP_COLOR;
  const dimmed = (r) => r.status === 'Denied' || r.status === 'Cancelled';

  const byDate = useMemo(() => {
    const map = new Map();
    (reservations || []).forEach(r => {
      if (!r.eventDate) return;
      const key = r.eventDate.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    for (const arr of map.values()) arr.sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99'));
    return map;
  }, [reservations]);

  function prevMonth() { setExpandedDay(null); if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); }
  function nextMonth() { setExpandedDay(null); if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); }
  function goToday() { const now = new Date(); setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); setExpandedDay(null); }

  const calendarDays = useMemo(() => monthMatrix(viewYear, viewMonth), [viewYear, viewMonth]);

  const Chip = ({ r }) => (
    <button onClick={() => onClick(r)} title={`${r.eventName}${r.startTime ? ' · ' + r.startTime + (r.endTime ? '–' + r.endTime : '') : ''}`}
      style={{ display:'block', width:'100%', textAlign:'left', border:'none', cursor:'pointer', background:colorFor(r)+'1F', borderLeft:'3px solid '+colorFor(r), borderRadius:4, padding:'2px 5px', marginBottom:2, fontSize:11, color:B.textDark, fontFamily:f1, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', opacity:dimmed(r)?.5:1, textDecoration:dimmed(r)?'line-through':'none' }}>
      {r.startTime ? r.startTime + ' ' : ''}{r.eventName}
    </button>
  );

  // Mobile: grouped list (Overdue = past + still Pending).
  if (isMobile) {
    const groups = windowGroups(reservations || [], { dateOf: r => r.eventDate, todayStr, now: new Date(), isOverdue: r => r.status === 'Pending' });
    const any = (reservations || []).some(r => r.eventDate);
    return (
      <div>
        {groups.map(g => g.items.length > 0 && (
          <div key={g.label} style={{ marginBottom:20 }}>
            <button type="button" onClick={() => setCollapsedGroups(c => ({ ...c, [g.label]: !c[g.label] }))} aria-expanded={!collapsedGroups[g.label]}
              style={{ background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:8, display:'flex', alignItems:'center', gap:6, fontFamily:f1, fontWeight:700, fontSize:13, color:g.label==='Overdue'?B.red:B.textMid, textTransform:'uppercase', letterSpacing:.8 }}>
              <span aria-hidden="true" style={{ fontSize:10, transition:'transform .15s', transform:collapsedGroups[g.label]?'rotate(-90deg)':'none' }}>▾</span>
              {g.label} <span style={{ fontWeight:500, color:B.textLight, letterSpacing:0 }}>({g.items.length})</span>
            </button>
            {!collapsedGroups[g.label] && g.items.map(r => (
              <div key={r._docId} role="button" tabIndex={0} onClick={() => onClick(r)} onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();onClick(r);} }} aria-label={r.eventName}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10, background:B.white, border:'1px solid '+B.sand, marginBottom:6, cursor:'pointer', opacity:dimmed(r)?.6:1 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:colorFor(r), flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:B.navy, fontFamily:f1 }}>{r.eventName}</div>
                  <div style={{ fontSize:12, color:B.textLight, marginTop:2 }}>{r.eventDate}{r.startTime ? ' · '+r.startTime+(r.endTime?'–'+r.endTime:'') : ''} · {r.resourceType==='room' ? (r.roomName||'Space') : (r.itemDesc||'Equipment')}</div>
                </div>
                <span style={{ fontSize:11, color:B.textLight, fontFamily:f1 }}>{r.status}</span>
              </div>
            ))}
          </div>
        ))}
        {!any && <div style={{ textAlign:'center', color:B.textLight, fontSize:14, padding:32 }}>No reservations with dates.</div>}
      </div>
    );
  }

  // Desktop: month grid + legend.
  const legendRooms = (rooms || []).filter(r => r.active !== false);
  const hasEquip = (reservations || []).some(r => r.resourceType !== 'room' && r.eventDate);
  const CHIP_LIMIT = 3;
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14, flexWrap:'wrap' }}>
        <button onClick={prevMonth} aria-label="Previous month" style={{ ...btnS, padding:'6px 12px', fontSize:16, lineHeight:1 }}>‹</button>
        <span style={{ fontFamily:f1, fontWeight:700, fontSize:18, color:B.navy, minWidth:190, textAlign:'center' }}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} aria-label="Next month" style={{ ...btnS, padding:'6px 12px', fontSize:16, lineHeight:1 }}>›</button>
        <button onClick={goToday} style={{ ...btnS, padding:'6px 14px', fontSize:13, marginLeft:4 }}>Today</button>
      </div>
      {(legendRooms.length > 0 || hasEquip) && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 14px', marginBottom:12 }}>
          {legendRooms.map(r => (
            <span key={r._docId} style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, color:B.textMid, fontFamily:f1 }}>
              <span style={{ width:10, height:10, borderRadius:3, background:roomColorMap.get(r._docId) }}/>{r.name}
            </span>
          ))}
          {hasEquip && <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, color:B.textMid, fontFamily:f1 }}><span style={{ width:10, height:10, borderRadius:3, background:EQUIP_COLOR }}/>Equipment</span>}
        </div>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:2, marginBottom:2 }}>
        {DAY_NAMES.map(d => <div key={d} style={{ textAlign:'center', fontSize:12, fontWeight:700, color:B.textLight, fontFamily:f1, padding:'4px 0', textTransform:'uppercase', letterSpacing:.6 }}>{d}</div>)}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:2 }}>
        {calendarDays.map((day, idx) => {
          const ds = localDateStr(day.date);
          const items = byDate.get(ds) || [];
          const isToday = ds === todayStr;
          const isExpanded = expandedDay === ds;
          const visible = items.slice(0, CHIP_LIMIT);
          const overflow = items.length - CHIP_LIMIT;
          return (
            <div key={idx} style={{ minHeight:88, background:day.isCurrentMonth?B.white:'#F8F8FA', borderRadius:8, border:'1px solid '+(isToday?B.teal:B.sand), padding:'5px 6px', outline:isToday?'2px solid '+B.teal:'none', outlineOffset:'-1px' }}>
              <div style={{ fontSize:12, fontWeight:isToday?800:500, color:isToday?B.teal:day.isCurrentMonth?B.textDark:B.textLight, fontFamily:f1, marginBottom:3, textAlign:'right' }}>{day.date.getDate()}</div>
              {(isExpanded ? items : visible).map(r => <Chip key={r._docId} r={r}/>)}
              {!isExpanded && overflow > 0 && (
                <button onClick={() => setExpandedDay(ds)} aria-label={`Show all ${items.length} reservations on ${ds}`} style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:B.teal, fontWeight:700, fontFamily:f1, textAlign:'center', marginTop:2, padding:0, width:'100%' }}>+{overflow} more</button>
              )}
              {isExpanded && overflow > 0 && (
                <button onClick={() => setExpandedDay(null)} aria-label="Collapse day" style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:B.textLight, fontFamily:f1, textAlign:'center', marginTop:2, padding:0, width:'100%' }}>Show less</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReservationsPage({ store, userProfile }) {
  const { items, settings, reservations, users, rooms, notificationConfig, config, addReservation, updateReservation, checkOutItem, logActivity } = store;
  const activeItems = useMemo(() => items.filter(i => i.status !== ITEM_STATUS.DISPOSED), [items]);
  const activeRooms = useMemo(() => (rooms || []).filter(r => r.active !== false), [rooms]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('res_viewMode') || 'list');
  function setViewModePersisted(v) { setViewMode(v); localStorage.setItem('res_viewMode', v); }
  const [roomFilter, setRoomFilter] = useState("all");
  const [ministryFilter, setMinistryFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [cancelScopeRes, setCancelScopeRes] = useState(null); // recurring-series cancel scope picker
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const { confirm, ConfirmHost } = useConfirm();

  const userId = userProfile?.id || userProfile?.uid;
  const userName = userProfile?.name || "Unknown";
  const isAdmin = userProfile?.role === "admin";
  const isManager = userProfile?.role === "manager";
  const managedMinistries = userProfile?.managedMinistries || [];
  const ministries = settings?.ministries || [];
  const isMobile = useContext(MobileCtx);

  function canApproveReservation(r) {
    if (isAdmin) return true;
    if (isManager && r.ministry && managedMinistries.includes(r.ministry)) return true;
    // A space's designated approvers can approve bookings for that space.
    if (r.roomDocId) {
      const room = (rooms || []).find(rm => rm._docId === r.roomDocId);
      if (room && (room.approverUids || []).includes(userId)) return true;
    }
    return false;
  }

  const [resourceType, setResourceType] = useState(() => localStorage.getItem('res_resourceType') || RESOURCE_TYPE.ITEM);
  function setResourceTypePersisted(val) { setResourceType(val); localStorage.setItem('res_resourceType', val); }
  const emptyRes = { itemDocId:"", itemId:"", itemDesc:"", roomDocId:"", roomName:"", eventName:"", eventDate:"", returnDate:"", startTime:"", endTime:"", setupMinutes:"", teardownMinutes:"", expectedAttendance:"", contactName:"", contactPhone:"", purpose:"", ministry:"", notes:"" };
  const [form, setForm] = useState(emptyRes);
  const [allDay, setAllDay] = useState(false); // room bookings: all-day vs timed
  const [showBuffers, setShowBuffers] = useState(false); // tucked-away setup/teardown editor
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
    return <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 12px", borderRadius:20, fontSize:12, fontWeight:600, fontFamily:f1, background:s.bg, color:s.tx }}><EmojiIcon emoji={s.icon} decorative /> {status}</span>;
  }

  const filtered = useMemo(() =>
    reservations
      .filter(r => statusFilter === "all" || r.status === statusFilter)
      .filter(r => roomFilter === "all" || r.roomDocId === roomFilter)
      .filter(r => ministryFilter === "all" || r.ministry === ministryFilter)
      .sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||"")),
    [reservations, statusFilter, roomFilter, ministryFilter]
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
    // Times apply to single-day SPACE bookings only (equipment stays date-range;
    // multi-day spans are all-day). See docs/ROOM-CALENDAR-PLAN-2026-06-23.md.
    const isSpan = !!form.returnDate && form.returnDate > form.eventDate;
    const timed = isRoom && !allDay && !isSpan;
    if (timed && form.startTime && form.endTime && form.endTime <= form.startTime) {
      setConflictErr("End time must be after the start time."); return;
    }
    setConflictErr("");
    const times = timed ? {
      startTime: form.startTime,
      endTime: form.endTime,
      setupMinutes: form.setupMinutes ? parseInt(form.setupMinutes, 10) : 0,
      teardownMinutes: form.teardownMinutes ? parseInt(form.teardownMinutes, 10) : 0,
    } : {};
    // Rooms get time-aware conflict detection (findRoomConflict); items stay date-overlap.
    const itemConflict = (eventDate, returnDate) => reservations.find(r => {
      if (r.itemDocId !== form.itemDocId) return false;
      if (r.status !== RES_STATUS.PENDING && r.status !== RES_STATUS.APPROVED) return false;
      const bStart = r.eventDate, bEnd = r.returnDate || r.eventDate;
      return eventDate <= bEnd && (returnDate || eventDate) >= bStart;
    });
    const conflictFor = (eventDate, returnDate) => isRoom
      ? findRoomConflict({ roomDocId: form.roomDocId, eventDate, returnDate, ...times }, reservations)
      : itemConflict(eventDate, returnDate);
    const conflictMsg = (c, dateLabel) => {
      const when = (timed && c.startTime)
        ? `${c.eventDate} at ${c.startTime}${c.endTime ? "–"+c.endTime : ""}`
        : `${c.eventDate}${c.returnDate && c.returnDate !== c.eventDate ? " – "+c.returnDate : ""}`;
      return `Conflict${dateLabel ? ` on ${dateLabel}` : ""}: "${c.eventName}" (${c.status}) already has this ${isRoom ? "space" : "item"} on ${when}. Pick a different ${isRoom ? "space" : "item"}, date${isRoom ? ", or time" : ""}.`;
    };
    // Room availability rules (blackout dates / weekly blocked hours) — a hard block.
    const selectedRoom = isRoom ? activeRooms.find(rm => rm._docId === form.roomDocId) : null;
    const unavailableFor = (eventDate, returnDate) => selectedRoom
      ? roomUnavailability({ eventDate, returnDate, ...times }, selectedRoom)
      : null;
    const unavailableMsg = (b, dateLabel) => {
      const reason = b.label ? b.label
        : b.window ? `blocked${b.window.label ? " for " + b.window.label : ""} (${b.window.start}–${b.window.end})`
        : "unavailable";
      return `${form.roomName || "This space"} is unavailable on ${dateLabel || b.date} — ${reason}.`;
    };
    const blocked = unavailableFor(form.eventDate, form.returnDate);
    if (blocked) { setConflictErr(unavailableMsg(blocked)); return; }
    const conflict = conflictFor(form.eventDate, form.returnDate);
    if (conflict) { setConflictErr(conflictMsg(conflict)); return; }
    setSaving(true);
    try {
      const baseRes = isRoom ? {
        resourceType: RESOURCE_TYPE.ROOM,
        roomDocId: form.roomDocId,
        roomName: form.roomName,
        eventName: form.eventName,
        eventDate: form.eventDate,
        returnDate: form.returnDate,
        startTime: timed ? form.startTime : '',
        endTime: timed ? form.endTime : '',
        setupMinutes: timed && form.setupMinutes ? parseInt(form.setupMinutes, 10) : 0,
        teardownMinutes: timed && form.teardownMinutes ? parseInt(form.teardownMinutes, 10) : 0,
        expectedAttendance: form.expectedAttendance ? parseInt(form.expectedAttendance, 10) : null,
        contactName: form.contactName.trim() || '',
        contactPhone: form.contactPhone.trim() || '',
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
          const blk = unavailableFor(d.eventDate, d.returnDate);
          if (blk) {
            setConflictErr(unavailableMsg(blk, d.eventDate) + " Adjust the series dates.");
            setSaving(false);
            return;
          }
          const seriesConflict = conflictFor(d.eventDate, d.returnDate);
          if (seriesConflict) {
            setConflictErr(conflictMsg(seriesConflict, d.eventDate) + " Adjust the series dates.");
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
    notify({ churchId: userProfile?.churchId, recipientUids: [res.requestedBy], type: 'reservation_decided', title: 'Reservation approved', body: `${res.eventName} — ${res.itemDesc || res.roomName || ''}`, link: { kind: 'tab', tab: 'reservations' } });
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
    notify({ churchId: userProfile?.churchId, recipientUids: [res.requestedBy], type: 'reservation_decided', title: 'Reservation denied', body: `${res.eventName} — ${res.itemDesc || res.roomName || ''}`, link: { kind: 'tab', tab: 'reservations' } });
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

  // ── Recurring-series cancel (Phase 3b) ─────────────────────────────────────
  // Reservations are fully subscribed, so series ops filter the in-memory array
  // and batch by docId — no Firestore (recurrenceGroupId, eventDate) index needed.
  // seriesCancelTargets (pure, unit-tested) computes the affected docs per scope.
  async function cancelScope(res, scope) {
    const targets = seriesCancelTargets(res, reservations, scope);
    if (targets.length === 0) { setCancelScopeRes(null); return; }
    setSaving(true);
    await Promise.all(targets.map(t => updateReservation(t._docId, { status: RES_STATUS.CANCELLED })));
    await logActivity("reservation_cancelled", res.itemId || res.roomDocId, userId, userName, { eventName: res.eventName, scope, count: targets.length });
    flash(`Cancelled ${targets.length} reservation${targets.length !== 1 ? 's' : ''}.`);
    setCancelScopeRes(null);
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
          <button onClick={()=>{setForm(emptyRes);setAllDay(false);setShowBuffers(false);setRecurring(false);setRecurrenceEnd("");setShowAdd(true);}} style={btnP}>+ New Reservation</button>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginBottom:20 }}>
        <Stat label="Pending" value={pending.length} icon="⏳" color="#96750E"/>
        <Stat label="Approved" value={approved.length} icon="✅" color={B.teal}/>
        <Stat label="Total" value={reservations.length} icon="📅"/>
      </div>

      {/* View toggle + room/ministry filters */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"inline-flex", gap:4, background:B.warmGray, padding:4, borderRadius:10 }}>
          {[["list","☰ List"],["calendar","📅 Calendar"]].map(([v,label]) => (
            <button key={v} onClick={()=>setViewModePersisted(v)}
              style={{ padding:"7px 14px", border:"none", borderRadius:8, cursor:"pointer", fontFamily:f1, fontSize:13, fontWeight:700, background:viewMode===v?B.white:"transparent", color:viewMode===v?B.teal:B.textMid, boxShadow:viewMode===v?"0 1px 4px rgba(27,42,74,0.12)":"none" }}>
              {label}
            </button>
          ))}
        </div>
        {activeRooms.length > 0 && (
          <select aria-label="Filter by space" style={{ ...inp, width:"auto", cursor:"pointer", marginBottom:0 }} value={roomFilter} onChange={e=>setRoomFilter(e.target.value)}>
            <option value="all">All spaces</option>
            {activeRooms.map(r => <option key={r._docId} value={r._docId}>{r.name}</option>)}
          </select>
        )}
        {ministries.length > 0 && (
          <select aria-label="Filter by ministry" style={{ ...inp, width:"auto", cursor:"pointer", marginBottom:0 }} value={ministryFilter} onChange={e=>setMinistryFilter(e.target.value)}>
            <option value="all">All ministries</option>
            {ministries.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        {(roomFilter !== "all" || ministryFilter !== "all") && (
          <button onClick={()=>{setRoomFilter("all");setMinistryFilter("all");}} style={{ background:"none", border:"none", color:B.teal, cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:f1 }}>Clear filters</button>
        )}
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

      {/* Body: calendar or list */}
      {viewMode === 'calendar' ? (
        <ReservationCalendar reservations={filtered} rooms={activeRooms} onClick={setShowDetail} isMobile={isMobile} todayStr={today} />
      ) : filtered.length === 0 ? (
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
                    {r.startTime && <div style={{ fontSize:12, color:B.textMid, fontWeight:600 }}>{r.startTime}{r.endTime ? "–"+r.endTime : ""}</div>}
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
                // Pre-fill setup/teardown from the space's defaults (still editable per booking).
                setForm(f => ({ ...f, roomDocId: e.target.value, roomName: room?.name || '',
                  setupMinutes: room?.defaultSetupMinutes ? String(room.defaultSetupMinutes) : '',
                  teardownMinutes: room?.defaultTeardownMinutes ? String(room.defaultTeardownMinutes) : '' }));
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
        {/* Times — single-day SPACE bookings only (multi-day spans are all-day) */}
        {resourceType === RESOURCE_TYPE.ROOM && !(form.returnDate && form.returnDate > form.eventDate) && (
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", marginBottom:allDay?0:12 }}>
              <input type="checkbox" checked={allDay} onChange={e=>setAllDay(e.target.checked)} style={{ width:16, height:16, cursor:"pointer" }}/>
              <span style={{ fontSize:14, color:B.textDark, fontWeight:500 }}>All day</span>
            </label>
            {!allDay && (
              <>
                <div style={{ display:"flex", gap:14 }}>
                  <div style={{ flex:1 }}><FF label="Start time"><input type="time" style={inp} value={form.startTime} onChange={e=>setForm(f=>({...f, startTime:e.target.value}))}/></FF></div>
                  <div style={{ flex:1 }}><FF label="End time"><input type="time" style={inp} value={form.endTime} onChange={e=>setForm(f=>({...f, endTime:e.target.value}))}/></FF></div>
                </div>
                {/* Setup/teardown buffer — tucked away; held before/after so back-to-back events don't collide */}
                {showBuffers || form.setupMinutes || form.teardownMinutes ? (
                  <div style={{ display:"flex", gap:14, alignItems:"flex-end" }}>
                    <div style={{ flex:1 }}><FF label="Setup before (min)"><input type="number" min="0" style={inp} value={form.setupMinutes} onChange={e=>setForm(f=>({...f, setupMinutes:e.target.value}))} placeholder="0"/></FF></div>
                    <div style={{ flex:1 }}><FF label="Teardown after (min)"><input type="number" min="0" style={inp} value={form.teardownMinutes} onChange={e=>setForm(f=>({...f, teardownMinutes:e.target.value}))} placeholder="0"/></FF></div>
                  </div>
                ) : (
                  <button type="button" onClick={()=>setShowBuffers(true)} style={{ background:"none", border:"none", color:B.teal, cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:f1, padding:0, marginBottom:4 }}>
                    + Add setup/teardown time
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {/* Attendance + day-of contact — SPACE bookings only */}
        {resourceType === RESOURCE_TYPE.ROOM && (() => {
          const formRoom = activeRooms.find(r => r._docId === form.roomDocId);
          const over = formRoom?.capacity && form.expectedAttendance && parseInt(form.expectedAttendance, 10) > formRoom.capacity;
          return (
            <>
              <div style={{ display:"flex", gap:14 }}>
                <div style={{ flex:1 }}><FF label="Expected attendance"><input type="number" min="0" style={inp} value={form.expectedAttendance} onChange={e=>setForm(f=>({...f, expectedAttendance:e.target.value}))} placeholder={formRoom?.capacity ? `Capacity: ${formRoom.capacity}` : "How many people?"}/></FF></div>
                <div style={{ flex:1 }}><FF label="Day-of contact"><input style={inp} value={form.contactName} onChange={e=>setForm(f=>({...f, contactName:e.target.value}))} placeholder="Name (optional)"/></FF></div>
              </div>
              {over && (
                <div style={{ background:"#FFF8E1", border:"1px solid "+B.gold, borderRadius:10, padding:"8px 14px", marginBottom:12, fontSize:13, color:"#96750E", fontWeight:500 }}>
                  ⚠️ {form.expectedAttendance} exceeds {form.roomName || "this space"}'s capacity of {formRoom.capacity}. You can still book it — just make sure it works.
                </div>
              )}
              <FF label="Contact phone"><input style={inp} value={form.contactPhone} onChange={e=>setForm(f=>({...f, contactPhone:e.target.value}))} placeholder="(optional)"/></FF>
            </>
          );
        })()}
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
                  {RECURRENCE_FREQS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
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
                <div style={{ fontSize:15, fontWeight:600 }}>{formatDate(r.eventDate)}{r.startTime ? ` · ${r.startTime}${r.endTime ? "–"+r.endTime : ""}` : ""}</div>
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
              {r.expectedAttendance != null && r.expectedAttendance !== "" && (() => {
                const rm = (rooms||[]).find(x => x._docId === r.roomDocId);
                const over = rm?.capacity && r.expectedAttendance > rm.capacity;
                return <div>
                  <div style={{ fontSize:12, fontWeight:600, color:B.textLight, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Attendance</div>
                  <div style={{ fontSize:14, fontWeight:600, color: over ? "#96750E" : B.navy }}>{r.expectedAttendance}{rm?.capacity ? ` / ${rm.capacity}` : ""}{over ? " ⚠️" : ""}</div>
                </div>;
              })()}
              {(r.contactName || r.contactPhone) && <div>
                <div style={{ fontSize:12, fontWeight:600, color:B.textLight, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Day-of Contact</div>
                <div style={{ fontSize:14 }}>{[r.contactName, r.contactPhone].filter(Boolean).join(" · ")}</div>
              </div>}
              {(r.setupMinutes > 0 || r.teardownMinutes > 0) && <div>
                <div style={{ fontSize:12, fontWeight:600, color:B.textLight, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Setup / Teardown</div>
                <div style={{ fontSize:14 }}>{[r.setupMinutes > 0 ? `${r.setupMinutes} min before` : null, r.teardownMinutes > 0 ? `${r.teardownMinutes} min after` : null].filter(Boolean).join(" · ")}</div>
              </div>}
            </div>
            {(() => { const rm = (rooms||[]).find(x => x._docId === r.roomDocId); return rm?.photoUrl ? (
              <img src={rm.photoUrl} alt={rm.name} style={{ width:"100%", maxHeight:200, objectFit:"cover", borderRadius:12, border:"1px solid "+B.sand, marginBottom:20 }}/>
            ) : null; })()}
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
              {!r.recurrenceGroupId && r.status === RES_STATUS.PENDING && (r.requestedBy === userId || isAdmin) && (
                <button onClick={async ()=>{
                  if (!await confirm({ title: 'Cancel request?', message: 'Cancel this reservation request?', confirmLabel: 'Cancel request', danger: true })) return;
                  handleCancel(r);
                }} disabled={saving} style={{ ...btnS, color:B.red, borderColor:"#FECACA" }}>Cancel Request</button>
              )}
              {r.recurrenceGroupId && (r.status === RES_STATUS.PENDING || r.status === RES_STATUS.APPROVED) && (r.requestedBy === userId || isAdmin || canApproveReservation(r)) && (
                <button onClick={()=>setCancelScopeRes(r)} disabled={saving} style={{ ...btnS, color:B.red, borderColor:"#FECACA" }}>Cancel…</button>
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

      {/* ═══ RECURRING-SERIES CANCEL SCOPE ═══ */}
      <Modal open={!!cancelScopeRes} onClose={()=>setCancelScopeRes(null)} title="Cancel recurring reservation">
        {cancelScopeRes && (() => {
          const r = cancelScopeRes;
          const futureN = seriesCancelTargets(r, reservations, 'future').length;
          const allN = seriesCancelTargets(r, reservations, 'all').length;
          return <>
            <p style={{ fontSize:14, color:B.textMid, marginBottom:16, lineHeight:1.5 }}>
              <strong style={{ color:B.navy }}>{r.eventName}</strong> is part of a recurring series. What would you like to cancel?
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <button onClick={()=>cancelScope(r,'one')} disabled={saving} style={{ ...btnS, textAlign:"left", padding:"12px 16px" }}>
                Just this one <span style={{ color:B.textLight }}>· {formatDate(r.eventDate)}</span>
              </button>
              <button onClick={()=>cancelScope(r,'future')} disabled={saving} style={{ ...btnS, textAlign:"left", padding:"12px 16px" }}>
                This and all future <span style={{ color:B.textLight }}>· {futureN} reservation{futureN!==1?'s':''}</span>
              </button>
              <button onClick={()=>cancelScope(r,'all')} disabled={saving} style={{ ...btnD, textAlign:"left", padding:"12px 16px" }}>
                Entire series <span style={{ opacity:.85 }}>· {allN} reservation{allN!==1?'s':''}</span>
              </button>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16 }}>
              <button onClick={()=>setCancelScopeRes(null)} disabled={saving} style={btnS}>Keep all</button>
            </div>
          </>;
        })()}
      </Modal>
      <ConfirmHost />
    </div>
  );
}
