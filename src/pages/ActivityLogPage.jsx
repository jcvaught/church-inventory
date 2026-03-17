import { useState } from 'react';
import { B, f1, inp, btnS } from '../components/brand/tokens.js';

export function ActivityLogPage({ store }) {
  const { activityLog } = store;
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [page, setPage] = useState(0);
  const perPage = 25;

  const actionLabels = {
    add_item:"Item Added", check_out:"Checked Out", return:"Returned",
    dispose:"Disposed", mark_repair:"Sent to Repair", mark_repaired:"Repair Complete",
    add_supply:"Supply Added", use_supply:"Supply Used", restock:"Restocked"
  };
  const actionIcons = {
    add_item:"➕", check_out:"📤", return:"↩️", dispose:"🗑️",
    mark_repair:"🔧", mark_repaired:"✅", add_supply:"📋",
    use_supply:"📉", restock:"📦"
  };
  const actionColors = {
    add_item:B.teal, check_out:"#1A65C7", return:B.teal,
    dispose:B.red, mark_repair:"#96750E", mark_repaired:B.teal,
    add_supply:B.teal, use_supply:"#96750E", restock:"#1A65C7"
  };

  const uniqueActions = [...new Set(activityLog.map(l => l.action))].sort();

  const filtered = activityLog.filter(l => {
    if (search) {
      const s = search.toLowerCase();
      if (!(l.itemId||"").toLowerCase().includes(s) &&
          !(l.performedByName||"").toLowerCase().includes(s) &&
          !(actionLabels[l.action]||l.action).toLowerCase().includes(s) &&
          !JSON.stringify(l.details||{}).toLowerCase().includes(s)) return false;
    }
    if (actionFilter !== "all" && l.action !== actionFilter) return false;
    if (dateFrom && (l.timestamp||"").split("T")[0] < dateFrom) return false;
    if (dateTo && (l.timestamp||"").split("T")[0] > dateTo) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(safePage * perPage, (safePage + 1) * perPage);

  function formatTs(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }) + " " +
           d.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" });
  }

  function detailRows(details) {
    if (!details || Object.keys(details).length === 0) return null;
    return Object.entries(details).filter(([,v]) => v !== undefined && v !== "").map(([k,v]) => (
      <div key={k} style={{ display:"flex", gap:8, fontSize:13, padding:"3px 0" }}>
        <span style={{ color:B.textLight, fontWeight:600, minWidth:120, textTransform:"capitalize" }}>{k.replace(/([A-Z])/g, " $1")}:</span>
        <span style={{ color:B.textDark }}>{String(v)}</span>
      </div>
    ));
  }

  function handleClearFilters() { setSearch(""); setActionFilter("all"); setDateFrom(""); setDateTo(""); setPage(0); }

  const hasFilters = search || actionFilter !== "all" || dateFrom || dateTo;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <h2 style={{ fontFamily:f1, fontSize:22, fontWeight:700, color:B.navy, margin:0 }}>Activity Log</h2>
        <span style={{ fontSize:13, color:B.textLight, fontFamily:f1 }}>{filtered.length} entr{filtered.length===1?"y":"ies"}</span>
      </div>

      {/* Filters */}
      <div style={{ background:B.white, borderRadius:14, padding:"18px 22px", border:"1px solid "+B.sand, marginBottom:20, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
          <div style={{ flex:"1 1 200px" }}>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:B.textLight, marginBottom:4, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1 }}>Search</label>
            <input style={inp} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Item ID, person, details..." />
          </div>
          <div style={{ flex:"0 0 170px" }}>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:B.textLight, marginBottom:4, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1 }}>Action</label>
            <select style={{...inp, cursor:"pointer"}} value={actionFilter} onChange={e=>{setActionFilter(e.target.value);setPage(0);}}>
              <option value="all">All Actions</option>
              {uniqueActions.map(a => <option key={a} value={a}>{actionLabels[a]||a}</option>)}
            </select>
          </div>
          <div style={{ flex:"0 0 150px" }}>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:B.textLight, marginBottom:4, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1 }}>From</label>
            <input type="date" style={inp} value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setPage(0);}} />
          </div>
          <div style={{ flex:"0 0 150px" }}>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:B.textLight, marginBottom:4, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1 }}>To</label>
            <input type="date" style={inp} value={dateTo} onChange={e=>{
              if (dateFrom && e.target.value && e.target.value < dateFrom) { setDateTo(""); return; }
              setDateTo(e.target.value); setPage(0);
            }} />
          </div>
          {hasFilters && (
            <button onClick={handleClearFilters} style={{ ...btnS, padding:"10px 16px", fontSize:12, whiteSpace:"nowrap" }}>Clear All</button>
          )}
        </div>
      </div>

      {/* Log Entries */}
      <div style={{ background:B.white, borderRadius:14, border:"1px solid "+B.sand, overflow:"hidden", boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        {pageItems.length === 0 ? (
          <div style={{ padding:"48px 32px", textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
            <p style={{ color:B.textLight, fontSize:15 }}>{hasFilters ? "No entries match your filters." : "No activity recorded yet."}</p>
          </div>
        ) : (
          <div>
            {pageItems.map((l, i) => {
              const isOpen = expanded === l._docId;
              const dets = detailRows(l.details);
              return (
                <div key={l._docId}
                  style={{ borderBottom: i < pageItems.length-1 ? "1px solid "+B.sand : "none", cursor: dets ? "pointer" : "default" }}
                  onClick={() => dets && setExpanded(isOpen ? null : l._docId)}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 22px" }}>
                    <span style={{ fontSize:18, flexShrink:0 }}>{actionIcons[l.action]||"📋"}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                        <span style={{ fontWeight:700, fontSize:14, fontFamily:f1, color: actionColors[l.action] || B.navy }}>{actionLabels[l.action]||l.action}</span>
                        <span style={{ padding:"2px 10px", borderRadius:20, background:B.warmGray, fontSize:12, color:B.textMid, fontFamily:"monospace" }}>{l.itemId}</span>
                      </div>
                      <div style={{ fontSize:13, color:B.textMid, marginTop:2 }}>
                        by <span style={{ fontWeight:600 }}>{l.performedByName||"Unknown"}</span>
                        <span style={{ color:B.textLight, marginLeft:8 }}>{formatTs(l.timestamp)}</span>
                      </div>
                    </div>
                    {dets && (
                      <span style={{ fontSize:12, color:B.textLight, transition:"transform 0.2s", transform: isOpen ? "rotate(180deg)" : "none" }}>▾</span>
                    )}
                  </div>
                  {isOpen && dets && (
                    <div style={{ padding:"0 22px 14px 52px", background:B.warmGray, borderTop:"1px solid "+B.sand }}>
                      <div style={{ padding:"12px 16px" }}>{dets}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:8, padding:"16px 22px", borderTop:"1px solid "+B.sand }}>
            <button disabled={safePage===0} onClick={()=>setPage(safePage-1)} style={{ ...btnS, padding:"6px 14px", fontSize:12, opacity:safePage===0?.5:1 }}>← Prev</button>
            <span style={{ fontSize:13, color:B.textMid, fontFamily:f1 }}>Page {safePage+1} of {totalPages}</span>
            <button disabled={safePage>=totalPages-1} onClick={()=>setPage(safePage+1)} style={{ ...btnS, padding:"6px 14px", fontSize:12, opacity:safePage>=totalPages-1?.5:1 }}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
