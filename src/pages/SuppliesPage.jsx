import { useState, useContext, useMemo } from 'react';
import { app } from '../firebase.js';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { B, f1, inp, btnP, btnS, btnD } from '../components/brand/tokens.js';
import { MobileCtx } from '../hooks/useMobile.js';
import { Modal } from '../components/primitives/Modal.jsx';
import { FF } from '../components/primitives/FF.jsx';
import { exportSuppliesCSV } from '../utils/csv.js';
import { canManageSupply } from '../utils/roleHelpers.js';

function generateId(description, existingIds) {
  const skip = new Set(['a','an','the','of','in','for','and','or','to']);
  const words = description.trim().split(/\s+/).filter(w => !skip.has(w.toLowerCase()));
  if (!words.length) return '';
  const prefix = words[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase();
  if (prefix.length < 2) return '';
  const re = new RegExp('^' + prefix + '-(\\d+)$', 'i');
  let max = 0;
  for (const id of existingIds) {
    const m = String(id).match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return prefix + '-' + String(max + 1).padStart(3, '0');
}

export function SuppliesPage({ store, userProfile }) {
  const { supplies, settings, activityLog, items, addSupply, addItem, updateSupply, useSupply, restockSupply, deleteSupply, updateSettings } = store;
  const isMobile = useContext(MobileCtx);

  const [search, setSearch] = useState("");
  const [showLowOnly, setShowLowOnly] = useState(false);

  // Modals
  const [showAdd, setShowAdd] = useState(false);
  const [showEditSupply, setShowEditSupply] = useState(null); // supply object
  const [showUse, setShowUse] = useState(null);      // supply object
  const [showRestock, setShowRestock] = useState(null); // supply object
  const [showHistory, setShowHistory] = useState(null); // supply object

  // Forms
  const emptySupply = { supplyId:"", description:"", location:"", ministry:"", quantity:0, minQuantity:5, unit:"each", tags:[] };

  function toggleSupTag(form, setForm, tag) {
    setForm(prev => ({ ...prev, tags: prev.tags.includes(tag) ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag] }));
  }
  function addNewTag(setForm) {
    const tag = newTagInput.trim();
    if (!tag || tagOptions.map(t => t.toLowerCase()).includes(tag.toLowerCase())) return;
    updateSettings({ tags: [...tagOptions, tag] });
    setForm(prev => ({ ...prev, tags: [...prev.tags, tag] }));
    setNewTagInput("");
  }
  const [supForm, setSupForm] = useState(emptySupply);
  const [supIdTouched, setSupIdTouched] = useState(false);
  const [editSupForm, setEditSupForm] = useState(emptySupply);
  const [useForm, setUseForm] = useState({ qty:"1", purpose:"" });
  const [restockForm, setRestockForm] = useState({ qty:"", source:"" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [identifying, setIdentifying] = useState(false);

  const locations = settings?.locations || [];
  const ministries = settings?.ministries || [];
  const tagOptions = settings?.tags || [];
  const userId = userProfile?.id || userProfile?.uid;
  const userName = userProfile?.name || "Unknown";
  const isAdmin = userProfile?.role === "admin";
  const isManager = userProfile?.role === "manager";

  const [tagFilter, setTagFilter] = useState("");
  const [newTagInput, setNewTagInput] = useState("");
  const [showMoveToItem, setShowMoveToItem] = useState(null);
  const [moveItemForm, setMoveItemForm] = useState({ itemId: "", notes: "" });

  function flash(text, isError = false) { setMsg({ text, isError }); setTimeout(() => setMsg(null), 5000); }

  // ── AI Supply Identification ──
  async function handleIdentify(file) {
    if (!file) return;
    setIdentifying(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const identify = httpsCallable(getFunctions(app), 'identifyItem');
      const result = await identify({ imageBase64: base64, mediaType: file.type || 'image/jpeg' });
      if (result.data?.description) {
        const desc = result.data.description;
        setSupForm(f => {
          const u = { ...f, description: desc };
          if (!supIdTouched) u.supplyId = generateId(desc, supplies.map(s => s.supplyId));
          return u;
        });
      } else {
        flash('Could not identify item — try again or enter manually.');
      }
    } catch {
      flash('Identification failed — try again or enter manually.');
    } finally {
      setIdentifying(false);
    }
  }

  // Filter
  const filtered = useMemo(() => supplies.filter(s => {
    if (search && !s.description?.toLowerCase().includes(search.toLowerCase()) && !s.supplyId?.toLowerCase().includes(search.toLowerCase())) return false;
    if (showLowOnly && s.quantity > s.minQuantity) return false;
    if (tagFilter && !(s.tags || []).includes(tagFilter)) return false;
    return true;
  }), [supplies, search, showLowOnly, tagFilter]);

  const lowCount = supplies.filter(s => s.quantity <= s.minQuantity).length;

  // ── Add ──
  async function handleAdd() {
    if (!supForm.supplyId.trim() || !supForm.description.trim()) return;
    if (supForm.supplyId.trim().length < 3) { flash("Supply ID must be at least 3 characters."); return; }
    const duplicate = supplies.find(s => s.supplyId === supForm.supplyId.trim());
    if (duplicate) { flash(`Supply ID "${supForm.supplyId.trim()}" already exists. Use a unique ID.`); return; }
    if (Number(supForm.quantity) < 0) { flash("Quantity cannot be negative."); return; }
    if (Number(supForm.minQuantity) < 0) { flash("Minimum quantity cannot be negative."); return; }
    setSaving(true);
    await addSupply({
      supplyId: supForm.supplyId.trim(),
      description: supForm.description.trim(),
      location: supForm.location,
      ministry: supForm.ministry,
      quantity: Number(supForm.quantity) || 0,
      minQuantity: Number(supForm.minQuantity) || 5,
      unit: supForm.unit || "each",
      tags: supForm.tags || []
    }, userId, userName);
    setShowAdd(false);
    setSupForm(emptySupply);
        setPhotoPreview(null);
    setSaving(false);
    flash("Supply added!");
  }

  // ── Edit Supply ──
  async function handleEditSupply() {
    if (!showEditSupply || !editSupForm.description.trim()) return;
    if (Number(editSupForm.minQuantity) < 0) { flash("Minimum quantity cannot be negative."); return; }
    if (isAdmin && Number(editSupForm.quantity) < 0) { flash("Quantity cannot be negative."); return; }
    setSaving(true);
    const updates = {
      supplyId: showEditSupply.supplyId,
      description: editSupForm.description.trim(),
      location: editSupForm.location,
      ministry: editSupForm.ministry,
      minQuantity: Number(editSupForm.minQuantity) || 5,
      unit: editSupForm.unit || "each",
      tags: editSupForm.tags || []
    };
    if (isAdmin) updates.quantity = Number(editSupForm.quantity) || 0;
    await updateSupply(showEditSupply._docId, updates, userId, userName);
    setShowEditSupply(null);
    setSaving(false);
    flash("Supply updated!");
  }

  // ── Use ──
  async function handleUse() {
    if (!showUse || !useForm.qty || Number(useForm.qty) <= 0) return;
    if (Number(useForm.qty) > (showUse.quantity || 0)) { flash("Cannot exceed current stock."); return; }
    setSaving(true);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await useSupply(showUse._docId, {
      qty: useForm.qty,
      purpose: useForm.purpose
    }, userId, userName);
    setShowUse(null);
    setUseForm({ qty:"1", purpose:"" });
    setSaving(false);
    flash("Usage logged!");
  }

  // ── Restock ──
  async function handleRestock() {
    if (!showRestock || !restockForm.qty || Number(restockForm.qty) <= 0) return;
    setSaving(true);
    await restockSupply(showRestock._docId, {
      qty: restockForm.qty,
      source: restockForm.source
    }, userId, userName);
    setShowRestock(null);
    setRestockForm({ qty:"", source:"" });
    setSaving(false);
    flash("Supply restocked!");
  }

  // ── Delete ──
  async function handleDelete(s) {
    if (!window.confirm(`Delete "${s.description}" (${s.supplyId})?\n\nThis cannot be undone. Activity history will be preserved.`)) return;
    await deleteSupply(s._docId, s.supplyId, userId, userName);
    flash("Supply deleted.");
  }

  // ── Move to Inventory ──
  async function handleMoveToItem() {
    if (!showMoveToItem) return;
    const id = moveItemForm.itemId.trim();
    if (id.length < 3) { flash("Item ID must be at least 3 characters."); return; }
    if (items.some(i => i.itemId === id)) { flash("An item with that ID already exists."); return; }
    setSaving(true);
    await addItem({
      itemId: id,
      description: showMoveToItem.description,
      location: showMoveToItem.location || "",
      ministry: showMoveToItem.ministry || "",
      status: "Available",
      tags: showMoveToItem.tags || [],
      notes: moveItemForm.notes || "",
    }, userId, userName);
    await deleteSupply(showMoveToItem._docId, showMoveToItem.supplyId, userId, userName);
    setSaving(false);
    setShowMoveToItem(null);
    flash("Moved to inventory.");
  }

  // Stock level indicator
  function StockBar({ quantity, minQuantity }) {
    const pct = minQuantity > 0 ? Math.min(100, (quantity / (minQuantity * 2)) * 100) : 100;
    const isLow = quantity <= minQuantity;
    const isEmpty = quantity === 0;
    return (
      <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:120 }}>
        <div style={{ flex:1, height:6, borderRadius:3, background:B.sand, overflow:"hidden" }}>
          <div style={{
            height:"100%", borderRadius:3, transition:"width 0.3s",
            width: pct+"%",
            background: isEmpty ? B.red : isLow ? B.gold : B.teal
          }}/>
        </div>
        <span style={{ fontSize:13, fontWeight:700, fontFamily:f1, minWidth:24, textAlign:"right",
          color: isEmpty ? B.red : isLow ? "#96750E" : B.teal
        }}>{quantity}</span>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <h2 style={{ fontFamily:f1, fontSize:22, fontWeight:700, color:B.navy, margin:0 }}>Supplies & Consumables</h2>
        <div style={{ display:"flex", gap:8 }}>
          {supplies.length > 0 && <button aria-label="Export supplies as CSV" onClick={()=>exportSuppliesCSV(supplies)} style={{ ...btnS, fontSize:13, padding:"9px 18px" }}>⬇ Export CSV</button>}
          {(isAdmin || isManager) && <button onClick={()=>{setSupForm(emptySupply);setSupIdTouched(false);setShowAdd(true);}} style={btnP}>+ Add Supply</button>}
        </div>
      </div>

      {msg && <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:msg.isError?'#FEE8E8':B.tealPale, border:`1px solid ${msg.isError?'#FECACA':B.teal}`, borderRadius:10, padding:"10px 16px", marginBottom:16, color:msg.isError?B.red:B.teal, fontWeight:600, fontSize:13, fontFamily:f1 }}><span>{msg.text}</span><button onClick={()=>setMsg(null)} style={{ border:'none', background:'none', cursor:'pointer', color:'inherit', fontSize:16, lineHeight:1, marginLeft:8, padding:'0 2px', fontWeight:700 }}>&times;</button></div>}

      {/* Low Stock Banner */}
      {lowCount > 0 && (
        <div style={{ background:"#FFF8E1", border:"1px solid #FFECB3", borderLeft:"4px solid "+B.gold, borderRadius:14, padding:"14px 20px", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
          <span style={{ fontSize:14, fontWeight:600, color:"#96750E", fontFamily:f1 }}>⚠️ {lowCount} supply {lowCount!==1?"items":"item"} at or below minimum stock</span>
          <button onClick={()=>setShowLowOnly(!showLowOnly)} style={{ ...btnS, padding:"6px 14px", fontSize:12, borderColor:"#FFECB3", color:"#96750E" }}>
            {showLowOnly ? "Show all" : "Show low stock only"}
          </button>
        </div>
      )}

      {/* Search */}
      <div style={{ background:B.white, borderRadius:14, padding:"16px 20px", border:"1px solid "+B.sand, marginBottom:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <div style={{ position:"relative", marginBottom: tagOptions.length > 0 ? 10 : 0 }}>
          <input
            style={{...inp, paddingLeft:36}}
            placeholder="Search supplies..."
            value={search} onChange={e=>setSearch(e.target.value)}
          />
          <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:14, color:B.textLight }}>🔍</span>
        </div>
        {tagOptions.length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {tagOptions.map(t => (
              <button key={t} type="button" onClick={()=>setTagFilter(tagFilter === t ? "" : t)}
                style={{ padding:"4px 12px", borderRadius:20, fontSize:12, fontFamily:f1, fontWeight:500, cursor:"pointer", border: tagFilter===t ? "1px solid "+B.teal : "1px solid "+B.sand, background: tagFilter===t ? B.tealPale : B.white, color: tagFilter===t ? B.teal : B.textMid }}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Supply Cards */}
      {filtered.length === 0 ? (
        <div style={{ background:B.white, borderRadius:18, padding:"48px 32px", border:"1px solid "+B.sand, textAlign:"center" }}>
          <div style={{ fontSize:48, marginBottom:16 }}>📦</div>
          <h3 style={{ fontFamily:f1, color:B.navy, margin:"0 0 8px", fontSize:18 }}>
            {supplies.length === 0 ? "No supplies tracked yet" : "No supplies match your search"}
          </h3>
          <p style={{ color:B.textLight, fontSize:14 }}>
            {supplies.length === 0 ? "Add your first consumable supply to start tracking." : "Try adjusting your search."}
          </p>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"repeat(auto-fill, minmax(300px, 1fr))", gap:12 }}>
          {filtered.map(s => {
            const isLow = s.quantity <= s.minQuantity;
            const isEmpty = s.quantity === 0;
            return (
              <div key={s._docId} style={{
                background:B.white, borderRadius:14, padding:"18px 20px",
                border: isEmpty ? "1px solid #FECACA" : isLow ? "1px solid #FFECB3" : "1px solid "+B.sand,
                boxShadow:"0 1px 3px rgba(27,42,74,0.06)",
                transition:"all 0.15s"
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14, color:B.navy }}>{s.description}</div>
                    <div style={{ fontSize:12, color:B.textLight, display:"flex", gap:8, marginTop:2 }}>
                      <span style={{ fontFamily:"monospace", letterSpacing:1 }}>{s.supplyId}</span>
                      {s.location && <span>📍 {s.location}</span>}
                    </div>
                  </div>
                  {isLow && (
                    <span style={{
                      padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, fontFamily:f1,
                      background: isEmpty ? B.redPale : "#FFF8E1",
                      color: isEmpty ? B.red : "#96750E"
                    }}>{isEmpty ? "OUT" : "LOW"}</span>
                  )}
                </div>

                <StockBar quantity={s.quantity || 0} minQuantity={s.minQuantity || 5} />

                {s.tags?.length > 0 && (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:8 }}>
                    {s.tags.map(t => <span key={t} style={{ padding:"2px 8px", borderRadius:20, background:B.warmGray, fontSize:11, color:B.textMid, fontFamily:f1, fontWeight:500 }}>{t}</span>)}
                  </div>
                )}

                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:12, gap:8 }}>
                  <span style={{ fontSize:11, color:B.textLight, fontFamily:f1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    Min: {s.minQuantity || 5} {s.unit || "each"}
                    {s.lastRestocked && ` · Restocked ${s.lastRestocked.split("T")[0]}`}
                  </span>
                  <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                    <button onClick={()=>setShowHistory(s)} style={{ ...btnS, padding:"5px 12px", fontSize:11 }}>History</button>
                    {canManageSupply(userProfile, s) && <button onClick={()=>{setEditSupForm({ supplyId:s.supplyId, description:s.description, location:s.location||"", ministry:s.ministry||"", quantity:s.quantity, minQuantity:s.minQuantity||5, unit:s.unit||"each", tags:s.tags||[] });setShowEditSupply(s);}} style={{ ...btnS, padding:"5px 12px", fontSize:11 }}>Edit</button>}
                    <button onClick={()=>{setUseForm({ qty:"1", purpose:"" });setShowUse(s);}} style={{ ...btnS, padding:"5px 12px", fontSize:11 }}>Use</button>
                    <button onClick={()=>{setRestockForm({ qty:"", source:"" });setShowRestock(s);}} style={{ ...btnP, padding:"5px 12px", fontSize:11 }}>Restock</button>
                    {isAdmin && <button onClick={()=>handleDelete(s)} style={{ ...btnD, padding:"5px 12px", fontSize:11 }}>Delete</button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ ADD SUPPLY MODAL ═══ */}
      <Modal open={showAdd} onClose={()=>{ setShowAdd(false); setSupForm(emptySupply); setSupIdTouched(false); setPhotoFile(null); setPhotoPreview(null); }} title="Add New Supply">
        <FF label="Description">
          <input style={inp} value={supForm.description} onChange={e=>{const d=e.target.value;setSupForm(f=>{const u={...f,description:d};if(!supIdTouched)u.supplyId=generateId(d,supplies.map(s=>s.supplyId));return u;});}} placeholder="e.g. AA Batteries" autoFocus/>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginTop:8 }}>
            <input type="file" accept="image/*" id="photo-sup-add" style={{ display:"none" }} onChange={e=>{const f=e.target.files[0];if(f){setPhotoPreview(URL.createObjectURL(f));handleIdentify(f);}}}/>
            <label htmlFor="photo-sup-add" style={{ ...btnS, display:"inline-block", cursor:"pointer", padding:"7px 16px", fontSize:13, opacity:identifying?.6:1, pointerEvents:identifying?"none":"auto" }}>
              {identifying ? "Identifying…" : "✨ Identify Item"}
            </label>
          </div>
          {photoPreview && <img src={photoPreview} alt="preview" style={{ marginTop:8, maxWidth:"100%", maxHeight:120, borderRadius:8, objectFit:"cover" }}/>}
        </FF>
        <FF label="Supply ID"><input style={{...inp, fontFamily:"monospace", letterSpacing:1}} value={supForm.supplyId} onChange={e=>{setSupIdTouched(true);setSupForm({...supForm,supplyId:e.target.value.toUpperCase()});}} placeholder="Auto-filled from description"/></FF>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FF label="Location"><select style={inp} value={supForm.location} onChange={e=>setSupForm({...supForm, location:e.target.value})}>
            <option value="">— Select —</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select></FF>
          <FF label="Ministry"><select style={inp} value={supForm.ministry} onChange={e=>setSupForm({...supForm, ministry:e.target.value})}>
            <option value="">— Select —</option>
            {ministries.map(m => <option key={m} value={m}>{m}</option>)}
          </select></FF>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          <FF label="Starting Qty"><input style={inp} type="number" min="0" value={supForm.quantity} onChange={e=>setSupForm({...supForm, quantity:e.target.value})}/></FF>
          <FF label="Min Qty (alert)"><input style={inp} type="number" min="0" value={supForm.minQuantity} onChange={e=>setSupForm({...supForm, minQuantity:e.target.value})}/></FF>
          <FF label="Unit"><select style={inp} value={supForm.unit} onChange={e=>setSupForm({...supForm, unit:e.target.value})}>
            <option value="each">Each</option><option value="pack">Pack</option><option value="box">Box</option><option value="roll">Roll</option><option value="ream">Ream</option><option value="case">Case</option><option value="gallon">Gallon</option><option value="bottle">Bottle</option>
          </select></FF>
        </div>
        <FF label="Tags">
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom: tagOptions.length > 0 ? 8 : 0 }}>
            {tagOptions.map(t => (
              <button key={t} type="button" onClick={()=>toggleSupTag(supForm, setSupForm, t)}
                style={{ padding:"5px 12px", borderRadius:20, fontSize:12, fontFamily:f1, fontWeight:500, cursor:"pointer", border: supForm.tags.includes(t) ? "1px solid "+B.teal : "1px solid "+B.sand, background: supForm.tags.includes(t) ? B.tealPale : B.white, color: supForm.tags.includes(t) ? B.teal : B.textMid }}>
                {t}
              </button>
            ))}
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <input style={{ ...inp, flex:1, fontSize:12, padding:"5px 10px" }} placeholder="New tag…" value={newTagInput} onChange={e=>setNewTagInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"){e.preventDefault();addNewTag(setSupForm);}}} />
            <button type="button" onClick={()=>addNewTag(setSupForm)} style={{ ...btnS, padding:"5px 12px", fontSize:12, whiteSpace:"nowrap" }}>+ Add</button>
          </div>
        </FF>
        <button onClick={handleAdd} disabled={saving||!supForm.supplyId.trim()||!supForm.description.trim()} style={{ ...btnP, width:"100%", opacity:(saving||!supForm.supplyId.trim()||!supForm.description.trim())?.5:1, marginTop:4 }}>
          {saving ? "Saving..." : "Add Supply"}
        </button>
      </Modal>

      {/* ═══ EDIT SUPPLY MODAL ═══ */}
      <Modal open={!!showEditSupply} onClose={()=>setShowEditSupply(null)} title={`Edit Supply: ${showEditSupply?.supplyId||""}`}>
        <FF label="Description"><input style={inp} value={editSupForm.description} onChange={e=>setEditSupForm({...editSupForm, description:e.target.value})} placeholder="e.g. AA Batteries"/></FF>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FF label="Location"><select style={inp} value={editSupForm.location} onChange={e=>setEditSupForm({...editSupForm, location:e.target.value})}>
            <option value="">— Select —</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select></FF>
          <FF label="Ministry"><select style={inp} value={editSupForm.ministry} onChange={e=>setEditSupForm({...editSupForm, ministry:e.target.value})}>
            <option value="">— Select —</option>
            {ministries.map(m => <option key={m} value={m}>{m}</option>)}
          </select></FF>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FF label="Min Qty (alert)"><input style={inp} type="number" min="0" value={editSupForm.minQuantity} onChange={e=>setEditSupForm({...editSupForm, minQuantity:e.target.value})}/></FF>
          <FF label="Unit"><select style={inp} value={editSupForm.unit} onChange={e=>setEditSupForm({...editSupForm, unit:e.target.value})}>
            <option value="each">Each</option><option value="pack">Pack</option><option value="box">Box</option><option value="roll">Roll</option><option value="ream">Ream</option><option value="case">Case</option><option value="gallon">Gallon</option><option value="bottle">Bottle</option>
          </select></FF>
        </div>
        {isAdmin && (
          <FF label="Current Quantity (admin correction)">
            <input style={inp} type="number" min="0" value={editSupForm.quantity} onChange={e=>setEditSupForm({...editSupForm, quantity:e.target.value})}/>
          </FF>
        )}
        <FF label="Tags">
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom: tagOptions.length > 0 ? 8 : 0 }}>
            {tagOptions.map(t => (
              <button key={t} type="button" onClick={()=>toggleSupTag(editSupForm, setEditSupForm, t)}
                style={{ padding:"5px 12px", borderRadius:20, fontSize:12, fontFamily:f1, fontWeight:500, cursor:"pointer", border: editSupForm.tags.includes(t) ? "1px solid "+B.teal : "1px solid "+B.sand, background: editSupForm.tags.includes(t) ? B.tealPale : B.white, color: editSupForm.tags.includes(t) ? B.teal : B.textMid }}>
                {t}
              </button>
            ))}
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <input style={{ ...inp, flex:1, fontSize:12, padding:"5px 10px" }} placeholder="New tag…" value={newTagInput} onChange={e=>setNewTagInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"){e.preventDefault();addNewTag(setEditSupForm);}}} />
            <button type="button" onClick={()=>addNewTag(setEditSupForm)} style={{ ...btnS, padding:"5px 12px", fontSize:12, whiteSpace:"nowrap" }}>+ Add</button>
          </div>
        </FF>
        <button onClick={handleEditSupply} disabled={saving||!editSupForm.description.trim()} style={{ ...btnP, width:"100%", opacity:(saving||!editSupForm.description.trim())?.5:1, marginTop:4 }}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
        {isAdmin && (
          <button type="button" onClick={()=>{ const autoId = generateId(showEditSupply.description||"", items.map(i=>i.itemId)); setShowEditSupply(null); setMoveItemForm({ itemId:autoId, notes:"" }); setShowMoveToItem(showEditSupply); }} style={{ background:"none", border:"none", color:B.textLight, fontSize:12, cursor:"pointer", width:"100%", marginTop:8, fontFamily:f1 }}>
            Move to Inventory →
          </button>
        )}
      </Modal>

      {/* ═══ MOVE TO INVENTORY MODAL ═══ */}
      <Modal open={!!showMoveToItem} onClose={()=>setShowMoveToItem(null)} title={`Move to Inventory: ${showMoveToItem?.description||""}`}>
        <p style={{ fontSize:13, color:B.textMid, marginBottom:16 }}>
          Description, location, ministry, and tags will carry over. The supply record will be permanently deleted.
        </p>
        <FF label="Item ID (required)">
          <input style={{...inp, fontFamily:"monospace", letterSpacing:1}} value={moveItemForm.itemId} onChange={e=>setMoveItemForm({...moveItemForm, itemId:e.target.value.toUpperCase()})} placeholder="Auto-filled from description" autoFocus/>
        </FF>
        <FF label="Notes (optional)">
          <textarea style={{...inp, minHeight:60, resize:"vertical"}} value={moveItemForm.notes} onChange={e=>setMoveItemForm({...moveItemForm, notes:e.target.value})} placeholder="Any notes for the new item record…"/>
        </FF>
        <button onClick={handleMoveToItem} disabled={saving||moveItemForm.itemId.trim().length < 3} style={{ ...btnP, width:"100%", opacity:(saving||moveItemForm.itemId.trim().length < 3)?.5:1, marginTop:4 }}>
          {saving ? "Moving…" : "Move to Inventory"}
        </button>
      </Modal>

      {/* ═══ SUPPLY HISTORY MODAL ═══ */}
      <Modal open={!!showHistory} onClose={()=>setShowHistory(null)} title={`History: ${showHistory?.description||""}`}>
        {showHistory && (() => {
          const supplyLog = activityLog.filter(l => l.itemId === showHistory.supplyId);
          const icons = { add_supply:"➕", use_supply:"📉", restock:"📦" };
          const labels = { add_supply:"Added", use_supply:"Used", restock:"Restocked" };
          return supplyLog.length === 0
            ? <p style={{ color:B.textLight, fontSize:14, textAlign:"center", padding:20 }}>No history yet.</p>
            : <div style={{ maxHeight:400, overflowY:"auto", borderRadius:8, border:"1px solid "+B.sand }}>
                {supplyLog.slice(0, 100).map((l, i) => (
                  <div key={l._docId} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderBottom:i<supplyLog.length-1?"1px solid "+B.sand:"none", background:i%2===0?B.white:B.warmGray }}>
                    <span style={{ fontSize:16, flexShrink:0 }}>{icons[l.action]||"📋"}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:B.textDark }}>{labels[l.action]||l.action}</span>
                      {l.details?.quantityUsed != null && <span style={{ fontSize:12, color:B.red }}> −{l.details.quantityUsed}</span>}
                      {l.details?.quantityAdded != null && <span style={{ fontSize:12, color:B.teal }}> +{l.details.quantityAdded}</span>}
                      {(l.details?.purpose || l.details?.source) && <span style={{ fontSize:12, color:B.textMid }}> · {l.details.purpose||l.details.source}</span>}
                      {l.details?.remaining != null && <span style={{ fontSize:12, color:B.textLight }}> (→ {l.details.remaining} left)</span>}
                      <span style={{ fontSize:11, color:B.textLight }}> · {l.performedByName}</span>
                    </div>
                    <span style={{ fontSize:11, color:B.textLight, flexShrink:0 }}>{l.timestamp?.split("T")[0]}</span>
                  </div>
                ))}
              </div>;
        })()}
      </Modal>

      {/* ═══ USE SUPPLY MODAL ═══ */}
      <Modal open={!!showUse} onClose={()=>setShowUse(null)} title={`Log Usage: ${showUse?.description||""}`}>
        <div style={{ background:B.warmGray, borderRadius:10, padding:"12px 16px", marginBottom:16, fontSize:13, color:B.textMid }}>
          Current stock: <strong>{showUse?.quantity || 0}</strong> {showUse?.unit || "each"}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FF label="Quantity Used"><input style={inp} type="number" min="1" max={showUse?.quantity || 999} value={useForm.qty} onChange={e=>setUseForm({...useForm, qty:e.target.value})}/></FF>
          <FF label="Purpose"><input style={inp} value={useForm.purpose} onChange={e=>setUseForm({...useForm, purpose:e.target.value})} placeholder="e.g. Sunday service"/></FF>
        </div>
        {showUse && Number(useForm.qty) > (showUse.quantity || 0) && (
          <div style={{ background:B.redPale, borderRadius:8, padding:"8px 12px", fontSize:12, color:B.red, fontWeight:500, marginBottom:8 }}>
            This exceeds current stock ({showUse.quantity || 0} available)
          </div>
        )}
        <button onClick={handleUse} disabled={saving||!useForm.qty||Number(useForm.qty)<=0} style={{ ...btnP, width:"100%", opacity:(saving||!useForm.qty||Number(useForm.qty)<=0)?.5:1, marginTop:4 }}>
          {saving ? "Logging..." : "Log Usage"}
        </button>
      </Modal>

      {/* ═══ RESTOCK MODAL ═══ */}
      <Modal open={!!showRestock} onClose={()=>setShowRestock(null)} title={`Restock: ${showRestock?.description||""}`}>
        <div style={{ background:B.warmGray, borderRadius:10, padding:"12px 16px", marginBottom:16, fontSize:13, color:B.textMid }}>
          Current stock: <strong>{showRestock?.quantity || 0}</strong> {showRestock?.unit || "each"} · Min: {showRestock?.minQuantity || 5}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FF label="Quantity to Add"><input style={inp} type="number" min="1" value={restockForm.qty} onChange={e=>setRestockForm({...restockForm, qty:e.target.value})} placeholder="How many?"/></FF>
          <FF label="Source"><input style={inp} value={restockForm.source} onChange={e=>setRestockForm({...restockForm, source:e.target.value})} placeholder="e.g. Amazon, Walmart"/></FF>
        </div>
        <button onClick={handleRestock} disabled={saving||!restockForm.qty||Number(restockForm.qty)<=0} style={{ ...btnP, width:"100%", opacity:(saving||!restockForm.qty)?.5:1, marginTop:4 }}>
          {saving ? "Restocking..." : "Restock Supply"}
        </button>
      </Modal>
    </div>
  );
}
