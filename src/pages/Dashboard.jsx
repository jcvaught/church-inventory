import { useState, useMemo } from 'react';
import { B, f1, f2 } from '../components/brand/tokens.js';
import { ITEM_STATUS, RES_STATUS } from '../utils/constants.js';
import { Badge } from '../components/primitives/Badge.jsx';
import { Stat } from '../components/primitives/Stat.jsx';

export function Dashboard({ store, userProfile }) {
  const { items, supplies, activityLog, reservations } = store;
  const [myCheckouts, setMyCheckouts] = useState(false);
  const [activityRange, setActivityRange] = useState(30);
  const [activityVisible, setActivityVisible] = useState(20);
  const activeItems = useMemo(() => items.filter(i => i.status !== ITEM_STATUS.DISPOSED), [items]);
  const counts = useMemo(() => ({
    total: activeItems.length,
    avail: activeItems.filter(i => i.status === ITEM_STATUS.AVAILABLE).length,
    inUse: activeItems.filter(i => i.status === ITEM_STATUS.IN_USE).length,
    co: activeItems.filter(i => i.status === ITEM_STATUS.CHECKED_OUT).length,
    repair: activeItems.filter(i => i.status === ITEM_STATUS.UNDER_REPAIR).length,
  }), [activeItems]);

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const myName = userProfile?.name || "";
  const isAdmin = userProfile?.role === "admin";
  const isManager = userProfile?.role === "manager";
  const checkedOut = useMemo(() => activeItems.filter(i => i.status === ITEM_STATUS.CHECKED_OUT), [activeItems]);
  const displayedCheckouts = useMemo(() => myCheckouts ? checkedOut.filter(i => i.assignedTo === myName) : checkedOut, [myCheckouts, checkedOut, myName]);
  const overdue = useMemo(() => checkedOut.filter(i => i.expectedReturn && i.expectedReturn < today), [checkedOut, today]);
  const lowStock = useMemo(() => supplies.filter(c => c.quantity <= c.minQuantity), [supplies]);
  const pendingRes = useMemo(() => reservations.filter(r => r.status === RES_STATUS.PENDING), [reservations]);

  const activityFiltered = useMemo(() => {
    const cutoff = activityRange === "all" ? null : new Date(Date.now() - activityRange * 86400000).toISOString();
    return cutoff ? activityLog.filter(l => l.timestamp >= cutoff) : activityLog;
  }, [activityRange, activityLog]);

  return (
    <div>
      <h2 style={{ fontFamily:f1, fontSize:22, fontWeight:700, color:B.navy, margin:"0 0 20px" }}>Dashboard</h2>

      <div style={{ display:"flex", flexWrap:"wrap", gap:14, marginBottom:24 }}>
        <Stat label="Total Items" value={counts.total} icon="📦"/>
        <Stat label="Available" value={counts.avail} icon="✅" color={B.teal}/>
        <Stat label="In Use" value={counts.inUse} icon="🔵" color="#1A65C7"/>
        <Stat label="Checked Out" value={counts.co} icon="🟡" color="#96750E"/>
        <Stat label="Repair" value={counts.repair} icon="🔴" color={B.red}/>
      </div>

      {/* Overdue Alert */}
      {overdue.length > 0 && (
        <div style={{ background:B.redPale, border:"1px solid #FECACA", borderLeft:"4px solid "+B.red, borderRadius:14, padding:"18px 22px", marginBottom:20 }}>
          <h3 style={{ margin:"0 0 12px", fontSize:15, fontFamily:f1, fontWeight:700, color:B.red }}>
            Overdue Items ({overdue.length})
          </h3>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {overdue.map(item => {
              const daysOver = Math.ceil((new Date(today) - new Date(item.expectedReturn)) / 86400000);
              return (
                <div key={item._docId} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:10, background:B.white, flexWrap:"wrap", gap:8 }}>
                  <div>
                    <span style={{ fontWeight:600, fontSize:14 }}>{item.description}</span>
                    <span style={{ color:B.textLight, fontSize:13, marginLeft:8 }}>{item.itemId}</span>
                    {item.assignedTo && <span style={{ color:B.textMid, fontSize:13 }}> — {item.assignedTo}</span>}
                  </div>
                  <span style={{ color:B.red, fontWeight:700, fontSize:13, fontFamily:f1 }}>{daysOver} day{daysOver!==1&&"s"} overdue</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <div style={{ background:"#FFF8E1", border:"1px solid #FFECB3", borderLeft:"4px solid "+B.gold, borderRadius:14, padding:"18px 22px", marginBottom:20 }}>
          <h3 style={{ margin:"0 0 12px", fontSize:15, fontFamily:f1, fontWeight:700, color:"#96750E" }}>Low Stock ({lowStock.length})</h3>
          {lowStock.map(c => (
            <div key={c._docId} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 14px", borderRadius:8, background:B.white, marginBottom:6, flexWrap:"wrap", gap:8 }}>
              <span style={{ fontWeight:600, fontSize:14 }}>{c.description}</span>
              <span style={{ color:"#96750E", fontWeight:600, fontSize:13 }}>{c.quantity} left (min: {c.minQuantity})</span>
            </div>
          ))}
        </div>
      )}

      {/* Pending Reservations — admin/manager only */}
      {(isAdmin || isManager) && pendingRes.length > 0 && (
        <div style={{ background:"#EDE7F6", border:"1px solid #D1C4E9", borderLeft:"4px solid #7C5BA0", borderRadius:14, padding:"18px 22px", marginBottom:20 }}>
          <h3 style={{ margin:"0 0 12px", fontSize:15, fontFamily:f1, fontWeight:700, color:"#7C5BA0" }}>Pending Reservations ({pendingRes.length})</h3>
          {pendingRes.map(r => (
            <div key={r._docId} style={{ padding:"8px 14px", borderRadius:8, background:B.white, marginBottom:6, fontSize:14 }}>
              <span style={{ fontWeight:600 }}>{r.itemDesc}</span>
              <span style={{ color:B.textLight }}> — {r.requestedByName} for {r.purpose || r.eventName} ({r.eventDate})</span>
            </div>
          ))}
        </div>
      )}

      {/* Checked Out */}
      <div style={{ background:B.white, borderRadius:14, padding:24, border:"1px solid "+B.sand, boxShadow:"0 1px 3px rgba(27,42,74,0.06)", marginBottom:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
          <h3 style={{ margin:0, fontFamily:f1, fontSize:17, fontWeight:700, color:B.navy }}>Currently Checked Out</h3>
          {checkedOut.length > 0 && (
            <div style={{ display:"flex", borderRadius:8, overflow:"hidden", border:"1px solid "+B.sand }}>
              <button onClick={()=>setMyCheckouts(false)} style={{ padding:"5px 14px", fontSize:12, fontFamily:f1, fontWeight:600, border:"none", cursor:"pointer", background:!myCheckouts?B.teal:B.white, color:!myCheckouts?B.white:B.textMid }}>All</button>
              <button onClick={()=>setMyCheckouts(true)} style={{ padding:"5px 14px", fontSize:12, fontFamily:f1, fontWeight:600, border:"none", borderLeft:"1px solid "+B.sand, cursor:"pointer", background:myCheckouts?B.teal:B.white, color:myCheckouts?B.white:B.textMid }}>Mine</button>
            </div>
          )}
        </div>
        {displayedCheckouts.length === 0 ? <p style={{ color:B.textLight, fontSize:14 }}>{myCheckouts ? "You have no items checked out." : "No items currently checked out."}</p> :
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {displayedCheckouts.map(item => (
              <div key={item._docId} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderRadius:10, background:B.goldLight, border:"1px solid #E8DFC0", flexWrap:"wrap", gap:8 }}>
                <div>
                  <span style={{ fontWeight:600, fontSize:14 }}>{item.description}</span>
                  <span style={{ color:B.textLight, fontSize:13, marginLeft:8 }}>{item.itemId}</span>
                  {item.assignedTo && <span style={{ color:B.textMid, fontSize:13 }}> — {item.assignedTo}</span>}
                </div>
                <Badge status="Checked Out" />
              </div>
            ))}
          </div>
        }
      </div>

      {/* Recent Activity */}
      <div style={{ background:B.white, borderRadius:14, padding:24, border:"1px solid "+B.sand, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
          <h3 style={{ margin:0, fontFamily:f1, fontSize:17, fontWeight:700, color:B.navy }}>Recent Activity</h3>
          <div style={{ display:"flex", borderRadius:8, overflow:"hidden", border:"1px solid "+B.sand }}>
            {[7,30,90,"all"].map(r => (
              <button key={r} onClick={()=>{ setActivityRange(r); setActivityVisible(20); }}
                style={{ padding:"5px 12px", fontSize:12, fontFamily:f1, fontWeight:600, border:"none", borderLeft: r!==7 ? "1px solid "+B.sand : "none", cursor:"pointer", background:activityRange===r?B.teal:B.white, color:activityRange===r?B.white:B.textMid }}>
                {r === "all" ? "All" : `${r}d`}
              </button>
            ))}
          </div>
        </div>
        {(() => {
          const icons = { add_item:"➕", edit_item:"✏️", check_out:"📤", return:"↩️", dispose:"🗑️", restock:"📦", use_supply:"📉", mark_repair:"🔧", mark_repaired:"✅", add_supply:"📋", edit_supply:"✏️", reservation_approved:"✅📅", reservation_denied:"❌📅" };
          const labels = { add_item:"Item Added", edit_item:"Item Edited", check_out:"Checked Out", return:"Returned", dispose:"Disposed", mark_repair:"Sent to Repair", mark_repaired:"Repair Complete", add_supply:"Supply Added", edit_supply:"Supply Edited", use_supply:"Supply Used", restock:"Restocked", reservation_approved:"Reservation Approved", reservation_denied:"Reservation Denied" };
          return activityFiltered.length === 0
            ? <p style={{ color:B.textLight, fontSize:14 }}>{activityLog.length === 0 ? "No activity yet. Start by adding items to your inventory!" : `No activity in the last ${activityRange} days.`}</p>
            : <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {activityFiltered.slice(0, activityVisible).map(l => (
                  <div key={l._docId} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 14px", borderRadius:8, background:B.warmGray }}>
                    <span style={{ fontSize:16 }}>{icons[l.action]||"📋"}</span>
                    <div style={{ flex:1 }}>
                      <span style={{ fontWeight:600, fontSize:13 }}>{labels[l.action]||l.action.replace(/_/g," ")}</span>
                      <span style={{ color:B.textLight, fontSize:12, marginLeft:6 }}>({l.itemId})</span>
                      <span style={{ color:B.textMid, fontSize:12 }}> — {l.performedByName}</span>
                    </div>
                    <span style={{ fontSize:11, color:B.textLight }}>{l.timestamp?.split("T")[0]}</span>
                  </div>
                ))}
                {activityFiltered.length > activityVisible && (
                  <button onClick={()=>setActivityVisible(v=>v+20)} style={{ alignSelf:"center", marginTop:4, background:"none", border:"1px solid "+B.sand, borderRadius:8, padding:"7px 20px", fontSize:13, fontFamily:f1, fontWeight:600, color:B.teal, cursor:"pointer" }}>
                    Load more ({activityFiltered.length - activityVisible} remaining)
                  </button>
                )}
              </div>;
        })()}
      </div>

      {/* Empty state */}
      {counts.total === 0 && supplies.length === 0 && activityLog.length === 0 && (
        <div style={{ background:B.white, borderRadius:18, padding:"48px 32px", border:"1px solid "+B.sand, textAlign:"center", marginTop:24 }}>
          <div style={{ fontSize:48, marginBottom:16 }}>🚀</div>
          <h3 style={{ fontFamily:f1, color:B.navy, margin:"0 0 8px", fontSize:20 }}>Your inventory is empty</h3>
          <p style={{ color:B.textLight, fontSize:15, maxWidth:400, margin:"0 auto 20px" }}>
            Start by checking your locations and ministries in Settings, then add your first item!
          </p>
        </div>
      )}
    </div>
  );
}
