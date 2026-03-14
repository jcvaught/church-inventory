import { useState, useEffect, useRef, useContext, useMemo } from 'react';
import { storage } from '../firebase.js';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { B, f1, f2, inp, btnP, btnS, btnD } from '../components/brand/tokens.js';
import { MobileCtx } from '../hooks/useMobile.js';
import { Modal } from '../components/primitives/Modal.jsx';
import { FF } from '../components/primitives/FF.jsx';
import { Badge } from '../components/primitives/Badge.jsx';
import { resizeImageForUpload } from '../utils/imageResize.js';
import { printLabel, printInventory } from '../utils/print.js';
import { exportItemsCSV } from '../utils/csv.js';
import { canManageItem } from '../utils/roleHelpers.js';
import QRCode from 'qrcode';

export function ItemsPage({ store, userProfile, initialItemId }) {
  const { items, settings, config, activityLog, addItem, updateItem, checkOutItem, returnItem, retireItem, markRepair, markRepaired } = store;
  const isMobile = useContext(MobileCtx);
  const activeItems = useMemo(() => items.filter(i => i.status !== "Disposed"), [items]);
  const disposedItems = useMemo(() => items.filter(i => i.status === "Disposed"), [items]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState(() => localStorage.getItem('inv_locationFilter') || 'all');
  const [ministryFilter, setMinistryFilter] = useState(() => localStorage.getItem('inv_ministryFilter') || 'all');
  const [showDisposed, setShowDisposed] = useState(false);

  function setLocation(v) { setLocationFilter(v); localStorage.setItem('inv_locationFilter', v); }
  function setMinistry(v) { setMinistryFilter(v); localStorage.setItem('inv_ministryFilter', v); }

  // Modals
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(null);       // item object
  const [showCheckOut, setShowCheckOut] = useState(null); // item object
  const [showReturn, setShowReturn] = useState(null);     // item object
  const [showRepair, setShowRepair] = useState(null);     // item object
  const [showRetire, setShowRetire] = useState(null);     // item object
  const [showDetail, setShowDetail] = useState(null);     // item object
  const [detailQrUrl, setDetailQrUrl] = useState('');

  useEffect(() => {
    if (!showDetail) { setDetailQrUrl(''); return; }
    const itemUrl = window.location.origin + window.location.pathname.replace(/\/+$/, '') + '?item=' + encodeURIComponent(showDetail.itemId);
    QRCode.toDataURL(itemUrl, { width: 200, margin: 2 }).then(setDetailQrUrl).catch(() => setDetailQrUrl(''));
  }, [showDetail?.itemId]);

  // Deep-link: open item from ?item= URL param
  const deepLinked = useRef(false);
  useEffect(() => {
    if (!initialItemId || deepLinked.current || !items.length) return;
    const found = items.find(i => i.itemId === initialItemId);
    if (found) { setShowDetail(found); deepLinked.current = true; }
  }, [initialItemId, items]);

  // Forms
  const emptyItem = { itemId:"", description:"", location:"", ministry:"", status:"Available", condition:"Good", notes:"", tags:[], purchaseDate:"", purchasePrice:"", warrantyExpiry:"", estimatedValue:"" };
  const [itemForm, setItemForm] = useState(emptyItem);
  const [coForm, setCoForm] = useState({ person:"", purpose:"", ministry:"", date:"", returnDate:"" });
  const [retForm, setRetForm] = useState({ condition:"Good", notes:"" });
  const [repairForm, setRepairForm] = useState({ issue:"", handler:"", expectedDate:"" });
  const [retireForm, setRetireForm] = useState({ reason:"Broken", date:"", notes:"", recoveryValue:"" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [showFinancial, setShowFinancial] = useState(false);

  const locations = settings?.locations || [];
  const ministries = settings?.ministries || [];
  const tagOptions = settings?.tags || [];
  const userId = userProfile?.id || userProfile?.uid;
  const userName = userProfile?.name || "Unknown";
  const isAdmin = userProfile?.role === "admin";
  const isManager = userProfile?.role === "manager";

  // Filter logic
  const displayItems = useMemo(() => (showDisposed ? disposedItems : activeItems).filter(item => {
    if (search && !item.description?.toLowerCase().includes(search.toLowerCase()) && !item.itemId?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (locationFilter !== "all" && item.location !== locationFilter) return false;
    if (ministryFilter !== "all" && item.ministry !== ministryFilter) return false;
    return true;
  }), [showDisposed, disposedItems, activeItems, search, statusFilter, locationFilter, ministryFilter]);

  // Helpers
  function flash(text) { setMsg(text); setTimeout(()=>setMsg(""), 3000); }
  const today = new Date().toISOString().split("T")[0];

  // ── Add Item ──
  async function handleAdd() {
    if (!itemForm.itemId.trim() || !itemForm.description.trim()) return;
    if (itemForm.itemId.trim().length < 3) { flash("Item ID must be at least 3 characters."); return; }
    const duplicate = items.find(i => i.itemId === itemForm.itemId.trim());
    if (duplicate) { flash(`Item ID "${itemForm.itemId.trim()}" already exists. Use a unique ID.`); return; }
    setSaving(true);
    let photoUrl = "";
    if (photoFile) {
      try {
        const resized = await resizeImageForUpload(photoFile);
        const sRef = storageRef(storage, `churches/${userProfile.churchId}/items/${itemForm.itemId.trim()}-${Date.now()}`);
        await uploadBytes(sRef, resized, { contentType: 'image/jpeg' });
        photoUrl = await getDownloadURL(sRef);
      } catch (err) { flash('Photo upload failed — item saved without photo.'); }
    }
    await addItem({
      itemId: itemForm.itemId.trim(),
      description: itemForm.description.trim(),
      location: itemForm.location,
      ministry: itemForm.ministry,
      status: "Available",
      condition: itemForm.condition || "Good",
      notes: itemForm.notes,
      tags: itemForm.tags || [],
      photoUrl,
      assignedTo: "",
      checkOutDate: "",
      expectedReturn: "",
      purchaseDate: itemForm.purchaseDate || null,
      purchasePrice: itemForm.purchasePrice !== "" ? Number(itemForm.purchasePrice) : null,
      warrantyExpiry: itemForm.warrantyExpiry || null,
      estimatedValue: itemForm.estimatedValue !== "" ? Number(itemForm.estimatedValue) : null,
    }, userId, userName);
    setShowAdd(false);
    setItemForm(emptyItem);
    setPhotoFile(null);
    setPhotoPreview(null);
    setSaving(false);
    flash("Item added to inventory!");
  }

  // ── Edit Item ──
  async function handleEdit() {
    if (!showEdit) return;
    if (itemForm.itemId.trim().length < 3) { flash("Item ID must be at least 3 characters."); return; }
    setSaving(true);
    let photoUrl = showEdit.photoUrl || "";
    if (photoFile) {
      try {
        const resized = await resizeImageForUpload(photoFile);
        const sRef = storageRef(storage, `churches/${userProfile.churchId}/items/${itemForm.itemId.trim()}-${Date.now()}`);
        await uploadBytes(sRef, resized, { contentType: 'image/jpeg' });
        photoUrl = await getDownloadURL(sRef);
      } catch (err) { flash('Photo upload failed — item saved without photo.'); }
    }
    await updateItem(showEdit._docId, {
      itemId: itemForm.itemId.trim(),
      description: itemForm.description.trim(),
      location: itemForm.location,
      ministry: itemForm.ministry,
      condition: itemForm.condition,
      notes: itemForm.notes,
      tags: itemForm.tags || [],
      photoUrl,
      purchaseDate: itemForm.purchaseDate || null,
      purchasePrice: itemForm.purchasePrice !== "" ? Number(itemForm.purchasePrice) : null,
      warrantyExpiry: itemForm.warrantyExpiry || null,
      estimatedValue: itemForm.estimatedValue !== "" ? Number(itemForm.estimatedValue) : null,
    }, userId, userName);
    setShowEdit(null);
    setPhotoFile(null);
    setPhotoPreview(null);
    setSaving(false);
    flash("Item updated!");
  }

  // ── Check Out ──
  async function handleCheckOut() {
    if (!showCheckOut || !coForm.person.trim()) return;
    const checkoutDate = coForm.date || today;
    if (coForm.returnDate && coForm.returnDate < checkoutDate) { flash("Return date cannot be before the check-out date."); return; }
    setSaving(true);
    await checkOutItem(showCheckOut._docId, {
      itemId: showCheckOut.itemId,
      person: coForm.person.trim(),
      purpose: coForm.purpose,
      ministry: coForm.ministry,
      date: coForm.date || today,
      returnDate: coForm.returnDate
    }, userId, userName);
    setShowCheckOut(null);
    setCoForm({ person:"", purpose:"", ministry:"", date:"", returnDate:"" });
    setSaving(false);
    flash("Item checked out!");
  }

  // ── Return ──
  async function handleReturn() {
    if (!showReturn) return;
    setSaving(true);
    await returnItem(showReturn._docId, {
      itemId: showReturn.itemId,
      condition: retForm.condition,
      person: showReturn.assignedTo
    }, userId, userName);
    setShowReturn(null);
    setRetForm({ condition:"Good", notes:"" });
    setSaving(false);
    flash("Item returned!");
  }

  // ── Mark Repair ──
  async function handleRepair() {
    if (!showRepair || !repairForm.issue.trim()) return;
    setSaving(true);
    await markRepair(showRepair._docId, {
      itemId: showRepair.itemId,
      issue: repairForm.issue.trim(),
      handler: repairForm.handler,
      expectedDate: repairForm.expectedDate
    }, userId, userName);
    setShowRepair(null);
    setRepairForm({ issue:"", handler:"", expectedDate:"" });
    setSaving(false);
    flash("Item sent to repair!");
  }

  // ── Mark Repaired ──
  async function handleRepaired(item) {
    setSaving(true);
    await markRepaired(item._docId, { itemId: item.itemId }, userId, userName);
    setSaving(false);
    flash("Item marked as repaired!");
  }

  // ── Retire ──
  async function handleRetire() {
    if (!showRetire) return;
    setSaving(true);
    await retireItem(showRetire._docId, {
      itemId: showRetire.itemId,
      reason: retireForm.reason,
      date: retireForm.date || today,
      notes: retireForm.notes,
      recoveryValue: retireForm.recoveryValue ? Number(retireForm.recoveryValue) : null
    }, userId, userName);
    setShowRetire(null);
    setRetireForm({ reason:"Broken", date:"", notes:"", recoveryValue:"" });
    setSaving(false);
    flash("Item retired.");
  }

  // Open edit with pre-filled data
  function openEdit(item) {
    setItemForm({
      itemId: item.itemId || "",
      description: item.description || "",
      location: item.location || "",
      ministry: item.ministry || "",
      condition: item.condition || "Good",
      notes: item.notes || "",
      tags: item.tags || [],
      status: item.status,
      purchaseDate: item.purchaseDate || "",
      purchasePrice: item.purchasePrice ?? "",
      warrantyExpiry: item.warrantyExpiry || "",
      estimatedValue: item.estimatedValue ?? "",
    });
    setShowFinancial(!!(item.purchaseDate || item.purchasePrice != null || item.warrantyExpiry || item.estimatedValue != null));
    setPhotoFile(null);
    setPhotoPreview(item.photoUrl || null);
    setShowEdit(item);
  }

  // Tag toggle
  function toggleTag(tag) {
    setItemForm(prev => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag]
    }));
  }

  // Status-based action buttons
  function itemActions(item) {
    const acts = [];
    if (item.status === "Available") {
      acts.push(<button key="co" onClick={(e)=>{e.stopPropagation();setCoForm({ person:userName, purpose:"", ministry:item.ministry||"", date:today, returnDate:"" });setShowCheckOut(item);}} style={{ ...btnP, padding:"6px 14px", fontSize:12 }}>Check Out</button>);
      acts.push(<button key="rep" onClick={(e)=>{e.stopPropagation();setShowRepair(item);}} style={{ ...btnS, padding:"6px 14px", fontSize:12 }}>Repair</button>);
    }
    if (item.status === "Checked Out" || item.status === "In Use") {
      acts.push(<button key="ret" onClick={(e)=>{e.stopPropagation();setShowReturn(item);}} style={{ ...btnP, padding:"6px 14px", fontSize:12, background:B.gold }}>Return</button>);
    }
    if (item.status === "Under Repair") {
      acts.push(<button key="fixed" onClick={(e)=>{e.stopPropagation();handleRepaired(item);}} style={{ ...btnP, padding:"6px 14px", fontSize:12 }}>Mark Repaired</button>);
    }
    if (item.status !== "Disposed" && canManageItem(userProfile, item)) {
      acts.push(<button key="edit" onClick={(e)=>{e.stopPropagation();openEdit(item);}} style={{ ...btnS, padding:"6px 14px", fontSize:12 }}>Edit</button>);
    }
    return acts;
  }

  // ── Item detail row ──
  function ItemRow({ item }) {
    const isMob = useContext(MobileCtx);
    const overdue = item.status === "Checked Out" && item.expectedReturn && item.expectedReturn < today;
    return (
      <div
        onClick={()=>setShowDetail(showDetail?._docId === item._docId ? null : item)}
        style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:isMob?"12px 14px":"14px 18px", borderRadius:12, cursor:"pointer",
          background: overdue ? B.redPale : B.white,
          border: overdue ? "1px solid #FECACA" : "1px solid "+B.sand,
          transition:"all 0.15s", flexWrap:"wrap", gap:10
        }}
        onMouseEnter={e=>{ if(!overdue) e.currentTarget.style.borderColor=B.teal; e.currentTarget.style.boxShadow="0 2px 8px rgba(42,125,110,0.08)"; }}
        onMouseLeave={e=>{ e.currentTarget.style.borderColor=overdue?"#FECACA":B.sand; e.currentTarget.style.boxShadow="none"; }}
      >
        <div style={{ display:"flex", alignItems:"center", gap:12, flex:1, minWidth:0 }}>
          <div style={{ width:38, height:38, borderRadius:10, background:B.tealPale, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>📋</div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontWeight:600, fontSize:14, color:B.navy, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.description || "Unnamed"}</div>
            <div style={{ fontSize:12, color:B.textLight, display:"flex", gap:8, flexWrap:"wrap", marginTop:2 }}>
              <span style={{ fontFamily:"monospace", letterSpacing:1 }}>{item.itemId}</span>
              {item.location && !isMob && <span>📍 {item.location}</span>}
              {item.assignedTo && <span>👤 {item.assignedTo}</span>}
              {overdue && <span style={{ color:B.red, fontWeight:700 }}>OVERDUE</span>}
            </div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", flexShrink:0 }}>
          <Badge status={item.status} />
          {/* On mobile, all actions are in the detail modal — tap the row to open */}
          {!isMob && itemActions(item)}
        </div>
      </div>
    );
  }

  // Status counts for filter bar
  const counts = {
    all: activeItems.length,
    Available: activeItems.filter(i=>i.status==="Available").length,
    "Checked Out": activeItems.filter(i=>i.status==="Checked Out").length,
    "In Use": activeItems.filter(i=>i.status==="In Use").length,
    "Under Repair": activeItems.filter(i=>i.status==="Under Repair").length,
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <h2 style={{ fontFamily:f1, fontSize:22, fontWeight:700, color:B.navy, margin:0 }}>All Items</h2>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {activeItems.length > 0 && <button onClick={()=>exportItemsCSV(activeItems)} style={{ ...btnS, fontSize:13, padding:"9px 18px" }}>⬇ Export CSV</button>}
          {activeItems.length > 0 && <button onClick={()=>printInventory(activeItems, config?.churchName)} style={{ ...btnS, fontSize:13, padding:"9px 18px" }}>🖨 Print</button>}
          {(isAdmin || isManager) && <button onClick={()=>{setItemForm(emptyItem);setPhotoFile(null);setPhotoPreview(null);setShowAdd(true);}} style={btnP}>+ Add Item</button>}
        </div>
      </div>

      {/* Success message */}
      {msg && <div style={{ background:B.tealPale, border:"1px solid "+B.teal, borderRadius:10, padding:"10px 16px", marginBottom:16, color:B.teal, fontWeight:600, fontSize:13, fontFamily:f1 }}>{msg}</div>}

      {/* Search & Filters */}
      <div style={{ background:B.white, borderRadius:14, padding:"16px 20px", border:"1px solid "+B.sand, marginBottom:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          <div style={{ flex:"1 1 220px", position:"relative" }}>
            <input
              style={{...inp, paddingLeft:36}}
              placeholder="Search by name or ID..."
              value={search} onChange={e=>setSearch(e.target.value)}
            />
            <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:14, color:B.textLight }}>🔍</span>
          </div>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{...inp, width:"auto", flex:"0 1 180px"}}>
            <option value="all">All Statuses ({counts.all})</option>
            <option value="Available">Available ({counts.Available})</option>
            <option value="Checked Out">Checked Out ({counts["Checked Out"]})</option>
            <option value="In Use">In Use ({counts["In Use"]})</option>
            <option value="Under Repair">Under Repair ({counts["Under Repair"]})</option>
          </select>
          {locations.length > 0 && (
            <select value={locationFilter} onChange={e=>setLocation(e.target.value)} style={{...inp, width:"auto", flex:"0 1 180px"}}>
              <option value="all">All Locations</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
          {ministries.length > 0 && (
            <select value={ministryFilter} onChange={e=>setMinistry(e.target.value)} style={{...inp, width:"auto", flex:"0 1 180px"}}>
              <option value="all">All Ministries</option>
              {ministries.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Item List */}
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {displayItems.length === 0 ? (
          <div style={{ background:B.white, borderRadius:18, padding:"48px 32px", border:"1px solid "+B.sand, textAlign:"center" }}>
            <div style={{ fontSize:48, marginBottom:16 }}>📋</div>
            <h3 style={{ fontFamily:f1, color:B.navy, margin:"0 0 8px", fontSize:18 }}>
              {activeItems.length === 0 ? "No items yet" : "No items match your filters"}
            </h3>
            <p style={{ color:B.textLight, fontSize:14 }}>
              {activeItems.length === 0 ? "Add your first inventory item to get started." : "Try adjusting your search or filters."}
            </p>
          </div>
        ) : displayItems.map(item => <ItemRow key={item._docId} item={item} />)}
      </div>

      {/* Disposed toggle */}
      {disposedItems.length > 0 && (
        <div style={{ marginTop:20, textAlign:"center" }}>
          <button onClick={()=>setShowDisposed(!showDisposed)} style={{ ...btnS, fontSize:13, color:B.textLight }}>
            {showDisposed ? "← Back to active items" : `Show retired items (${disposedItems.length})`}
          </button>
        </div>
      )}

      {/* Detail Expand */}
      {showDetail && (
        <Modal open={true} onClose={()=>setShowDetail(null)} title={showDetail.description || "Item Details"}>
          {/* Photo */}
          {showDetail.photoUrl && (
            <div style={{ marginBottom:16, textAlign:"center" }}>
              <img src={showDetail.photoUrl} alt={showDetail.description} style={{ maxWidth:"100%", maxHeight:220, borderRadius:10, border:"1px solid "+B.sand, objectFit:"contain" }} />
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Item ID</span><div style={{ fontFamily:"monospace", fontSize:14, marginTop:2 }}>{showDetail.itemId}</div></div>
            <div><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Status</span><div style={{ marginTop:4 }}><Badge status={showDetail.status}/></div></div>
            <div><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Location</span><div style={{ fontSize:14, marginTop:2 }}>{showDetail.location || "—"}</div></div>
            <div><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Ministry</span><div style={{ fontSize:14, marginTop:2 }}>{showDetail.ministry || "—"}</div></div>
            <div><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Condition</span><div style={{ fontSize:14, marginTop:2 }}>{showDetail.condition || "—"}</div></div>
            <div><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Assigned To</span><div style={{ fontSize:14, marginTop:2 }}>{showDetail.assignedTo || "—"}</div></div>
            {showDetail.checkOutDate && <div><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Checked Out</span><div style={{ fontSize:14, marginTop:2 }}>{showDetail.checkOutDate}</div></div>}
            {showDetail.expectedReturn && <div><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Expected Return</span><div style={{ fontSize:14, marginTop:2 }}>{showDetail.expectedReturn}</div></div>}
            {showDetail.repairIssue && <div style={{ gridColumn:"1/-1" }}><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Repair Issue</span><div style={{ fontSize:14, marginTop:2 }}>{showDetail.repairIssue}</div></div>}
          </div>
          {showDetail.tags?.length > 0 && (
            <div style={{ marginTop:14 }}>
              <span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Tags</span>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:4 }}>
                {showDetail.tags.map(t => <span key={t} style={{ padding:"3px 10px", borderRadius:20, background:B.warmGray, fontSize:12, color:B.textMid, fontFamily:f1, fontWeight:500 }}>{t}</span>)}
              </div>
            </div>
          )}
          {showDetail.notes && <div style={{ marginTop:14 }}><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Notes</span><div style={{ fontSize:14, marginTop:2, color:B.textMid }}>{showDetail.notes}</div></div>}

          {/* Financial fields */}
          {(showDetail.purchaseDate || showDetail.purchasePrice != null || showDetail.warrantyExpiry) && (
            <div style={{ marginTop:14, paddingTop:14, borderTop:"1px solid "+B.sand }}>
              <span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1, display:"block", marginBottom:8 }}>Financial &amp; Warranty</span>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, fontSize:13 }}>
                {showDetail.purchaseDate && <div><span style={{ color:B.textLight }}>Purchased:</span> {showDetail.purchaseDate}</div>}
                {showDetail.purchasePrice != null && <div><span style={{ color:B.textLight }}>Orig. Cost:</span> ${Number(showDetail.purchasePrice).toLocaleString()}</div>}
                {showDetail.warrantyExpiry && (
                  <div style={{ color: new Date(showDetail.warrantyExpiry) < new Date() ? B.red : B.teal, fontWeight:600 }}>
                    Warranty {new Date(showDetail.warrantyExpiry) < new Date() ? "EXPIRED" : "expires"}: {showDetail.warrantyExpiry}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* QR Code */}
          {(() => {
            const itemUrl = window.location.origin + window.location.pathname.replace(/\/+$/, '') + '?item=' + encodeURIComponent(showDetail.itemId);
            return (
              <div style={{ marginTop:18, paddingTop:16, borderTop:"1px solid "+B.sand }}>
                <div style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:10 }}>QR Code — Scan to open this item</div>
                <div style={{ display:"flex", alignItems:"flex-start", gap:16, flexWrap:"wrap" }}>
                  {detailQrUrl && <img src={detailQrUrl} alt={`QR for ${showDetail.itemId}`} style={{ width:110, height:110, borderRadius:8, border:"1px solid "+B.sand, flexShrink:0 }} />}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, color:B.textMid, marginBottom:8, wordBreak:"break-all", lineHeight:1.5 }}>{itemUrl}</div>
                    {detailQrUrl && (
                      <a
                        href={detailQrUrl}
                        download={`qr-${showDetail.itemId}.png`}
                        style={{ ...btnS, fontSize:11, padding:"5px 12px", textDecoration:"none", display:"inline-block", color:B.textDark }}>
                        ↓ Download QR
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Item History */}
          {(() => {
            const history = activityLog.filter(l => l.itemId === showDetail.itemId);
            if (!history.length) return null;
            const icons = { check_out:"📤", return:"↩️", add_item:"➕", dispose:"🗑️", mark_repair:"🔧", mark_repaired:"✅" };
            const labels = { check_out:"Checked Out", return:"Returned", add_item:"Added", dispose:"Retired", mark_repair:"Sent to Repair", mark_repaired:"Repair Complete" };
            return (
              <div style={{ marginTop:18, paddingTop:16, borderTop:"1px solid "+B.sand }}>
                <div style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:8 }}>History ({history.length})</div>
                <div style={{ maxHeight:200, overflowY:"auto", borderRadius:8, border:"1px solid "+B.sand }}>
                  {history.slice(0, 50).map((l, i) => (
                    <div key={l._docId} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderBottom:i<history.length-1?"1px solid "+B.sand:"none", background:i%2===0?B.white:B.warmGray }}>
                      <span style={{ fontSize:14, flexShrink:0 }}>{icons[l.action]||"📋"}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <span style={{ fontSize:12, fontWeight:600, color:B.textDark }}>{labels[l.action]||l.action.replace(/_/g," ")}</span>
                        {l.details?.person && <span style={{ fontSize:12, color:B.textMid }}> · {l.details.person}</span>}
                        {l.details?.condition && <span style={{ fontSize:12, color:B.textMid }}> · {l.details.condition}</span>}
                        <span style={{ fontSize:11, color:B.textLight }}> · {l.performedByName}</span>
                      </div>
                      <span style={{ fontSize:11, color:B.textLight, flexShrink:0 }}>{l.timestamp?.split("T")[0]}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div style={{ display:"flex", gap:8, marginTop:20, flexWrap:"wrap" }}>
            {itemActions(showDetail)}
            <button onClick={()=>printLabel(showDetail, config?.churchName)} style={{ ...btnS, padding:"6px 14px", fontSize:12 }}>🖨 Print Label</button>
            {canManageItem(userProfile, showDetail) && showDetail.status !== "Disposed" && (
              <button onClick={()=>{setRetireForm({ reason:"Broken", date:today, notes:"", recoveryValue:"" });setShowRetire(showDetail);setShowDetail(null);}} style={{ ...btnD, padding:"6px 14px", fontSize:12 }}>Retire</button>
            )}
          </div>
        </Modal>
      )}

      {/* ═══ ADD ITEM MODAL ═══ */}
      <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Add New Item">
        <FF label="Item ID"><input style={{...inp, fontFamily:"monospace", letterSpacing:1}} value={itemForm.itemId} onChange={e=>setItemForm({...itemForm, itemId:e.target.value.toUpperCase()})} placeholder="e.g. MIC-001"/></FF>
        <FF label="Description"><input style={inp} value={itemForm.description} onChange={e=>setItemForm({...itemForm, description:e.target.value})} placeholder="e.g. Wireless Microphone A"/></FF>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FF label="Location"><select style={inp} value={itemForm.location} onChange={e=>setItemForm({...itemForm, location:e.target.value})}>
            <option value="">— Select —</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select></FF>
          <FF label="Ministry"><select style={inp} value={itemForm.ministry} onChange={e=>setItemForm({...itemForm, ministry:e.target.value})}>
            <option value="">— Select —</option>
            {ministries.map(m => <option key={m} value={m}>{m}</option>)}
          </select></FF>
        </div>
        <FF label="Condition"><select style={inp} value={itemForm.condition} onChange={e=>setItemForm({...itemForm, condition:e.target.value})}>
          <option value="New">New</option><option value="Good">Good</option><option value="Fair">Fair</option><option value="Poor">Poor</option>
        </select></FF>
        {tagOptions.length > 0 && (
          <FF label="Tags">
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {tagOptions.map(t => (
                <button key={t} type="button" onClick={()=>toggleTag(t)}
                  style={{ padding:"5px 12px", borderRadius:20, fontSize:12, fontFamily:f1, fontWeight:500, cursor:"pointer",
                    border: itemForm.tags.includes(t) ? "1px solid "+B.teal : "1px solid "+B.sand,
                    background: itemForm.tags.includes(t) ? B.tealPale : B.white,
                    color: itemForm.tags.includes(t) ? B.teal : B.textMid
                  }}>{t}</button>
              ))}
            </div>
          </FF>
        )}
        <FF label="Notes"><textarea style={{...inp, minHeight:60, resize:"vertical"}} value={itemForm.notes} onChange={e=>setItemForm({...itemForm, notes:e.target.value})} placeholder="Optional notes..."/></FF>
        <div style={{ marginBottom:12 }}>
          <button type="button" onClick={()=>setShowFinancial(v=>!v)} style={{ background:"none", border:"none", cursor:"pointer", color:B.teal, fontWeight:600, fontSize:13, fontFamily:f1, padding:0, display:"flex", alignItems:"center", gap:4 }}>
            <span>{showFinancial ? "▾" : "▸"}</span> Financial &amp; Warranty (optional)
          </button>
          {showFinancial && (
            <div style={{ marginTop:10, padding:"14px 16px", background:B.warmGray, borderRadius:10 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <FF label="Purchase Date"><input style={inp} type="date" value={itemForm.purchaseDate} onChange={e=>setItemForm({...itemForm, purchaseDate:e.target.value})}/></FF>
                <FF label="Purchase Price ($)"><input style={inp} type="number" min="0" step="0.01" value={itemForm.purchasePrice} onChange={e=>setItemForm({...itemForm, purchasePrice:e.target.value})} placeholder="0.00"/></FF>
                <FF label="Warranty Expiry"><input style={inp} type="date" value={itemForm.warrantyExpiry} onChange={e=>setItemForm({...itemForm, warrantyExpiry:e.target.value})}/></FF>
                <FF label="Current Value Override ($)"><input style={inp} type="number" min="0" step="0.01" value={itemForm.estimatedValue} onChange={e=>setItemForm({...itemForm, estimatedValue:e.target.value})} placeholder="Auto-calculated"/></FF>
              </div>
              <p style={{ margin:"8px 0 0", fontSize:11, color:B.textLight }}>Current value is auto-estimated from purchase price (straight-line, 5-yr). Enter an override to use a specific value.</p>
            </div>
          )}
        </div>
        <FF label="Photo (optional)">
          {photoPreview && (
            <div style={{ marginBottom:8, position:"relative", display:"inline-block" }}>
              <img src={photoPreview} alt="Preview" style={{ width:120, height:80, objectFit:"cover", borderRadius:8, border:"1px solid "+B.sand, display:"block" }} />
              <button type="button" onClick={()=>{setPhotoFile(null);setPhotoPreview(null);}} style={{ position:"absolute", top:-6, right:-6, width:20, height:20, borderRadius:"50%", background:B.red, color:"#fff", border:"none", cursor:"pointer", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
          )}
          <div><input type="file" accept="image/*" id="photo-add" style={{ display:"none" }} onChange={e=>{const f=e.target.files[0];if(f){setPhotoFile(f);setPhotoPreview(URL.createObjectURL(f));}}}/><label htmlFor="photo-add" style={{ ...btnS, display:"inline-block", cursor:"pointer", padding:"7px 16px", fontSize:13 }}>{photoPreview?"📷 Change Photo":"📷 Add Photo"}</label></div>
        </FF>
        <button onClick={handleAdd} disabled={saving||itemForm.itemId.trim().length<3||!itemForm.description.trim()} style={{ ...btnP, width:"100%", opacity:(saving||itemForm.itemId.trim().length<3||!itemForm.description.trim())?.5:1, marginTop:4 }}>
          {saving ? "Saving..." : "Add Item"}
        </button>
      </Modal>

      {/* ═══ EDIT ITEM MODAL ═══ */}
      <Modal open={!!showEdit} onClose={()=>setShowEdit(null)} title="Edit Item">
        <FF label="Item ID"><input style={{...inp, fontFamily:"monospace", letterSpacing:1}} value={itemForm.itemId} onChange={e=>setItemForm({...itemForm, itemId:e.target.value.toUpperCase()})} placeholder="e.g. MIC-001"/></FF>
        <FF label="Description"><input style={inp} value={itemForm.description} onChange={e=>setItemForm({...itemForm, description:e.target.value})} placeholder="Description"/></FF>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FF label="Location"><select style={inp} value={itemForm.location} onChange={e=>setItemForm({...itemForm, location:e.target.value})}>
            <option value="">— Select —</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select></FF>
          <FF label="Ministry"><select style={inp} value={itemForm.ministry} onChange={e=>setItemForm({...itemForm, ministry:e.target.value})}>
            <option value="">— Select —</option>
            {ministries.map(m => <option key={m} value={m}>{m}</option>)}
          </select></FF>
        </div>
        <FF label="Condition"><select style={inp} value={itemForm.condition} onChange={e=>setItemForm({...itemForm, condition:e.target.value})}>
          <option value="New">New</option><option value="Good">Good</option><option value="Fair">Fair</option><option value="Poor">Poor</option>
        </select></FF>
        {tagOptions.length > 0 && (
          <FF label="Tags">
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {tagOptions.map(t => (
                <button key={t} type="button" onClick={()=>toggleTag(t)}
                  style={{ padding:"5px 12px", borderRadius:20, fontSize:12, fontFamily:f1, fontWeight:500, cursor:"pointer",
                    border: itemForm.tags.includes(t) ? "1px solid "+B.teal : "1px solid "+B.sand,
                    background: itemForm.tags.includes(t) ? B.tealPale : B.white,
                    color: itemForm.tags.includes(t) ? B.teal : B.textMid
                  }}>{t}</button>
              ))}
            </div>
          </FF>
        )}
        <FF label="Notes"><textarea style={{...inp, minHeight:60, resize:"vertical"}} value={itemForm.notes} onChange={e=>setItemForm({...itemForm, notes:e.target.value})} placeholder="Optional notes..."/></FF>
        <div style={{ marginBottom:12 }}>
          <button type="button" onClick={()=>setShowFinancial(v=>!v)} style={{ background:"none", border:"none", cursor:"pointer", color:B.teal, fontWeight:600, fontSize:13, fontFamily:f1, padding:0, display:"flex", alignItems:"center", gap:4 }}>
            <span>{showFinancial ? "▾" : "▸"}</span> Financial &amp; Warranty (optional)
          </button>
          {showFinancial && (
            <div style={{ marginTop:10, padding:"14px 16px", background:B.warmGray, borderRadius:10 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <FF label="Purchase Date"><input style={inp} type="date" value={itemForm.purchaseDate} onChange={e=>setItemForm({...itemForm, purchaseDate:e.target.value})}/></FF>
                <FF label="Purchase Price ($)"><input style={inp} type="number" min="0" step="0.01" value={itemForm.purchasePrice} onChange={e=>setItemForm({...itemForm, purchasePrice:e.target.value})} placeholder="0.00"/></FF>
                <FF label="Warranty Expiry"><input style={inp} type="date" value={itemForm.warrantyExpiry} onChange={e=>setItemForm({...itemForm, warrantyExpiry:e.target.value})}/></FF>
                <FF label="Current Value Override ($)"><input style={inp} type="number" min="0" step="0.01" value={itemForm.estimatedValue} onChange={e=>setItemForm({...itemForm, estimatedValue:e.target.value})} placeholder="Auto-calculated"/></FF>
              </div>
              <p style={{ margin:"8px 0 0", fontSize:11, color:B.textLight }}>Current value is auto-estimated from purchase price (straight-line, 5-yr). Enter an override to use a specific value.</p>
            </div>
          )}
        </div>
        <FF label="Photo (optional)">
          {photoPreview && (
            <div style={{ marginBottom:8, position:"relative", display:"inline-block" }}>
              <img src={photoPreview} alt="Preview" style={{ width:120, height:80, objectFit:"cover", borderRadius:8, border:"1px solid "+B.sand, display:"block" }} />
              <button type="button" onClick={()=>{setPhotoFile(null);setPhotoPreview(null);}} style={{ position:"absolute", top:-6, right:-6, width:20, height:20, borderRadius:"50%", background:B.red, color:"#fff", border:"none", cursor:"pointer", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
          )}
          <div><input type="file" accept="image/*" id="photo-edit" style={{ display:"none" }} onChange={e=>{const f=e.target.files[0];if(f){setPhotoFile(f);setPhotoPreview(URL.createObjectURL(f));}}}/><label htmlFor="photo-edit" style={{ ...btnS, display:"inline-block", cursor:"pointer", padding:"7px 16px", fontSize:13 }}>{photoPreview?"📷 Change Photo":"📷 Add Photo"}</label></div>
        </FF>
        <button onClick={handleEdit} disabled={saving} style={{ ...btnP, width:"100%", opacity:saving?.5:1, marginTop:4 }}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </Modal>

      {/* ═══ CHECK OUT MODAL ═══ */}
      <Modal open={!!showCheckOut} onClose={()=>setShowCheckOut(null)} title={`Check Out: ${showCheckOut?.description||""}`}>
        <FF label="Who's taking it?"><input style={inp} value={coForm.person} onChange={e=>setCoForm({...coForm, person:e.target.value})} placeholder="Person's name"/></FF>
        <FF label="Purpose"><input style={inp} value={coForm.purpose} onChange={e=>setCoForm({...coForm, purpose:e.target.value})} placeholder="e.g. Sunday worship, youth retreat"/></FF>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FF label="Ministry"><select style={inp} value={coForm.ministry} onChange={e=>setCoForm({...coForm, ministry:e.target.value})}>
            <option value="">— Select —</option>
            {ministries.map(m => <option key={m} value={m}>{m}</option>)}
          </select></FF>
          <FF label="Check-out Date"><input style={inp} type="date" value={coForm.date} onChange={e=>setCoForm({...coForm, date:e.target.value})}/></FF>
        </div>
        <FF label="Expected Return"><input style={inp} type="date" value={coForm.returnDate} onChange={e=>setCoForm({...coForm, returnDate:e.target.value})}/></FF>
        <button onClick={handleCheckOut} disabled={saving||!coForm.person.trim()} style={{ ...btnP, width:"100%", opacity:(saving||!coForm.person.trim())?.5:1, marginTop:4 }}>
          {saving ? "Processing..." : "Check Out Item"}
        </button>
      </Modal>

      {/* ═══ RETURN MODAL ═══ */}
      <Modal open={!!showReturn} onClose={()=>setShowReturn(null)} title={`Return: ${showReturn?.description||""}`}>
        <div style={{ background:B.warmGray, borderRadius:10, padding:"12px 16px", marginBottom:16, fontSize:13, color:B.textMid }}>
          Checked out to <strong>{showReturn?.assignedTo}</strong> {showReturn?.checkOutDate && `on ${showReturn.checkOutDate}`}
        </div>
        <FF label="Condition on Return"><select style={inp} value={retForm.condition} onChange={e=>setRetForm({...retForm, condition:e.target.value})}>
          <option value="Good">Good — No issues</option>
          <option value="Fair">Fair — Minor wear</option>
          <option value="Poor">Poor — Needs attention</option>
          <option value="Damaged">Damaged — Needs repair</option>
        </select></FF>
        <button onClick={handleReturn} disabled={saving} style={{ ...btnP, width:"100%", opacity:saving?.5:1, marginTop:4 }}>
          {saving ? "Processing..." : "Return Item"}
        </button>
      </Modal>

      {/* ═══ REPAIR MODAL ═══ */}
      <Modal open={!!showRepair} onClose={()=>setShowRepair(null)} title={`Send to Repair: ${showRepair?.description||""}`}>
        <FF label="What's the issue?"><textarea style={{...inp, minHeight:60, resize:"vertical"}} value={repairForm.issue} onChange={e=>setRepairForm({...repairForm, issue:e.target.value})} placeholder="Describe the problem..."/></FF>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FF label="Handler / Vendor"><input style={inp} value={repairForm.handler} onChange={e=>setRepairForm({...repairForm, handler:e.target.value})} placeholder="Who's fixing it?"/></FF>
          <FF label="Expected Repair Date"><input style={inp} type="date" value={repairForm.expectedDate} onChange={e=>setRepairForm({...repairForm, expectedDate:e.target.value})}/></FF>
        </div>
        <button onClick={handleRepair} disabled={saving||!repairForm.issue.trim()} style={{ ...btnP, width:"100%", opacity:(saving||!repairForm.issue.trim())?.5:1, marginTop:4 }}>
          {saving ? "Processing..." : "Send to Repair"}
        </button>
      </Modal>

      {/* ═══ RETIRE MODAL ═══ */}
      <Modal open={!!showRetire} onClose={()=>setShowRetire(null)} title={`Retire: ${showRetire?.description||""}`}>
        <div style={{ background:B.redPale, borderRadius:10, padding:"12px 16px", marginBottom:16, fontSize:13, color:B.red, fontWeight:500 }}>
          This item will be moved to the retired list and removed from active inventory.
        </div>
        <FF label="Reason"><select style={inp} value={retireForm.reason} onChange={e=>setRetireForm({...retireForm, reason:e.target.value})}>
          <option value="Broken">Broken beyond repair</option>
          <option value="Obsolete">Obsolete / Replaced</option>
          <option value="Lost">Lost or Missing</option>
          <option value="Donated">Donated</option>
          <option value="Sold">Sold</option>
          <option value="Other">Other</option>
        </select></FF>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FF label="Retirement Date"><input style={inp} type="date" value={retireForm.date} onChange={e=>setRetireForm({...retireForm, date:e.target.value})}/></FF>
          <FF label="Recovery Value ($)"><input style={inp} type="number" value={retireForm.recoveryValue} onChange={e=>setRetireForm({...retireForm, recoveryValue:e.target.value})} placeholder="0.00"/></FF>
        </div>
        <FF label="Notes"><textarea style={{...inp, minHeight:60, resize:"vertical"}} value={retireForm.notes} onChange={e=>setRetireForm({...retireForm, notes:e.target.value})} placeholder="Optional details..."/></FF>
        <button onClick={handleRetire} disabled={saving} style={{ ...btnD, width:"100%", opacity:saving?.5:1, marginTop:4 }}>
          {saving ? "Processing..." : "Retire Item"}
        </button>
      </Modal>
    </div>
  );
}
