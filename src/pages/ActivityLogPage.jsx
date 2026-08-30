import { useState, useMemo, useContext } from 'react';
import { B, f1, inp, btnS } from '../components/brand/tokens.js';
import { MobileCtx } from '../hooks/useMobile.js';
import { actionLabels, actionIcons, actionColors } from '../utils/activityLabels.js';
import { EmojiIcon } from '../components/primitives/EmojiIcon.jsx';

// Audit overnight 2026-05-12 / Perf #1: the activityLog subscription is
// capped at 100 most-recent entries to avoid unbounded reads. Older entries
// load on demand via store.loadOlderActivityLog when the user clicks the
// "Load older" button below.

const ACTION_HUB = {
  add_item: "Inventory", edit_item: "Inventory", check_out: "Inventory", return: "Inventory", dispose: "Inventory", delete_item: "Inventory", mark_repair: "Inventory", mark_repaired: "Inventory",
  add_supply: "Supplies", edit_supply: "Supplies", use_supply: "Supplies", restock: "Supplies", delete_supply: "Supplies",
  post_job: "Jobs", update_job: "Jobs", delete_job: "Jobs", signup_job: "Jobs", withdraw_job: "Jobs", admin_remove_job: "Jobs", post_announcement: "Jobs", update_announcement: "Jobs", delete_announcement: "Jobs",
  add_task: "Tasks", update_task: "Tasks", complete_task: "Tasks", delete_task: "Tasks", create_template: "Tasks", delete_template: "Tasks",
  add_ticket: "Maintenance", update_ticket: "Maintenance",
};

// Detail keys we never render as human-facing rows — raw UIDs are debug-only,
// not useful to volunteers or admins. Engineering reads them via Firestore /
// Sentry. Stops leaks like "Removed Uid: jgHRMpU4xR…" appearing under a
// withdraw row when an admin removes a volunteer.
const HIDDEN_DETAIL_KEYS = new Set(['removedUid', 'addedUid', 'mentionedUid', 'uid', 'actorUid', 'targetUid']);

export function ActivityLogPage({ store, userProfile }) {
  const { activityLog, loadOlderActivityLog } = store;
  const isMobile = useContext(MobileCtx);
  const isAdminOrManager = userProfile?.role === 'admin' || userProfile?.role === 'manager';
  const userId = userProfile?.id || userProfile?.uid;
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [hubFilter, setHubFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [page, setPage] = useState(0);
  const [olderEntries, setOlderEntries] = useState([]);   // appended pages of older entries
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const perPage = 25;

  // Merge the live (capped-at-100) feed with whatever older pages the user
  // has explicitly loaded. Dedupe by _docId in case an entry briefly appears
  // in both as the live cap shifts.
  const allEntries = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const e of activityLog) { if (e._docId && !seen.has(e._docId)) { seen.add(e._docId); out.push(e); } }
    for (const e of olderEntries) { if (e._docId && !seen.has(e._docId)) { seen.add(e._docId); out.push(e); } }
    return out;
  }, [activityLog, olderEntries]);

  async function handleLoadOlder() {
    if (loadingOlder || reachedEnd) return;
    const oldest = allEntries[allEntries.length - 1];
    if (!oldest?.timestamp) { setReachedEnd(true); return; }
    setLoadingOlder(true);
    const next = await loadOlderActivityLog(oldest._timestampCursor || oldest.timestamp, 100);
    setLoadingOlder(false);
    if (next.length === 0) { setReachedEnd(true); return; }
    setOlderEntries(prev => [...prev, ...next]);
  }

  const uniqueActions = useMemo(() => [...new Set(allEntries.map(l => l.action))].sort(), [allEntries]);

  const filtered = useMemo(() => allEntries.filter(l => {
    // Non-admin/manager only see their own activity — keeps volunteers from
    // scrolling an admin-shaped feed full of items/supplies/maintenance.
    if (!isAdminOrManager && l.performedBy !== userId) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(l.itemId||"").toLowerCase().includes(s) &&
          !(l.performedByName||"").toLowerCase().includes(s) &&
          !(actionLabels[l.action]||l.action).toLowerCase().includes(s) &&
          !JSON.stringify(l.details||{}).toLowerCase().includes(s)) return false;
    }
    if (actionFilter !== "all" && l.action !== actionFilter) return false;
    if (hubFilter !== "all" && (ACTION_HUB[l.action] || "Other") !== hubFilter) return false;
    if (dateFrom && (l.timestamp||"").split("T")[0] < dateFrom) return false;
    if (dateTo && (l.timestamp||"").split("T")[0] > dateTo) return false;
    return true;
  }), [allEntries, search, actionFilter, hubFilter, dateFrom, dateTo, isAdminOrManager, userId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(safePage * perPage, (safePage + 1) * perPage);

  function formatTs(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }) + " " +
           d.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" });
  }
  function tsTitle(ts) {
    if (!ts) return undefined;
    const d = new Date(ts);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
    return `${d.toLocaleString("en-US", { dateStyle:"full", timeStyle:"long" })} (${tz})`;
  }

  function detailRows(details) {
    if (!details || Object.keys(details).length === 0) return null;
    return Object.entries(details)
      .filter(([k,v]) => v !== undefined && v !== null && v !== "" && !HIDDEN_DETAIL_KEYS.has(k))
      .map(([k,v]) => (
      <div key={k} style={{ display:"flex", gap:8, fontSize:13, padding:"3px 0" }}>
        <span style={{ color:B.textLight, fontWeight:600, minWidth:120, textTransform:"capitalize" }}>{k.replace(/([A-Z])/g, " $1")}:</span>
        <span style={{ color:B.textDark }}>{String(v)}</span>
      </div>
    ));
  }

  function handleClearFilters() { setSearch(""); setActionFilter("all"); setHubFilter("all"); setDateFrom(""); setDateTo(""); setPage(0); setExpanded(null); }

  const hasFilters = search || actionFilter !== "all" || hubFilter !== "all" || dateFrom || dateTo;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <h2 style={{ fontFamily:f1, fontSize:22, fontWeight:700, color:B.navy, margin:0 }}>Activity Log</h2>
        <span style={{ fontSize:13, color:B.textLight, fontFamily:f1 }}>{filtered.length} entr{filtered.length===1?"y":"ies"}</span>
      </div>

      {/* Filters */}
      <div style={{ background:B.white, borderRadius:14, padding:"18px 22px", border:"1px solid "+B.sand, marginBottom:20, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:B.textLight, marginBottom:4, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1 }}>Search</label>
            <div style={{ position:"relative" }}>
              <input style={{ ...inp, paddingRight: search ? 36 : undefined }} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);setExpanded(null);}} placeholder="Item ID, person, details..." />
              {search && (
                <button type="button" onClick={()=>{setSearch("");setPage(0);setExpanded(null);}} aria-label="Clear search" title="Clear search" style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:B.textLight, fontSize:18, lineHeight:1, padding:"4px 8px" }}>×</button>
              )}
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4, 1fr)", gap:10 }}>
            <div>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:B.textLight, marginBottom:4, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1 }}>Hub</label>
              <select style={{...inp, cursor:"pointer"}} value={hubFilter} onChange={e=>{setHubFilter(e.target.value);setPage(0);setExpanded(null);}}>
                <option value="all">All Hubs</option>
                <option value="Inventory">Inventory</option>
                <option value="Supplies">Supplies</option>
                <option value="Jobs">Job Hub</option>
                <option value="Tasks">Tasks Hub</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </div>
            <div>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:B.textLight, marginBottom:4, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1 }}>Action</label>
              <select style={{...inp, cursor:"pointer"}} value={actionFilter} onChange={e=>{setActionFilter(e.target.value);setPage(0);setExpanded(null);}}>
                <option value="all">All Actions</option>
                {uniqueActions.map(a => <option key={a} value={a}>{actionLabels[a]||a}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:B.textLight, marginBottom:4, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1 }}>From</label>
              <input type="date" style={inp} value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setPage(0);setExpanded(null);}} />
            </div>
            <div style={isMobile ? { gridColumn:"1/-1" } : {}}>
              <label style={{ display:"block", fontSize:11, fontWeight:600, color:B.textLight, marginBottom:4, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1 }}>To</label>
              <input type="date" style={inp} value={dateTo} min={dateFrom || undefined} onChange={e=>{setDateTo(e.target.value);setPage(0);setExpanded(null);}} />
            </div>
          </div>
          {hasFilters && (
            <button onClick={handleClearFilters} style={{ ...btnS, padding:"10px 16px", fontSize:12, whiteSpace:"nowrap", alignSelf:"flex-start" }}>Clear All</button>
          )}
        </div>
      </div>

      {/* Log Entries */}
      <div style={{ background:B.white, borderRadius:14, border:"1px solid "+B.sand, overflow:"hidden", boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        {pageItems.length === 0 ? (
          <div style={{ padding:"48px 32px", textAlign:"center" }}>
            <div aria-hidden="true" style={{ fontSize:40, marginBottom:12 }}>📋</div>
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
                    <EmojiIcon emoji={actionIcons[l.action]||"📋"} decorative style={{ fontSize:18, flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                        <span style={{ fontWeight:700, fontSize:14, fontFamily:f1, color: actionColors[l.action] || B.navy }}>{actionLabels[l.action]||l.action}</span>
                        <span style={{ padding:"2px 10px", borderRadius:20, background:B.warmGray, fontSize:12, color:B.textMid, fontFamily:"monospace" }}>{l.itemId}</span>
                      </div>
                      <div style={{ fontSize:13, color:B.textMid, marginTop:2 }}>
                        by <span style={{ fontWeight:600 }}>{l.performedByName||"Unknown"}</span>
                        <span title={tsTitle(l.timestamp)} style={{ color:B.textLight, marginLeft:8 }}>{formatTs(l.timestamp)}</span>
                      </div>
                    </div>
                    {dets && (
                      <span style={{ fontSize:12, color:B.textLight, transition:"transform 0.2s", transform: isOpen ? "rotate(180deg)" : "none" }}>▾</span>
                    )}
                  </div>
                  {isOpen && dets && (
                    <div style={{ padding:isMobile?"0 14px 14px 14px":"0 22px 14px 52px", background:B.warmGray, borderTop:"1px solid "+B.sand }}>
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

        {/* Load older entries from Firestore (one-shot, no real-time) */}
        {!reachedEnd && safePage >= totalPages - 1 && (
          <div style={{ display:"flex", justifyContent:"center", padding:"12px 22px", borderTop: totalPages > 1 ? "none" : "1px solid "+B.sand }}>
            <button onClick={handleLoadOlder} disabled={loadingOlder} style={{ ...btnS, padding:"8px 18px", fontSize:13, opacity: loadingOlder ? 0.6 : 1 }}>
              {loadingOlder ? "Loading…" : "Load older entries"}
            </button>
          </div>
        )}
        {reachedEnd && (
          <div style={{ textAlign:"center", padding:"12px 22px", fontSize:12, color:B.textLight, fontFamily:f1, borderTop: totalPages > 1 ? "none" : "1px solid "+B.sand }}>
            End of activity log
          </div>
        )}
      </div>
    </div>
  );
}
