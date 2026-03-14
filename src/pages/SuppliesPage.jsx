import { useState, useContext } from 'react';
import { B, f1, f2, inp, btnP, btnS } from '../components/brand/tokens.js';
import { MobileCtx } from '../hooks/useMobile.js';
import { Modal } from '../components/primitives/Modal.jsx';
import { FF } from '../components/primitives/FF.jsx';
import { exportSuppliesCSV } from '../utils/csv.js';

export function SuppliesPage({ store, userProfile }) {
  const { supplies, settings, activityLog, addSupply, updateSupply, useSupply, restockSupply } = store;
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
  const emptySupply = { supplyId:"", description:"", location:"", ministry:"", quantity:0, minQuantity:5, unit:"each" };
  const [supForm, setSupForm] = useState(emptySupply);
  const [editSupForm, setEditSupForm] = useState(emptySupply);
  const [useForm, setUseForm] = useState({ qty:"1", purpose:"" });
  const [restockForm, setRestockForm] = useState({ qty:"", source:"" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const locations = settings?.locations || [];
  const ministries = settings?.ministries || [];
  const userId = userProfile?.id || userProfile?.uid;
  const userName = userProfile?.name || "Unknown";

  function flash(text) { setMsg(text); setTimeout(()=>setMsg(""), 3000); }

  // Filter
  const filtered = supplies.filter(s => {
    if (search && !s.description?.toLowerCase().includes(search.toLowerCase()) && !s.supplyId?.toLowerCase().includes(search.toLowerCase())) return false;
    if (showLowOnly && s.quantity > s.minQuantity) return false;
    return true;
  });

  const lowCount = supplies.filter(s => s.quantity <= s.minQuantity).length;

  // ── Add ──
  async function handleAdd() {
    if (!supForm.supplyId.trim() || !supForm.description.trim()) return;
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
      unit: supForm.unit || "each"
    }, userId, userName);
    setShowAdd(false);
    setSupForm(emptySupply);
    setSaving(false);
    flash("Supply added!");
  }

  // ── Edit Supply ──
  async function handleEditSupply() {
    if (!showEditSupply || !editSupForm.description.trim()) return;
    setSaving(true);
    await updateSupply(showEditSupply._docId, {
      description: editSupForm.description.trim(),
      location: editSupForm.location,
      ministry: editSupForm.ministry,
      minQuantity: Number(editSupForm.minQuantity) || 5,
      unit: editSupForm.unit || "each"
    });
    setShowEditSupply(null);
    setSaving(false);
    flash("Supply updated!");
  }

  // ── Use ──
  async function handleUse() {
    if (!showUse || !useForm.qty || Number(useForm.qty) <= 0) return;
    setSaving(true);
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
          {supplies.length > 0 && <button onClick={()=>exportSuppliesCSV(supplies)} style={{ ...btnS, fontSize:13, padding:"9px 18px" }}>⬇ Export CSV</button>}
          <button onClick={()=>{setSupForm(emptySupply);setShowAdd(true);}} style={btnP}>+ Add Supply</button>
        </div>
      </div>

      {msg && <div style={{ background:B.tealPale, border:"1px solid "+B.teal, borderRadius:10, padding:"10px 16px", marginBottom:16, color:B.teal, fontWeight:600, fontSize:13, fontFamily:f1 }}>{msg}</div>}

      {/* Low Stock Banner */}
      {lowCount > 0 && (
        <div style={{ background:"#FFF8E1", border:"1px solid #FFECB3", borderLeft:"4px solid "+B.gold, borderRadius:14, padding:"14px 20px", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
          <span style={{ fontSize:14, fontWeight:600, color:"#96750E", fontFamily:f1 }}>⚠️ {lowCount} supply{lowCount!==1?"items":""} at or below minimum stock</span>
          <button onClick={()=>setShowLowOnly(!showLowOnly)} style={{ ...btnS, padding:"6px 14px", fontSize:12, borderColor:"#FFECB3", color:"#96750E" }}>
            {showLowOnly ? "Show all" : "Show low stock only"}
          </button>
        </div>
      )}

      {/* Search */}
      <div style={{ background:B.white, borderRadius:14, padding:"16px 20px", border:"1px solid "+B.sand, marginBottom:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <div style={{ position:"relative" }}>
          <input
            style={{...inp, paddingLeft:36}}
            placeholder="Search supplies..."
            value={search} onChange={e=>setSearch(e.target.value)}
          />
          <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:14, color:B.textLight }}>🔍</span>
        </div>
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

                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:12 }}>
                  <span style={{ fontSize:11, color:B.textLight, fontFamily:f1 }}>
                    Min: {s.minQuantity || 5} {s.unit || "each"}
                    {s.lastRestocked && ` · Restocked ${s.lastRestocked.split("T")[0]}`}
                  </span>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={()=>setShowHistory(s)} style={{ ...btnS, padding:"5px 12px", fontSize:11 }}>History</button>
                    <button onClick={()=>{setEditSupForm({ supplyId:s.supplyId, description:s.description, location:s.location||"", ministry:s.ministry||"", quantity:s.quantity, minQuantity:s.minQuantity||5, unit:s.unit||"each" });setShowEditSupply(s);}} style={{ ...btnS, padding:"5px 12px", fontSize:11 }}>Edit</button>
                    <button onClick={()=>{setUseForm({ qty:"1", purpose:"" });setShowUse(s);}} style={{ ...btnS, padding:"5px 12px", fontSize:11 }}>Use</button>
                    <button onClick={()=>{setRestockForm({ qty:"", source:"" });setShowRestock(s);}} style={{ ...btnP, padding:"5px 12px", fontSize:11 }}>Restock</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ ADD SUPPLY MODAL ═══ */}
      <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Add New Supply">
        <FF label="Supply ID"><input style={{...inp, fontFamily:"monospace", letterSpacing:1}} value={supForm.supplyId} onChange={e=>setSupForm({...supForm, supplyId:e.target.value.toUpperCase()})} placeholder="e.g. BAT-AA"/></FF>
        <FF label="Description"><input style={inp} value={supForm.description} onChange={e=>setSupForm({...supForm, description:e.target.value})} placeholder="e.g. AA Batteries"/></FF>
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
        <button onClick={handleEditSupply} disabled={saving||!editSupForm.description.trim()} style={{ ...btnP, width:"100%", opacity:(saving||!editSupForm.description.trim())?.5:1, marginTop:4 }}>
          {saving ? "Saving..." : "Save Changes"}
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
        <button onClick={handleUse} disabled={saving||!useForm.qty||Number(useForm.qty)<=0} style={{ ...btnP, width:"100%", opacity:(saving||!useForm.qty)?.5:1, marginTop:4 }}>
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
