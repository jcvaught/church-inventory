import { useState, useEffect } from 'react';
import { useFirestore } from './useFirestore.js';
import { SEED_ELECTRONICS, SEED_TOOLS, SEED_CONSUMABLES, SEED_USERS } from './data/seedData.js';

/* ───────── PIN / Access Gate ───────── */
// ╔══════════════════════════════════════════════════════════════╗
// ║  CHANGE YOUR PIN HERE                                       ║
// ║  Set this to any number/word your team will share.          ║
// ║  Set to "" (empty string) to disable the PIN gate entirely. ║
// ╚══════════════════════════════════════════════════════════════╝
const ACCESS_PIN = "1023";

function PinGate({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const f1 = "'Playfair Display',serif";
  const f2 = "'DM Sans',sans-serif";

  function handleSubmit() {
    if (pin === ACCESS_PIN) {
      try { sessionStorage.setItem("church-inv-auth", "1"); } catch(e) {}
      onUnlock();
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPin("");
    }
  }

  return (
    <div style={{ fontFamily:f2,display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"linear-gradient(170deg,#f8f5ee 0%,#f0ece4 50%,#e8e2d6 100%)" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }`}</style>
      <div style={{ background:"#fff",borderRadius:20,padding:"48px 40px",maxWidth:380,width:"90%",boxShadow:"0 8px 40px rgba(0,0,0,.1)",textAlign:"center",animation:shake?"shake .4s ease":"none" }}>
        <div style={{ width:64,height:64,borderRadius:16,background:"#f0ece4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,margin:"0 auto 20px" }}>⛪</div>
        <h1 style={{ fontFamily:f1,fontSize:24,margin:"0 0 8px",color:"#3d3428" }}>Church Inventory</h1>
        <p style={{ color:"#8a7f72",fontSize:14,margin:"0 0 28px" }}>Enter the team PIN to continue</p>
        <input
          type="password"
          inputMode="numeric"
          placeholder="Enter PIN"
          value={pin}
          onChange={e => { setPin(e.target.value); setError(false); }}
          onKeyDown={e => e.key==="Enter" && handleSubmit()}
          style={{ width:"100%",padding:"14px 16px",borderRadius:12,border:error?"2px solid #ef5350":"2px solid #e0d9cd",fontSize:20,fontFamily:f2,textAlign:"center",letterSpacing:8,boxSizing:"border-box",outline:"none",background:"#fafaf6",transition:"border .2s" }}
          autoFocus
        />
        {error && <p style={{ color:"#ef5350",fontSize:13,margin:"10px 0 0",fontWeight:600 }}>Incorrect PIN. Please try again.</p>}
        <button
          onClick={handleSubmit}
          style={{ marginTop:20,width:"100%",padding:"14px",borderRadius:12,border:"none",background:"#5b7a5e",color:"#fff",fontSize:16,fontWeight:600,cursor:"pointer",fontFamily:f2,letterSpacing:.3,transition:"background .2s" }}
        >
          Unlock
        </button>
        <p style={{ color:"#b0a898",fontSize:12,margin:"20px 0 0" }}>Ask your church administrator for the PIN</p>
      </div>
    </div>
  );
}

/* ───────── constants ───────── */
const STATUSES = ["Available","In Use","Checked Out","Under Repair","Retired"];
const CONDITIONS = ["Excellent","Good","Fair","Poor"];
const ST = {
  Available:    { bg:"#e8f5e9", tx:"#2e7d32", dt:"#43a047" },
  "In Use":     { bg:"#e3f2fd", tx:"#1565c0", dt:"#1e88e5" },
  "Checked Out":{ bg:"#fff3e0", tx:"#e65100", dt:"#fb8c00" },
  "Under Repair":{ bg:"#fce4ec",tx:"#c62828", dt:"#ef5350" },
  Retired:      { bg:"#f3e5f5", tx:"#6a1b9a", dt:"#ab47bc" },
};
const getToday = () => new Date().toISOString().split("T")[0];
const f1 = "'Playfair Display',serif";
const f2 = "'DM Sans',sans-serif";
const inp = { width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid #e0d9cd",fontSize:14,fontFamily:f2,background:"#fff",boxSizing:"border-box",outline:"none" };
const bp = { padding:"10px 22px",borderRadius:10,border:"none",background:"#5b7a5e",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:f2,letterSpacing:.3 };
const bs = { padding:"10px 22px",borderRadius:10,border:"1px solid #d4cdc0",background:"#fff",color:"#5a5042",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:f2 };

/* ───────── UI primitives ───────── */
function Badge({ status }) {
  const s = ST[status] || { bg:"#eee",tx:"#666",dt:"#999" };
  return <span style={{ display:"inline-flex",alignItems:"center",gap:6,padding:"3px 10px",borderRadius:20,background:s.bg,color:s.tx,fontSize:12,fontWeight:600,letterSpacing:.3 }}><span style={{ width:7,height:7,borderRadius:"50%",background:s.dt }}/>{status}</span>;
}
function Stat({ label,value,icon,color }) {
  return <div style={{ background:"#fff",borderRadius:14,padding:"18px 20px",flex:"1 1 120px",minWidth:120,boxShadow:"0 1px 4px rgba(0,0,0,.06)",border:"1px solid #f0ece4" }}>
    <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:6 }}><span style={{ fontSize:20 }}>{icon}</span><span style={{ fontSize:11,color:"#8a7f72",fontWeight:600,textTransform:"uppercase",letterSpacing:.7,fontFamily:f2 }}>{label}</span></div>
    <div style={{ fontSize:28,fontWeight:700,color:color||"#3d3428",fontFamily:f1 }}>{value}</div>
  </div>;
}
function Modal({ open,onClose,title,wide,children }) {
  if (!open) return null;
  return <div style={{ position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={onClose}>
    <div style={{ position:"absolute",inset:0,background:"rgba(0,0,0,.4)",backdropFilter:"blur(4px)" }}/>
    <div style={{ position:"relative",background:"#fffdf8",borderRadius:16,padding:"28px 32px",maxWidth:wide?720:540,width:"92%",maxHeight:"88vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.2)" }} onClick={e=>e.stopPropagation()}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
        <h3 style={{ margin:0,fontSize:20,fontFamily:f1,color:"#3d3428" }}>{title}</h3>
        <button onClick={onClose} style={{ background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#8a7f72",padding:"4px 8px" }}>&times;</button>
      </div>
      {children}
    </div>
  </div>;
}
function FF({ label,children }) {
  return <div style={{ marginBottom:14 }}><label style={{ display:"block",fontSize:12,fontWeight:600,color:"#8a7f72",marginBottom:4,textTransform:"uppercase",letterSpacing:.5,fontFamily:f2 }}>{label}</label>{children}</div>;
}

/* ───────── QR Code generator ───────── */
function generateQRMatrix(text) {
  const size = 25;
  const m = Array.from({ length:size },()=>Array(size).fill(0));
  const drawFinder = (r,c) => { for(let i=0;i<7;i++) for(let j=0;j<7;j++) m[r+i][c+j]=(i===0||i===6||j===0||j===6||(i>=2&&i<=4&&j>=2&&j<=4))?1:0; };
  drawFinder(0,0); drawFinder(0,size-7); drawFinder(size-7,0);
  for(let i=7;i<size-7;i++){ m[6][i]=i%2===0?1:0; m[i][6]=i%2===0?1:0; }
  let bits = [];
  for(let i=0;i<text.length;i++){ const c=text.charCodeAt(i); for(let b=7;b>=0;b--) bits.push((c>>b)&1); }
  let bi = 0;
  for(let row=8;row<size-8;row++) for(let col=8;col<size-8;col++) {
    if(row===6||col===6)continue;
    m[row][col]=bi<bits.length?bits[bi]:(((row*13+col*7+bi)%3)===0?1:0);
    bi++;
  }
  return { matrix:m, size };
}
function QRCode({ text,scale=3 }) {
  const { matrix,size } = generateQRMatrix(text);
  const px=scale; const total=size*px;
  return <svg width={total} height={total} viewBox={`0 0 ${total} ${total}`} style={{ background:"#fff" }}>
    {matrix.map((row,ri)=>row.map((cell,ci)=>cell?<rect key={`${ri}-${ci}`} x={ci*px} y={ri*px} width={px} height={px} fill="#2d2416"/>:null))}
  </svg>;
}

/* ─────────────────────────────────────────────── */
/* ───────── MAIN APP COMPONENT ───────────────── */
/* ─────────────────────────────────────────────── */

export default function App() {
  // PIN gate — if ACCESS_PIN is set, require it before showing the app
  const [unlocked, setUnlocked] = useState(() => {
    if (!ACCESS_PIN) return true; // PIN disabled
    try { return sessionStorage.getItem("church-inv-auth") === "1"; } catch(e) { return false; }
  });

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;

  return <InventoryApp />;
}

function InventoryApp() {
  const { data, loading, error, update } = useFirestore();
  const [curUser, setCurUser] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [fStatus, setFS] = useState("All");
  const [fType, setFT] = useState("All");

  // Modal state
  const [coModal, setCOM] = useState(null);
  const [retModal, setRM] = useState(null);
  const [detModal, setDM] = useState(null);
  const [addModal, setAM] = useState(false);
  const [addType, setAT] = useState("electronics");
  const [labelModal, setLM] = useState(null);
  const [resModal, setResM] = useState(null);
  const [addConsModal, setACM] = useState(false);
  const [restockModal, setRSM] = useState(null);
  const [addUserModal, setAUM] = useState(false);
  const [newUserName, setNUN] = useState("");

  // Loading / error states
  if (loading) return <div style={{ fontFamily:f2,display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f8f5ee",color:"#8a7f72",flexDirection:"column",gap:12 }}>
    <div style={{ width:40,height:40,border:"3px solid #e0d9cd",borderTopColor:"#5b7a5e",borderRadius:"50%",animation:"spin 1s linear infinite" }}/>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    Loading inventory...
  </div>;

  if (error) return <div style={{ fontFamily:f2,display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f8f5ee",color:"#c53030",flexDirection:"column",gap:12,padding:32,textAlign:"center" }}>
    <div style={{ fontSize:40 }}>⚠️</div>
    <h2 style={{ fontFamily:f1,margin:0 }}>Connection Error</h2>
    <p style={{ maxWidth:400 }}>Could not connect to the database. Please check your Firebase configuration in <code>src/firebase.js</code>.</p>
    <p style={{ fontSize:13,color:"#8a7f72" }}>Error: {error}</p>
  </div>;

  if (!data) return null;

  // Unpack data
  const elec = data.electronics || [];
  const tools = data.tools || [];
  const cons = data.consumables || [];
  const log = data.log || [];
  const reservations = data.reservations || [];
  const users = data.users || SEED_USERS;

  const allItems = [...elec.map(e=>({...e,type:"Electronics"})),...tools.map(t=>({...t,type:"Tool"}))];
  const counts = { total:allItems.length, avail:allItems.filter(i=>i.status==="Available").length, inUse:allItems.filter(i=>i.status==="In Use").length, co:allItems.filter(i=>i.status==="Checked Out").length, repair:allItems.filter(i=>i.status==="Under Repair").length };
  const lowStock = cons.filter(c=>c.qty<=c.minQty);
  const activeRes = reservations.filter(r=>r.status==="Pending");

  const filtered = allItems.filter(i => {
    const ms = search===""||[i.desc,i.brand,i.model,i.id,i.loc,i.ministry].some(f=>(f||"").toLowerCase().includes(search.toLowerCase()));
    const mst = fStatus==="All"||i.status===fStatus;
    const mt = fType==="All"||i.type===fType;
    return ms && mst && mt;
  });

  // ── Data operations ──
  function doCheckOut(item, fd) {
    const key = item.type==="Electronics"?"electronics":"tools";
    const list = item.type==="Electronics"?elec:tools;
    const updated = list.map(i=>i.id===item.id?{...i,status:"Checked Out",assignedTo:fd.person,coDate:fd.date,retDate:fd.returnDate,notes:fd.purpose}:i);
    const newLog = [...log,{ logId:log.length+1,tag:item.id,desc:item.desc,type:item.type,by:fd.person,ministry:fd.ministry||item.ministry,purpose:fd.purpose,coDate:fd.date,expRet:fd.returnDate,actRet:"",retBy:"",condRet:"" }];
    update({ [key]:updated, log:newLog });
    setCOM(null);
  }
  function doReturn(item, fd) {
    const key = item.type==="Electronics"?"electronics":"tools";
    const list = item.type==="Electronics"?elec:tools;
    const updated = list.map(i=>i.id===item.id?{...i,status:"Available",assignedTo:"",coDate:"",retDate:"",cond:fd.condition||i.cond}:i);
    const updatedLog = log.map(l=>l.tag===item.id&&!l.actRet?{...l,actRet:fd.date,retBy:fd.person,condRet:fd.condition}:l);
    update({ [key]:updated, log:updatedLog });
    setRM(null);
  }
  function doAddItem(fd) {
    const n = { id:fd.assetTag,cat:fd.category,desc:fd.description,brand:fd.brand,model:fd.model,cond:fd.condition,ministry:fd.ministry,loc:fd.location,status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" };
    if(addType==="electronics") update({ electronics:[...elec,n] });
    else update({ tools:[...tools,n] });
    setAM(false);
  }
  function doReserve(fd) {
    update({ reservations:[...reservations,{ id:Date.now(),itemId:fd.itemId,itemDesc:fd.itemDesc,by:fd.by,ministry:fd.ministry,eventDate:fd.eventDate,purpose:fd.purpose,status:"Pending",created:getToday() }] });
    setResM(null);
  }
  function approveRes(id) { update({ reservations:reservations.map(r=>r.id===id?{...r,status:"Approved"}:r) }); }
  function denyRes(id) { update({ reservations:reservations.map(r=>r.id===id?{...r,status:"Denied"}:r) }); }
  function doAddCons(fd) {
    update({ consumables:[...cons,{ id:"CS-"+String(cons.length+1).padStart(3,"0"),desc:fd.desc,cat:fd.cat,qty:Number(fd.qty),minQty:Number(fd.minQty),loc:fd.loc,ministry:fd.ministry,lastRestocked:"" }] });
    setACM(false);
  }
  function doRestock(item,qty) {
    update({ consumables:cons.map(c=>c.id===item.id?{...c,qty:c.qty+Number(qty),lastRestocked:getToday()}:c) });
    setRSM(null);
  }
  function doUseCons(item,qty) {
    update({ consumables:cons.map(c=>c.id===item.id?{...c,qty:Math.max(0,c.qty-Number(qty))}:c) });
  }
  function addUser() {
    if(newUserName.trim()&&!users.includes(newUserName.trim())) {
      update({ users:[...users,newUserName.trim()] });
      setNUN(""); setAUM(false);
    }
  }
  function resetData() {
    if(confirm("Reset all inventory data to the original spreadsheet? This cannot be undone.")) {
      update({ electronics:SEED_ELECTRONICS, tools:SEED_TOOLS, consumables:SEED_CONSUMABLES, log:[], reservations:[], users:SEED_USERS });
      setCurUser("");
    }
  }

  /* ─────────── RENDER ─────────── */
  return (
    <div style={{ fontFamily:f2,background:"linear-gradient(170deg,#f8f5ee 0%,#f0ece4 50%,#e8e2d6 100%)",minHeight:"100vh",color:"#3d3428" }}>

      {/* ═══ HEADER ═══ */}
      <div style={{ background:"linear-gradient(135deg,#3d3428 0%,#5a5042 100%)",padding:"20px 28px",color:"#fff" }}>
        <div style={{ maxWidth:1100,margin:"0 auto" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12 }}>
            <div style={{ display:"flex",alignItems:"center",gap:14 }}>
              <div style={{ width:42,height:42,borderRadius:12,background:"rgba(255,255,255,.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22 }}>⛪</div>
              <div>
                <h1 style={{ margin:0,fontSize:22,fontFamily:f1,fontWeight:700,letterSpacing:-.5 }}>Church Inventory</h1>
                <p style={{ margin:0,fontSize:12,opacity:.6,marginTop:2 }}>Equipment, Tools &amp; Supplies</p>
              </div>
            </div>
            <div style={{ display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" }}>
              <div style={{ display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,.1)",borderRadius:10,padding:"6px 12px" }}>
                <span style={{ fontSize:13,opacity:.7 }}>Signed in:</span>
                <select value={curUser} onChange={e=>setCurUser(e.target.value)} style={{ background:"transparent",border:"none",color:"#fff",fontSize:13,fontWeight:600,fontFamily:f2,cursor:"pointer",outline:"none" }}>
                  <option value="" style={{ color:"#333" }}>Select name...</option>
                  {users.map(u=><option key={u} value={u} style={{ color:"#333" }}>{u}</option>)}
                </select>
                <button onClick={()=>setAUM(true)} style={{ background:"none",border:"none",color:"rgba(255,255,255,.6)",cursor:"pointer",fontSize:16,padding:"0 4px" }} title="Add person">+</button>
              </div>
              <button onClick={()=>setAM(true)} style={{ ...bp,background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.2)",padding:"8px 16px",fontSize:13 }}>+ Add Item</button>
            </div>
          </div>
          {/* Tabs */}
          <div style={{ display:"flex",gap:3,marginTop:16,background:"rgba(255,255,255,.08)",borderRadius:12,padding:3,overflowX:"auto" }}>
            {[["dashboard","Dashboard"],["inventory","All Items"],["consumables","Supplies"],["reservations","Reservations"],["log","Check-Out Log"],["labels","Print Labels"]].map(([k,v])=>
              <button key={k} onClick={()=>setTab(k)} style={{ padding:"10px 18px",borderRadius:10,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:f2,letterSpacing:.2,background:tab===k?"rgba(255,255,255,.2)":"transparent",color:tab===k?"#fff":"rgba(255,255,255,.5)",whiteSpace:"nowrap" }}>{v}
                {k==="consumables"&&lowStock.length>0&&<span style={{ marginLeft:5,background:"#ef5350",color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700 }}>{lowStock.length}</span>}
                {k==="reservations"&&activeRes.length>0&&<span style={{ marginLeft:5,background:"#fb8c00",color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700 }}>{activeRes.length}</span>}
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100,margin:"0 auto",padding:"24px 28px 60px" }}>

        {/* ═══ DASHBOARD ═══ */}
        {tab==="dashboard"&&<div>
          <div style={{ display:"flex",flexWrap:"wrap",gap:14,marginBottom:24 }}>
            <Stat label="Total Items" value={counts.total} icon="📦"/>
            <Stat label="Available" value={counts.avail} icon="✅" color="#2e7d32"/>
            <Stat label="In Use" value={counts.inUse} icon="🔵" color="#1565c0"/>
            <Stat label="Checked Out" value={counts.co} icon="🟠" color="#e65100"/>
            <Stat label="Repair" value={counts.repair} icon="🔴" color="#c62828"/>
          </div>

          {lowStock.length>0&&<div style={{ background:"#fff5f5",border:"1px solid #fed7d7",borderRadius:14,padding:"18px 22px",marginBottom:20 }}>
            <h3 style={{ margin:"0 0 12px",fontSize:16,fontFamily:f1,color:"#c53030" }}>Low Stock Alerts</h3>
            <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
              {lowStock.map(c=><div key={c.id} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:8,background:"#fff",flexWrap:"wrap",gap:8 }}>
                <div><span style={{ fontWeight:600,fontSize:14 }}>{c.desc}</span><span style={{ color:"#c53030",fontSize:13,marginLeft:8,fontWeight:600 }}>{c.qty} left (min: {c.minQty})</span></div>
                <button onClick={()=>setRSM(c)} style={{ ...bp,padding:"5px 14px",fontSize:12,background:"#c53030" }}>Restock</button>
              </div>)}
            </div>
          </div>}

          {activeRes.length>0&&<div style={{ background:"#fffbeb",border:"1px solid #fef3c7",borderRadius:14,padding:"18px 22px",marginBottom:20 }}>
            <h3 style={{ margin:"0 0 12px",fontSize:16,fontFamily:f1,color:"#92400e" }}>Pending Reservations</h3>
            {activeRes.map(r=><div key={r.id} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:8,background:"#fff",marginBottom:6,flexWrap:"wrap",gap:8 }}>
              <div><span style={{ fontWeight:600 }}>{r.itemDesc}</span><span style={{ color:"#8a7f72",fontSize:13 }}> — {r.by} for {r.purpose} ({r.eventDate})</span></div>
              <div style={{ display:"flex",gap:6 }}>
                <button onClick={()=>approveRes(r.id)} style={{ ...bp,padding:"5px 14px",fontSize:12 }}>Approve</button>
                <button onClick={()=>denyRes(r.id)} style={{ ...bs,padding:"5px 14px",fontSize:12,color:"#c53030",borderColor:"#c53030" }}>Deny</button>
              </div>
            </div>)}
          </div>}

          <div style={{ background:"#fff",borderRadius:14,padding:22,boxShadow:"0 1px 4px rgba(0,0,0,.06)",border:"1px solid #f0ece4",marginBottom:20 }}>
            <h3 style={{ margin:"0 0 14px",fontFamily:f1,fontSize:17 }}>Items Currently Checked Out</h3>
            {allItems.filter(i=>i.status==="Checked Out").length===0?<p style={{ color:"#8a7f72",fontSize:14 }}>No items currently checked out.</p>:
            <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
              {allItems.filter(i=>i.status==="Checked Out").map(item=><div key={item.id} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 15px",borderRadius:10,background:"#fef9f0",border:"1px solid #f0ece4",flexWrap:"wrap",gap:8 }}>
                <div><span style={{ fontWeight:600,fontSize:14 }}>{item.desc}</span><span style={{ color:"#8a7f72",fontSize:13,marginLeft:8 }}>{item.id}</span>{item.assignedTo&&<span style={{ color:"#8a7f72",fontSize:13 }}> — {item.assignedTo}</span>}</div>
                <button onClick={()=>setRM(item)} style={{ ...bp,padding:"6px 16px",fontSize:13 }}>Return</button>
              </div>)}
            </div>}
          </div>

          <div style={{ background:"#fff",borderRadius:14,padding:22,boxShadow:"0 1px 4px rgba(0,0,0,.06)",border:"1px solid #f0ece4" }}>
            <h3 style={{ margin:"0 0 14px",fontFamily:f1,fontSize:17 }}>Recent Activity</h3>
            {log.length===0?<p style={{ color:"#8a7f72",fontSize:14 }}>No activity yet.</p>:
            <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
              {[...log].reverse().slice(0,8).map(l=><div key={l.logId} style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 13px",borderRadius:8,background:"#fafaf6" }}>
                <span style={{ fontSize:16 }}>{l.actRet?"↩️":"📤"}</span>
                <div style={{ flex:1 }}><span style={{ fontWeight:600,fontSize:13 }}>{l.desc}</span><span style={{ color:"#8a7f72",fontSize:12,marginLeft:6 }}>({l.tag})</span>{l.by&&<span style={{ color:"#8a7f72",fontSize:12 }}> — {l.by}</span>}{l.purpose&&<span style={{ color:"#b0a898",fontSize:12 }}> — {l.purpose}</span>}</div>
              </div>)}
            </div>}
          </div>
          <div style={{ marginTop:24,textAlign:"center" }}><button onClick={resetData} style={{ ...bs,fontSize:12,color:"#c53030",borderColor:"#e0d9cd",padding:"7px 16px" }}>Reset to Original Data</button></div>
        </div>}

        {/* ═══ INVENTORY ═══ */}
        {tab==="inventory"&&<div>
          <div style={{ display:"flex",gap:10,marginBottom:18,flexWrap:"wrap" }}>
            <input placeholder="Search items..." value={search} onChange={e=>setSearch(e.target.value)} style={{ ...inp,flex:"1 1 220px",background:"#fff" }}/>
            <select value={fStatus} onChange={e=>setFS(e.target.value)} style={{ ...inp,width:"auto",minWidth:120,cursor:"pointer" }}><option value="All">All Statuses</option>{STATUSES.map(s=><option key={s}>{s}</option>)}</select>
            <select value={fType} onChange={e=>setFT(e.target.value)} style={{ ...inp,width:"auto",minWidth:120,cursor:"pointer" }}><option value="All">All Types</option><option>Electronics</option><option>Tool</option></select>
          </div>
          <div style={{ background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.06)",border:"1px solid #f0ece4" }}>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                <thead><tr style={{ background:"#faf8f3" }}>
                  {["Tag","Description","Brand / Model","Location","Ministry","Cond.","Status","Actions"].map(h=><th key={h} style={{ padding:"11px 13px",textAlign:"left",fontWeight:600,color:"#8a7f72",fontSize:11,textTransform:"uppercase",letterSpacing:.6,borderBottom:"1px solid #f0ece4",whiteSpace:"nowrap" }}>{h}</th>)}
                </tr></thead>
                <tbody>{filtered.map(item=><tr key={item.id} style={{ borderBottom:"1px solid #f5f2eb",cursor:"pointer" }} onClick={()=>setDM(item)} onMouseEnter={e=>e.currentTarget.style.background="#fdfcf8"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{ padding:"11px 13px",fontWeight:600,color:"#5b7a5e",fontFamily:"monospace",fontSize:13 }}>{item.id}</td>
                  <td style={{ padding:"11px 13px",fontWeight:600 }}>{item.desc}</td>
                  <td style={{ padding:"11px 13px",color:"#6b6158" }}>{item.brand} {item.model}</td>
                  <td style={{ padding:"11px 13px",color:"#8a7f72" }}>{item.loc}</td>
                  <td style={{ padding:"11px 13px",color:"#8a7f72" }}>{item.ministry}</td>
                  <td style={{ padding:"11px 13px" }}><span style={{ padding:"2px 8px",borderRadius:6,fontSize:12,background:item.cond==="Good"||item.cond==="Excellent"?"#e8f5e9":"#fff3e0",color:item.cond==="Good"||item.cond==="Excellent"?"#2e7d32":"#e65100" }}>{item.cond}</span></td>
                  <td style={{ padding:"11px 13px" }}><Badge status={item.status}/></td>
                  <td style={{ padding:"11px 13px",whiteSpace:"nowrap" }} onClick={e=>e.stopPropagation()}>
                    <div style={{ display:"flex",gap:5 }}>
                      {item.status==="Available"&&<button onClick={()=>setCOM(item)} style={{ ...bp,padding:"5px 12px",fontSize:12 }}>Check Out</button>}
                      {item.status==="Checked Out"&&<button onClick={()=>setRM(item)} style={{ ...bs,padding:"5px 12px",fontSize:12,color:"#5b7a5e",borderColor:"#5b7a5e" }}>Return</button>}
                      <button onClick={()=>setResM(item)} style={{ ...bs,padding:"5px 10px",fontSize:11 }} title="Reserve">📅</button>
                      <button onClick={()=>setLM(item)} style={{ ...bs,padding:"5px 10px",fontSize:11 }} title="Print label">🏷️</button>
                    </div>
                  </td>
                </tr>)}</tbody>
              </table>
            </div>
            {filtered.length===0&&<div style={{ padding:40,textAlign:"center",color:"#8a7f72" }}>No items match your search.</div>}
          </div>
          <p style={{ color:"#b0a898",fontSize:12,marginTop:8 }}>{filtered.length} item{filtered.length!==1&&"s"}</p>
        </div>}

        {/* ═══ CONSUMABLES ═══ */}
        {tab==="consumables"&&<div>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10 }}>
            <h2 style={{ margin:0,fontFamily:f1,fontSize:20 }}>Supplies &amp; Consumables</h2>
            <button onClick={()=>setACM(true)} style={{ ...bp,padding:"8px 16px",fontSize:13 }}>+ Add Supply</button>
          </div>
          {lowStock.length>0&&<div style={{ background:"#fff5f5",border:"1px solid #fed7d7",borderRadius:12,padding:"14px 18px",marginBottom:18 }}>
            <p style={{ margin:0,fontSize:14,color:"#c53030",fontWeight:600 }}>{lowStock.length} item{lowStock.length!==1&&"s"} at or below minimum stock</p>
          </div>}
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14 }}>
            {cons.map(c=>{
              const low=c.qty<=c.minQty;
              const pct=Math.min(100,(c.qty/Math.max(c.minQty*3,1))*100);
              return <div key={c.id} style={{ background:"#fff",borderRadius:14,padding:"18px 20px",border:low?"2px solid #fed7d7":"1px solid #f0ece4",boxShadow:"0 1px 4px rgba(0,0,0,.06)" }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"start",marginBottom:10 }}>
                  <div><div style={{ fontWeight:600,fontSize:15 }}>{c.desc}</div><div style={{ fontSize:12,color:"#8a7f72",marginTop:2 }}>{c.cat} · {c.loc}</div></div>
                  <span style={{ fontSize:12,fontFamily:"monospace",color:"#8a7f72" }}>{c.id}</span>
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:10 }}>
                  <div style={{ flex:1,background:"#f0ece4",borderRadius:6,height:8,overflow:"hidden" }}>
                    <div style={{ width:pct+"%",height:"100%",borderRadius:6,background:low?"#ef5350":"#5b7a5e",transition:"width .3s" }}/>
                  </div>
                  <span style={{ fontWeight:700,fontSize:18,color:low?"#c53030":"#3d3428",fontFamily:f1,minWidth:32,textAlign:"right" }}>{c.qty}</span>
                </div>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ fontSize:12,color:"#8a7f72" }}>Min: {c.minQty}{c.lastRestocked?" · Restocked: "+c.lastRestocked:""}</span>
                  <div style={{ display:"flex",gap:6 }}>
                    <button onClick={()=>{const q=prompt("How many to use?","1");if(q)doUseCons(c,q);}} style={{ ...bs,padding:"4px 10px",fontSize:11 }}>Use</button>
                    <button onClick={()=>setRSM(c)} style={{ ...bp,padding:"4px 10px",fontSize:11 }}>Restock</button>
                  </div>
                </div>
              </div>;
            })}
          </div>
        </div>}

        {/* ═══ RESERVATIONS ═══ */}
        {tab==="reservations"&&<div>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10 }}>
            <h2 style={{ margin:0,fontFamily:f1,fontSize:20 }}>Equipment Reservations</h2>
            <button onClick={()=>setResM({})} style={{ ...bp,padding:"8px 16px",fontSize:13 }}>+ New Request</button>
          </div>
          <div style={{ background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.06)",border:"1px solid #f0ece4" }}>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                <thead><tr style={{ background:"#faf8f3" }}>
                  {["Item","Requested By","Ministry","Event Date","Purpose","Status","Actions"].map(h=><th key={h} style={{ padding:"11px 13px",textAlign:"left",fontWeight:600,color:"#8a7f72",fontSize:11,textTransform:"uppercase",letterSpacing:.6,borderBottom:"1px solid #f0ece4",whiteSpace:"nowrap" }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {reservations.length===0?<tr><td colSpan={7} style={{ padding:40,textAlign:"center",color:"#8a7f72" }}>No reservations yet.</td></tr>:
                  [...reservations].reverse().map(r=><tr key={r.id} style={{ borderBottom:"1px solid #f5f2eb" }}>
                    <td style={{ padding:"11px 13px",fontWeight:600 }}>{r.itemDesc}</td>
                    <td style={{ padding:"11px 13px" }}>{r.by}</td>
                    <td style={{ padding:"11px 13px",color:"#8a7f72" }}>{r.ministry}</td>
                    <td style={{ padding:"11px 13px" }}>{r.eventDate}</td>
                    <td style={{ padding:"11px 13px",color:"#8a7f72" }}>{r.purpose}</td>
                    <td style={{ padding:"11px 13px" }}><span style={{ padding:"3px 10px",borderRadius:20,fontSize:12,fontWeight:600,background:r.status==="Approved"?"#e8f5e9":r.status==="Denied"?"#fce4ec":"#fff3e0",color:r.status==="Approved"?"#2e7d32":r.status==="Denied"?"#c62828":"#e65100" }}>{r.status}</span></td>
                    <td style={{ padding:"11px 13px" }}>{r.status==="Pending"&&<div style={{ display:"flex",gap:5 }}>
                      <button onClick={()=>approveRes(r.id)} style={{ ...bp,padding:"4px 10px",fontSize:11 }}>Approve</button>
                      <button onClick={()=>denyRes(r.id)} style={{ ...bs,padding:"4px 10px",fontSize:11,color:"#c53030",borderColor:"#c53030" }}>Deny</button>
                    </div>}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </div>}

        {/* ═══ CHECK-OUT LOG ═══ */}
        {tab==="log"&&<div>
          <div style={{ background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.06)",border:"1px solid #f0ece4" }}>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                <thead><tr style={{ background:"#faf8f3" }}>
                  {["#","Tag","Description","By","Ministry","Purpose","Out","Expected","Returned","Cond."].map(h=><th key={h} style={{ padding:"11px 13px",textAlign:"left",fontWeight:600,color:"#8a7f72",fontSize:11,textTransform:"uppercase",letterSpacing:.6,borderBottom:"1px solid #f0ece4",whiteSpace:"nowrap" }}>{h}</th>)}
                </tr></thead>
                <tbody>{[...log].reverse().map(l=><tr key={l.logId} style={{ borderBottom:"1px solid #f5f2eb" }}>
                  <td style={{ padding:"11px 13px",color:"#8a7f72" }}>{l.logId}</td>
                  <td style={{ padding:"11px 13px",fontWeight:600,color:"#5b7a5e",fontFamily:"monospace" }}>{l.tag}</td>
                  <td style={{ padding:"11px 13px",fontWeight:500 }}>{l.desc}</td>
                  <td style={{ padding:"11px 13px" }}>{l.by||"—"}</td>
                  <td style={{ padding:"11px 13px",color:"#8a7f72" }}>{l.ministry}</td>
                  <td style={{ padding:"11px 13px",color:"#8a7f72" }}>{l.purpose}</td>
                  <td style={{ padding:"11px 13px" }}>{l.coDate||"—"}</td>
                  <td style={{ padding:"11px 13px" }}>{l.expRet||"—"}</td>
                  <td style={{ padding:"11px 13px" }}>{l.actRet?<span style={{ color:"#2e7d32" }}>✓ {l.actRet}</span>:<span style={{ color:"#e65100",fontSize:12,fontWeight:600 }}>Outstanding</span>}</td>
                  <td style={{ padding:"11px 13px" }}>{l.condRet||"—"}</td>
                </tr>)}</tbody>
              </table>
            </div>
            {log.length===0&&<div style={{ padding:40,textAlign:"center",color:"#8a7f72" }}>No check-out activity yet.</div>}
          </div>
        </div>}

        {/* ═══ LABELS ═══ */}
        {tab==="labels"&&<div>
          <div style={{ marginBottom:18 }}>
            <h2 style={{ margin:"0 0 8px",fontFamily:f1,fontSize:20 }}>Print Asset Labels</h2>
            <p style={{ margin:0,color:"#8a7f72",fontSize:14 }}>Click any item to preview and print a label with QR code.</p>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12 }}>
            {allItems.map(item=><div key={item.id} onClick={()=>setLM(item)} style={{ background:"#fff",borderRadius:12,padding:"14px 16px",border:"1px solid #f0ece4",cursor:"pointer",transition:"all .15s",boxShadow:"0 1px 3px rgba(0,0,0,.04)" }} onMouseEnter={e=>{ e.currentTarget.style.borderColor="#5b7a5e"; e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.1)"; }} onMouseLeave={e=>{ e.currentTarget.style.borderColor="#f0ece4"; e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,.04)"; }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <div>
                  <div style={{ fontWeight:700,fontSize:14,fontFamily:"monospace",color:"#5b7a5e" }}>{item.id}</div>
                  <div style={{ fontWeight:600,fontSize:14,marginTop:2 }}>{item.desc}</div>
                  <div style={{ fontSize:12,color:"#8a7f72",marginTop:2 }}>{item.brand} {item.model}</div>
                </div>
                <span style={{ fontSize:20 }}>🏷️</span>
              </div>
            </div>)}
          </div>
        </div>}
      </div>

      {/* ═══ MODALS ═══ */}
      <CheckOutModal item={coModal} curUser={curUser} onClose={()=>setCOM(null)} onSubmit={doCheckOut}/>
      <ReturnModal item={retModal} curUser={curUser} onClose={()=>setRM(null)} onSubmit={doReturn}/>
      <Modal open={!!detModal} onClose={()=>setDM(null)} title={detModal?.desc||""}>
        {detModal&&<div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 18px" }}>
          {[["Asset Tag",detModal.id],["Category",detModal.cat],["Brand",detModal.brand],["Model",detModal.model],["Condition",detModal.cond],["Status",null],["Ministry",detModal.ministry],["Location",detModal.loc],["Assigned To",detModal.assignedTo||"—"]].map(([l,v])=><div key={l}>
            <div style={{ fontSize:11,color:"#8a7f72",textTransform:"uppercase",letterSpacing:.5,marginBottom:3,fontWeight:600 }}>{l}</div>
            {l==="Status"?<Badge status={detModal.status}/>:<div style={{ fontSize:14,fontWeight:500 }}>{v}</div>}
          </div>)}
        </div>}
      </Modal>
      <AddItemModal open={addModal} type={addType} setType={setAT} onClose={()=>setAM(false)} onSubmit={doAddItem} elec={elec} tools={tools}/>
      <Modal open={!!labelModal} onClose={()=>setLM(null)} title="Asset Label Preview" wide>
        {labelModal&&<div>
          <div id="printable-label" style={{ display:"inline-flex",border:"2px solid #3d3428",borderRadius:12,padding:20,gap:20,background:"#fff",alignItems:"center" }}>
            <QRCode text={"CHURCH-INV:"+labelModal.id+":"+labelModal.desc} scale={3}/>
            <div>
              <div style={{ fontSize:26,fontWeight:800,fontFamily:"monospace",color:"#3d3428",letterSpacing:1 }}>{labelModal.id}</div>
              <div style={{ fontSize:16,fontWeight:600,marginTop:4,color:"#3d3428" }}>{labelModal.desc}</div>
              <div style={{ fontSize:13,color:"#6b6158",marginTop:2 }}>{labelModal.brand} {labelModal.model}</div>
              <div style={{ fontSize:12,color:"#8a7f72",marginTop:4 }}>{labelModal.loc} · {labelModal.ministry}</div>
              <div style={{ fontSize:10,color:"#b0a898",marginTop:6 }}>Church Inventory System</div>
            </div>
          </div>
          <div style={{ marginTop:18 }}>
            <button onClick={()=>{ const w=window.open("","_blank","width=500,height=300"); if(w){ const el=document.getElementById("printable-label"); w.document.write("<html><body style='margin:20px;font-family:sans-serif'>"+el.outerHTML+"</body></html>"); w.document.close(); w.print(); }}} style={bp}>Print Label</button>
          </div>
        </div>}
      </Modal>
      <ReserveModal item={resModal} allItems={allItems} curUser={curUser} onClose={()=>setResM(null)} onSubmit={doReserve}/>
      <AddConsModal open={addConsModal} onClose={()=>setACM(false)} onSubmit={doAddCons}/>
      <Modal open={!!restockModal} onClose={()=>setRSM(null)} title={"Restock: "+(restockModal?.desc||"")}>
        {restockModal&&<RestockForm item={restockModal} onSubmit={doRestock}/>}
      </Modal>
      <Modal open={addUserModal} onClose={()=>setAUM(false)} title="Add Team Member">
        <FF label="Name"><input style={inp} value={newUserName} onChange={e=>setNUN(e.target.value)} placeholder="Full name"/></FF>
        <div style={{ display:"flex",gap:10,justifyContent:"flex-end",marginTop:14 }}>
          <button onClick={()=>setAUM(false)} style={bs}>Cancel</button>
          <button onClick={addUser} style={{ ...bp,opacity:newUserName.trim()?1:.5 }}>Add</button>
        </div>
      </Modal>
    </div>
  );
}

/* ─────── Sub-component modals ─────── */

function CheckOutModal({ item,curUser,onClose,onSubmit }) {
  const [person,setP]=useState(""); const [ministry,setM]=useState(""); const [purpose,setPu]=useState(""); const [date,setD]=useState(getToday()); const [ret,setR]=useState("");
  useEffect(()=>{ if(item){ setP(curUser||""); setM(item.ministry||""); setPu(""); setD(getToday()); setR(""); }},[item,curUser]);
  return <Modal open={!!item} onClose={onClose} title={"Check Out: "+(item?.desc||"")}>
    <FF label="Person"><input style={inp} value={person} onChange={e=>setP(e.target.value)} placeholder="Who is taking this item?"/></FF>
    <FF label="Ministry / Department"><input style={inp} value={ministry} onChange={e=>setM(e.target.value)}/></FF>
    <FF label="Purpose / Event"><input style={inp} value={purpose} onChange={e=>setPu(e.target.value)} placeholder="What is it being used for?"/></FF>
    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
      <FF label="Check-Out Date"><input style={inp} type="date" value={date} onChange={e=>setD(e.target.value)}/></FF>
      <FF label="Expected Return"><input style={inp} type="date" value={ret} onChange={e=>setR(e.target.value)}/></FF>
    </div>
    <div style={{ display:"flex",gap:10,marginTop:18,justifyContent:"flex-end" }}>
      <button onClick={onClose} style={bs}>Cancel</button>
      <button onClick={()=>person&&onSubmit(item,{person,ministry,purpose,date,returnDate:ret})} style={{ ...bp,opacity:person?1:.5 }}>Confirm Check-Out</button>
    </div>
  </Modal>;
}

function ReturnModal({ item,curUser,onClose,onSubmit }) {
  const [person,setP]=useState(""); const [cond,setC]=useState("Good"); const [date,setD]=useState(getToday());
  useEffect(()=>{ if(item){ setP(curUser||""); setC("Good"); setD(getToday()); }},[item,curUser]);
  return <Modal open={!!item} onClose={onClose} title={"Return: "+(item?.desc||"")}>
    <FF label="Returned By"><input style={inp} value={person} onChange={e=>setP(e.target.value)} placeholder="Who is returning?"/></FF>
    <FF label="Condition"><select style={inp} value={cond} onChange={e=>setC(e.target.value)}>{CONDITIONS.map(c=><option key={c}>{c}</option>)}</select></FF>
    <FF label="Return Date"><input style={inp} type="date" value={date} onChange={e=>setD(e.target.value)}/></FF>
    <div style={{ display:"flex",gap:10,marginTop:18,justifyContent:"flex-end" }}>
      <button onClick={onClose} style={bs}>Cancel</button>
      <button onClick={()=>person&&onSubmit(item,{person,condition:cond,date})} style={{ ...bp,opacity:person?1:.5 }}>Confirm Return</button>
    </div>
  </Modal>;
}

function AddItemModal({ open,type,setType,onClose,onSubmit,elec,tools }) {
  const [f,setF]=useState({ assetTag:"",category:"",description:"",brand:"",model:"",condition:"Good",ministry:"",location:"" });
  useEffect(()=>{ if(open){ const p=type==="electronics"?"CE":"CT"; const n=(type==="electronics"?elec:tools).length+1; setF({ assetTag:p+"-"+String(n).padStart(3,"0"),category:"",description:"",brand:"",model:"",condition:"Good",ministry:"",location:"" }); }},[open,type]);
  const u=(k,v)=>setF(p=>({...p,[k]:v}));
  return <Modal open={open} onClose={onClose} title="Add New Item">
    <div style={{ display:"flex",gap:8,marginBottom:18 }}><button onClick={()=>setType("electronics")} style={type==="electronics"?bp:bs}>Electronics</button><button onClick={()=>setType("tool")} style={type==="tool"?bp:bs}>Tool</button></div>
    <FF label="Asset Tag"><input style={inp} value={f.assetTag} onChange={e=>u("assetTag",e.target.value)}/></FF>
    <FF label="Description"><input style={inp} value={f.description} onChange={e=>u("description",e.target.value)} placeholder="e.g. Wireless Microphone"/></FF>
    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
      <FF label="Brand"><input style={inp} value={f.brand} onChange={e=>u("brand",e.target.value)}/></FF>
      <FF label="Model"><input style={inp} value={f.model} onChange={e=>u("model",e.target.value)}/></FF>
    </div>
    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
      <FF label="Category"><input style={inp} value={f.category} onChange={e=>u("category",e.target.value)} placeholder="e.g. Audio/Visual"/></FF>
      <FF label="Condition"><select style={inp} value={f.condition} onChange={e=>u("condition",e.target.value)}>{CONDITIONS.map(c=><option key={c}>{c}</option>)}</select></FF>
    </div>
    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
      <FF label="Ministry"><input style={inp} value={f.ministry} onChange={e=>u("ministry",e.target.value)}/></FF>
      <FF label="Location"><input style={inp} value={f.location} onChange={e=>u("location",e.target.value)}/></FF>
    </div>
    <div style={{ display:"flex",gap:10,marginTop:18,justifyContent:"flex-end" }}>
      <button onClick={onClose} style={bs}>Cancel</button>
      <button onClick={()=>f.description&&onSubmit(f)} style={{ ...bp,opacity:f.description?1:.5 }}>Add Item</button>
    </div>
  </Modal>;
}

function ReserveModal({ item,allItems,curUser,onClose,onSubmit }) {
  const [selId,setSelId]=useState(""); const [by,setBy]=useState(""); const [ministry,setM]=useState(""); const [eventDate,setED]=useState(""); const [purpose,setPu]=useState("");
  useEffect(()=>{ if(item){ setSelId(item.id||""); setBy(curUser||""); setM(item.ministry||""); setED(""); setPu(""); }},[item,curUser]);
  if(!item)return null;
  const sel=allItems.find(i=>i.id===selId);
  return <Modal open={!!item} onClose={onClose} title="Reserve Equipment">
    <FF label="Item"><select style={inp} value={selId} onChange={e=>{ setSelId(e.target.value); const it=allItems.find(i=>i.id===e.target.value); if(it)setM(it.ministry); }}><option value="">Select an item...</option>{allItems.map(i=><option key={i.id} value={i.id}>{i.id} — {i.desc}</option>)}</select></FF>
    <FF label="Requested By"><input style={inp} value={by} onChange={e=>setBy(e.target.value)} placeholder="Your name"/></FF>
    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
      <FF label="Ministry"><input style={inp} value={ministry} onChange={e=>setM(e.target.value)}/></FF>
      <FF label="Event Date"><input style={inp} type="date" value={eventDate} onChange={e=>setED(e.target.value)}/></FF>
    </div>
    <FF label="Purpose / Event"><input style={inp} value={purpose} onChange={e=>setPu(e.target.value)} placeholder="What do you need it for?"/></FF>
    <div style={{ display:"flex",gap:10,marginTop:18,justifyContent:"flex-end" }}>
      <button onClick={onClose} style={bs}>Cancel</button>
      <button onClick={()=>selId&&by&&onSubmit({ itemId:selId,itemDesc:sel?.desc||selId,by,ministry,eventDate,purpose })} style={{ ...bp,opacity:selId&&by?1:.5 }}>Submit Request</button>
    </div>
  </Modal>;
}

function AddConsModal({ open,onClose,onSubmit }) {
  const [f,setF]=useState({ desc:"",cat:"",qty:"",minQty:"",loc:"",ministry:"" });
  useEffect(()=>{ if(open)setF({ desc:"",cat:"",qty:"",minQty:"",loc:"",ministry:"" }); },[open]);
  const u=(k,v)=>setF(p=>({...p,[k]:v}));
  return <Modal open={open} onClose={onClose} title="Add Supply Item">
    <FF label="Description"><input style={inp} value={f.desc} onChange={e=>u("desc",e.target.value)} placeholder="e.g. AA Batteries (pack of 48)"/></FF>
    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
      <FF label="Category"><input style={inp} value={f.cat} onChange={e=>u("cat",e.target.value)} placeholder="e.g. Batteries"/></FF>
      <FF label="Ministry"><input style={inp} value={f.ministry} onChange={e=>u("ministry",e.target.value)}/></FF>
    </div>
    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
      <FF label="Current Quantity"><input style={inp} type="number" value={f.qty} onChange={e=>u("qty",e.target.value)}/></FF>
      <FF label="Minimum Stock Level"><input style={inp} type="number" value={f.minQty} onChange={e=>u("minQty",e.target.value)}/></FF>
    </div>
    <FF label="Storage Location"><input style={inp} value={f.loc} onChange={e=>u("loc",e.target.value)}/></FF>
    <div style={{ display:"flex",gap:10,marginTop:18,justifyContent:"flex-end" }}>
      <button onClick={onClose} style={bs}>Cancel</button>
      <button onClick={()=>f.desc&&onSubmit(f)} style={{ ...bp,opacity:f.desc?1:.5 }}>Add Supply</button>
    </div>
  </Modal>;
}

function RestockForm({ item,onSubmit }) {
  const [qty,setQty]=useState("");
  return <div>
    <p style={{ fontSize:14,color:"#6b6158",marginBottom:14 }}>Current stock: <strong>{item.qty}</strong> (minimum: {item.minQty})</p>
    <FF label="Quantity to Add"><input style={inp} type="number" value={qty} onChange={e=>setQty(e.target.value)} placeholder="How many to add?"/></FF>
    <div style={{ display:"flex",gap:10,marginTop:18,justifyContent:"flex-end" }}>
      <button onClick={()=>qty&&onSubmit(item,qty)} style={{ ...bp,opacity:qty?1:.5 }}>Restock</button>
    </div>
  </div>;
}
