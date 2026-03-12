import { useState, useEffect } from 'react';
import { useAuth } from './useAuth.js';
import { useFirestore } from './useFirestore.js';

/* ════════════════════════════════════════ */
/* ═══ BRAND TOKENS ═══════════════════════ */
/* ════════════════════════════════════════ */
const B = {
  navy: "#1B2A4A", navyLight: "#243556",
  teal: "#2A7D6E", tealLight: "#34957F", tealPale: "#E6F5F1",
  gold: "#D4A843", goldLight: "#F5ECD4",
  cream: "#FAFAF7", warmGray: "#F2F0EB", sand: "#E8E4DC",
  textDark: "#1B2A4A", textMid: "#5A6477", textLight: "#8B93A1",
  white: "#FFFFFF", red: "#D94F4F", redPale: "#FDF2F2",
};
const f1 = "'Outfit',sans-serif";
const f2 = "'Source Sans 3',sans-serif";
const inp = { width:"100%", padding:"11px 14px", borderRadius:10, border:"1px solid "+B.sand, fontSize:14, fontFamily:f2, background:B.white, boxSizing:"border-box", outline:"none", color:B.textDark };
const btnP = { padding:"11px 24px", borderRadius:10, border:"none", background:B.teal, color:B.white, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:f1, letterSpacing:.2 };
const btnS = { padding:"11px 24px", borderRadius:10, border:"1px solid "+B.sand, background:B.white, color:B.textDark, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:f1 };
const btnD = { padding:"11px 24px", borderRadius:10, border:"1px solid #FECACA", background:B.redPale, color:B.red, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:f1 };

/* ═══ LOGO (Option C: Arc & Nodes) ═══ */
function Logo({ size = 40, light = false }) {
  const c1 = light ? "#fff" : B.teal;
  const c2 = light ? "rgba(255,255,255,0.6)" : B.gold;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <path d="M36 12a17 17 0 1 0 0 24" stroke={c1} strokeWidth="5" strokeLinecap="round" fill="none"/>
      <path d="M32 18a10 10 0 1 0 0 12" stroke={c2} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7"/>
      <circle cx="30" cy="24" r="4" fill={c1}/>
      <circle cx="40" cy="12" r="3" fill={c2}/>
      <circle cx="40" cy="36" r="3" fill={c2}/>
      <circle cx="42" cy="24" r="2" fill={c2} opacity="0.6"/>
    </svg>
  );
}
function FullLogo({ size = 38, light = false }) {
  const color = light ? "#fff" : B.navy;
  return (
    <div style={{ display:"flex", alignItems:"center", gap: size * 0.28 }}>
      <Logo size={size} light={light} />
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontFamily:f1, fontSize:size*0.46, fontWeight:700, color, letterSpacing:-0.5 }}>
          ChurchOps<span style={{ color: light ? "rgba(255,255,255,0.7)" : B.teal }}>Hub</span>
        </div>
        <div style={{ fontFamily:f1, fontSize:size*0.2, fontWeight:400, color: light ? "rgba(255,255,255,0.45)" : B.textLight, letterSpacing:1.5, textTransform:"uppercase", marginTop:1 }}>
          Inventory Management
        </div>
      </div>
    </div>
  );
}

/* ═══ UI Primitives ═══ */
function Modal({ open, onClose, title, wide, children }) {
  if (!open) return null;
  return <div style={{ position:"fixed", inset:0, zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={onClose}>
    <div style={{ position:"absolute", inset:0, background:"rgba(27,42,74,0.45)", backdropFilter:"blur(6px)" }}/>
    <div style={{ position:"relative", background:B.cream, borderRadius:18, padding:"30px 34px", maxWidth:wide?720:520, width:"92%", maxHeight:"88vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(27,42,74,0.18)" }} onClick={e=>e.stopPropagation()}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
        <h3 style={{ margin:0, fontSize:20, fontFamily:f1, fontWeight:700, color:B.navy }}>{title}</h3>
        <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:B.textLight }}>&times;</button>
      </div>
      {children}
    </div>
  </div>;
}
function FF({ label, children }) {
  return <div style={{ marginBottom:16 }}>
    <label style={{ display:"block", fontSize:12, fontWeight:600, color:B.textLight, marginBottom:5, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1 }}>{label}</label>
    {children}
  </div>;
}
function Badge({ status }) {
  const map = {
    Available:     { bg:B.tealPale, tx:B.teal, dt:B.tealLight },
    "In Use":      { bg:"#E8F0FE", tx:"#1A65C7", dt:"#3B82F6" },
    "Checked Out": { bg:B.goldLight, tx:"#96750E", dt:B.gold },
    "Under Repair":{ bg:B.redPale, tx:B.red, dt:"#E87171" },
    Disposed:      { bg:"#F3F0F5", tx:"#7C5BA0", dt:"#9B7FC0" },
  };
  const s = map[status] || { bg:"#eee", tx:"#666", dt:"#999" };
  return <span style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"4px 12px", borderRadius:20, background:s.bg, color:s.tx, fontSize:12, fontWeight:600, fontFamily:f1 }}><span style={{ width:7, height:7, borderRadius:"50%", background:s.dt }}/>{status}</span>;
}
function Stat({ label, value, icon, color }) {
  return <div style={{ background:B.white, borderRadius:14, padding:"20px 22px", flex:"1 1 130px", minWidth:130, boxShadow:"0 1px 3px rgba(27,42,74,0.06)", border:"1px solid "+B.sand }}>
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
      <span style={{ fontSize:18 }}>{icon}</span>
      <span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:1, fontFamily:f1 }}>{label}</span>
    </div>
    <div style={{ fontSize:30, fontWeight:700, color:color||B.navy, fontFamily:f1 }}>{value}</div>
  </div>;
}
function Spinner() {
  return <div style={{ fontFamily:f2, display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:B.cream, color:B.textLight, flexDirection:"column", gap:12 }}>
    <div style={{ width:40, height:40, border:"3px solid "+B.sand, borderTopColor:B.teal, borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    <span style={{ fontFamily:f1, fontWeight:500 }}>Loading...</span>
  </div>;
}

/* ═══════════════════════════════════════════════ */
/* ═══ AUTH SCREENS ═════════════════════════════ */
/* ═══════════════════════════════════════════════ */

function AuthScreen({ authHook }) {
  const { login, loginWithGoogle, register, registerWithGoogle, createChurch, error, setError } = authHook;
  const [mode, setMode] = useState("login"); // login, register, createChurch, googleRegister
  const [form, setForm] = useState({ name:"", email:"", password:"", churchCode:"", churchName:"" });
  const [busy, setBusy] = useState(false);
  const [googleInfo, setGoogleInfo] = useState(null);
  const u = (k,v) => { setForm(f=>({...f,[k]:v})); setError(null); };

  async function handleLogin(e) {
    e?.preventDefault(); setBusy(true);
    const res = await login(form.email, form.password);
    setBusy(false);
  }
  async function handleGoogle() {
    setBusy(true);
    const res = await loginWithGoogle();
    if (res.needsRegistration) {
      setGoogleInfo({ email: res.email, name: res.name });
      setMode("googleRegister");
    }
    setBusy(false);
  }
  async function handleRegister(e) {
    e?.preventDefault(); setBusy(true);
    await register({ userName:form.name, email:form.email, password:form.password, churchCode:form.churchCode });
    setBusy(false);
  }
  async function handleGoogleRegister(e) {
    e?.preventDefault(); setBusy(true);
    await registerWithGoogle({ churchCode:form.churchCode });
    setBusy(false);
  }
  async function handleCreateChurch(e) {
    e?.preventDefault(); setBusy(true);
    await createChurch({ churchName:form.churchName, churchCode:form.churchCode, userName:form.name, email:form.email, password:form.password });
    setBusy(false);
  }

  const cardStyle = { background:B.white, borderRadius:20, padding:"44px 40px", maxWidth:420, width:"92%", boxShadow:"0 8px 40px rgba(27,42,74,0.1)" };

  return (
    <div style={{ fontFamily:f2, minHeight:"100vh", background:`linear-gradient(170deg, ${B.cream} 0%, ${B.warmGray} 100%)`, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet"/>

      {mode === "login" && (
        <div style={cardStyle}>
          <div style={{ textAlign:"center", marginBottom:32 }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}><Logo size={52} /></div>
            <h1 style={{ fontFamily:f1, fontSize:26, fontWeight:700, color:B.navy, margin:"0 0 4px" }}>Welcome back</h1>
            <p style={{ color:B.textLight, margin:0, fontSize:14 }}>Sign in to ChurchOpsHub</p>
          </div>

          <button onClick={handleGoogle} disabled={busy} style={{ ...btnS, width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:20, padding:12 }}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Sign in with Google
          </button>

          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
            <div style={{ flex:1, height:1, background:B.sand }}/><span style={{ fontSize:12, color:B.textLight, fontFamily:f1 }}>OR</span><div style={{ flex:1, height:1, background:B.sand }}/>
          </div>

          <FF label="Email"><input style={inp} type="email" value={form.email} onChange={e=>u("email",e.target.value)} placeholder="you@church.org"/></FF>
          <FF label="Password"><input style={inp} type="password" value={form.password} onChange={e=>u("password",e.target.value)} placeholder="Your password" onKeyDown={e=>e.key==="Enter"&&handleLogin()}/></FF>

          {error && <p style={{ color:B.red, fontSize:13, fontWeight:600, margin:"0 0 12px" }}>{error}</p>}

          <button onClick={handleLogin} disabled={busy} style={{ ...btnP, width:"100%", marginTop:4, opacity:busy?.6:1 }}>
            {busy ? "Signing in..." : "Sign In"}
          </button>

          <div style={{ textAlign:"center", marginTop:20 }}>
            <span style={{ fontSize:13, color:B.textLight }}>New to ChurchOpsHub? </span>
            <button onClick={()=>{setMode("register");setError(null);}} style={{ background:"none", border:"none", color:B.teal, fontWeight:600, cursor:"pointer", fontSize:13, fontFamily:f1 }}>Join your church</button>
            <span style={{ fontSize:13, color:B.textLight }}> or </span>
            <button onClick={()=>{setMode("createChurch");setError(null);}} style={{ background:"none", border:"none", color:B.teal, fontWeight:600, cursor:"pointer", fontSize:13, fontFamily:f1 }}>set up a new church</button>
          </div>
        </div>
      )}

      {mode === "register" && (
        <div style={cardStyle}>
          <div style={{ textAlign:"center", marginBottom:28 }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}><Logo size={48} /></div>
            <h1 style={{ fontFamily:f1, fontSize:24, fontWeight:700, color:B.navy, margin:"0 0 4px" }}>Join Your Church</h1>
            <p style={{ color:B.textLight, margin:0, fontSize:14 }}>Ask your administrator for the church code</p>
          </div>
          <FF label="Your Name"><input style={inp} value={form.name} onChange={e=>u("name",e.target.value)} placeholder="Full name"/></FF>
          <FF label="Email"><input style={inp} type="email" value={form.email} onChange={e=>u("email",e.target.value)} placeholder="you@email.com"/></FF>
          <FF label="Password"><input style={inp} type="password" value={form.password} onChange={e=>u("password",e.target.value)} placeholder="At least 6 characters"/></FF>
          <FF label="Church Code"><input style={{...inp, fontFamily:"monospace", letterSpacing:2, textTransform:"uppercase"}} value={form.churchCode} onChange={e=>u("churchCode",e.target.value)} placeholder="e.g. FXCC-2026"/></FF>
          {error && <p style={{ color:B.red, fontSize:13, fontWeight:600, margin:"0 0 12px" }}>{error}</p>}
          <button onClick={handleRegister} disabled={busy||!form.name||!form.email||!form.password||!form.churchCode} style={{ ...btnP, width:"100%", opacity:(busy||!form.name||!form.churchCode)?.5:1 }}>
            {busy ? "Creating account..." : "Create Account"}
          </button>
          <div style={{ textAlign:"center", marginTop:16 }}>
            <button onClick={()=>{setMode("login");setError(null);}} style={{ background:"none", border:"none", color:B.teal, fontWeight:600, cursor:"pointer", fontSize:13, fontFamily:f1 }}>Back to sign in</button>
          </div>
        </div>
      )}

      {mode === "googleRegister" && (
        <div style={cardStyle}>
          <div style={{ textAlign:"center", marginBottom:28 }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}><Logo size={48} /></div>
            <h1 style={{ fontFamily:f1, fontSize:24, fontWeight:700, color:B.navy, margin:"0 0 4px" }}>Almost There!</h1>
            <p style={{ color:B.textLight, margin:0, fontSize:14 }}>
              Signed in as <strong>{googleInfo?.email}</strong>.<br/>Enter your church code to complete registration.
            </p>
          </div>
          <FF label="Church Code"><input style={{...inp, fontFamily:"monospace", letterSpacing:2, textTransform:"uppercase"}} value={form.churchCode} onChange={e=>u("churchCode",e.target.value)} placeholder="e.g. FXCC-2026"/></FF>
          {error && <p style={{ color:B.red, fontSize:13, fontWeight:600, margin:"0 0 12px" }}>{error}</p>}
          <button onClick={handleGoogleRegister} disabled={busy||!form.churchCode} style={{ ...btnP, width:"100%", opacity:(busy||!form.churchCode)?.5:1 }}>
            {busy ? "Joining..." : "Join Church"}
          </button>
          <div style={{ textAlign:"center", marginTop:16 }}>
            <button onClick={()=>{setMode("login");setError(null);}} style={{ background:"none", border:"none", color:B.teal, fontWeight:600, cursor:"pointer", fontSize:13, fontFamily:f1 }}>Back to sign in</button>
          </div>
        </div>
      )}

      {mode === "createChurch" && (
        <div style={cardStyle}>
          <div style={{ textAlign:"center", marginBottom:28 }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}><Logo size={48} /></div>
            <h1 style={{ fontFamily:f1, fontSize:24, fontWeight:700, color:B.navy, margin:"0 0 4px" }}>Set Up Your Church</h1>
            <p style={{ color:B.textLight, margin:0, fontSize:14 }}>You'll be the admin. Share the church code with your team.</p>
          </div>
          <FF label="Church Name"><input style={inp} value={form.churchName} onChange={e=>u("churchName",e.target.value)} placeholder="e.g. Fairfax Church of Christ"/></FF>
          <FF label="Church Code (your team will use this to join)"><input style={{...inp, fontFamily:"monospace", letterSpacing:2, textTransform:"uppercase"}} value={form.churchCode} onChange={e=>u("churchCode",e.target.value)} placeholder="e.g. FXCC-2026"/></FF>
          <div style={{ height:1, background:B.sand, margin:"8px 0 16px" }}/>
          <FF label="Your Name"><input style={inp} value={form.name} onChange={e=>u("name",e.target.value)} placeholder="Full name"/></FF>
          <FF label="Email"><input style={inp} type="email" value={form.email} onChange={e=>u("email",e.target.value)} placeholder="you@church.org"/></FF>
          <FF label="Password"><input style={inp} type="password" value={form.password} onChange={e=>u("password",e.target.value)} placeholder="At least 6 characters"/></FF>
          {error && <p style={{ color:B.red, fontSize:13, fontWeight:600, margin:"0 0 12px" }}>{error}</p>}
          <button onClick={handleCreateChurch} disabled={busy||!form.churchName||!form.churchCode||!form.name||!form.email||!form.password} style={{ ...btnP, width:"100%", opacity:busy?.5:1 }}>
            {busy ? "Setting up..." : "Create Church & Account"}
          </button>
          <div style={{ textAlign:"center", marginTop:16 }}>
            <button onClick={()=>{setMode("login");setError(null);}} style={{ background:"none", border:"none", color:B.teal, fontWeight:600, cursor:"pointer", fontSize:13, fontFamily:f1 }}>Back to sign in</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ═══ SETTINGS PAGE ════════════════════════════ */
/* ═══════════════════════════════════════════════ */

function SettingsPage({ store, userProfile }) {
  const { settings, config, users, updateSettings, updateConfig, updateUser, loadUsers } = store;
  const [editList, setEditList] = useState(null); // { key, title, items }
  const [newItem, setNewItem] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [editCodeMode, setEditCodeMode] = useState(false);

  if (!settings || !config) return <Spinner />;

  function openListEditor(key, title) {
    setEditList({ key, title, items: [...(settings[key] || [])] });
    setNewItem("");
  }
  function addToList() {
    if (!newItem.trim() || editList.items.includes(newItem.trim())) return;
    const updated = [...editList.items, newItem.trim()];
    setEditList({ ...editList, items: updated });
    updateSettings({ [editList.key]: updated });
    setNewItem("");
  }
  function removeFromList(item) {
    const updated = editList.items.filter(i => i !== item);
    setEditList({ ...editList, items: updated });
    updateSettings({ [editList.key]: updated });
  }
  function handleChangeCode() {
    if (newCode.trim().length < 3) return;
    updateConfig({ churchCode: newCode.trim().toUpperCase() });
    setEditCodeMode(false);
    setNewCode("");
  }

  const listCard = (key, title, icon) => {
    const items = settings[key] || [];
    return (
      <div style={{ background:B.white, borderRadius:14, padding:"20px 22px", border:"1px solid "+B.sand, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <h3 style={{ margin:0, fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>{icon} {title}</h3>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:13, color:B.textLight }}>{items.length} items</span>
            <button onClick={() => openListEditor(key, title)} style={{ ...btnP, padding:"6px 14px", fontSize:12 }}>Edit</button>
          </div>
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {items.slice(0, 12).map(item => (
            <span key={item} style={{ padding:"4px 12px", borderRadius:20, background:B.warmGray, fontSize:12, color:B.textMid, fontFamily:f1, fontWeight:500 }}>{item}</span>
          ))}
          {items.length > 12 && <span style={{ padding:"4px 12px", fontSize:12, color:B.textLight }}>+{items.length - 12} more</span>}
        </div>
      </div>
    );
  };

  return (
    <div>
      <h2 style={{ fontFamily:f1, fontSize:22, fontWeight:700, color:B.navy, margin:"0 0 20px" }}>Settings</h2>

      {/* Church Info */}
      <div style={{ background:B.white, borderRadius:14, padding:"22px 24px", border:"1px solid "+B.sand, marginBottom:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <h3 style={{ margin:"0 0 16px", fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Church Info</h3>
        <div style={{ display:"flex", gap:20, flexWrap:"wrap", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Church Name</div>
            <div style={{ fontSize:16, fontWeight:600 }}>{config.churchName}</div>
          </div>
          <div>
            <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Church Code</div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {editCodeMode ? (
                <>
                  <input style={{...inp, width:150, fontFamily:"monospace", letterSpacing:2, textTransform:"uppercase", padding:"7px 12px"}} value={newCode} onChange={e=>setNewCode(e.target.value)} placeholder="NEW CODE"/>
                  <button onClick={handleChangeCode} style={{...btnP, padding:"7px 14px", fontSize:12}}>Save</button>
                  <button onClick={()=>setEditCodeMode(false)} style={{...btnS, padding:"7px 14px", fontSize:12}}>Cancel</button>
                </>
              ) : (
                <>
                  <span style={{ fontSize:16, fontWeight:700, fontFamily:"monospace", letterSpacing:2, color: showCode ? B.navy : B.textLight }}>
                    {showCode ? config.churchCode : "••••••••"}
                  </span>
                  <button onClick={()=>setShowCode(!showCode)} style={{ background:"none", border:"none", color:B.teal, cursor:"pointer", fontSize:12, fontFamily:f1, fontWeight:600 }}>
                    {showCode ? "Hide" : "Show"}
                  </button>
                  {userProfile?.role === "admin" && (
                    <button onClick={()=>{setEditCodeMode(true);setNewCode(config.churchCode||"");}} style={{ background:"none", border:"none", color:B.teal, cursor:"pointer", fontSize:12, fontFamily:f1, fontWeight:600 }}>Change</button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Managed Lists */}
      <div style={{ display:"grid", gap:16, marginBottom:20 }}>
        {listCard("locations", "Locations", "📍")}
        {listCard("ministries", "Ministries", "⛪")}
        {listCard("tags", "Tags", "🏷️")}
      </div>

      {/* Team Members */}
      <div style={{ background:B.white, borderRadius:14, padding:"22px 24px", border:"1px solid "+B.sand, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <h3 style={{ margin:0, fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Team Members</h3>
          <button onClick={loadUsers} style={{ ...btnS, padding:"6px 14px", fontSize:12 }}>Refresh</button>
        </div>
        {users.length === 0 ? <p style={{ color:B.textLight, fontSize:14 }}>No team members yet.</p> :
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {users.map(u => (
              <div key={u.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:10, background:B.warmGray, flexWrap:"wrap", gap:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:B.teal, display:"flex", alignItems:"center", justifyContent:"center", color:B.white, fontWeight:700, fontSize:14, fontFamily:f1 }}>{(u.name||"?")[0]}</div>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14 }}>{u.name}</div>
                    <div style={{ fontSize:12, color:B.textLight }}>{u.email}</div>
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, fontFamily:f1, background: u.role==="admin"?B.goldLight:B.tealPale, color:u.role==="admin"?"#96750E":B.teal }}>{u.role}</span>
                  {!u.active && <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, background:B.redPale, color:B.red }}>Inactive</span>}
                  {userProfile?.role === "admin" && u.id !== userProfile.id && u.active && (
                    <button onClick={()=>updateUser(u.id, {active:false})} style={{ ...btnS, padding:"4px 10px", fontSize:11, color:B.red, borderColor:"#FECACA" }}>Deactivate</button>
                  )}
                  {userProfile?.role === "admin" && !u.active && (
                    <button onClick={()=>updateUser(u.id, {active:true})} style={{ ...btnS, padding:"4px 10px", fontSize:11, color:B.teal, borderColor:B.tealPale }}>Reactivate</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        }
      </div>

      {/* List Editor Modal */}
      <Modal open={!!editList} onClose={()=>setEditList(null)} title={"Manage " + (editList?.title || "")}>
        {editList && <>
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            <input style={{...inp, flex:1}} value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder={`Add new ${editList.title.toLowerCase().slice(0,-1)}...`} onKeyDown={e=>e.key==="Enter"&&addToList()}/>
            <button onClick={addToList} disabled={!newItem.trim()} style={{ ...btnP, opacity:newItem.trim()?1:.5 }}>Add</button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:400, overflowY:"auto" }}>
            {editList.items.map(item => (
              <div key={item} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 14px", borderRadius:8, background:B.warmGray }}>
                <span style={{ fontSize:14 }}>{item}</span>
                <button onClick={()=>removeFromList(item)} style={{ background:"none", border:"none", color:B.red, cursor:"pointer", fontSize:16, padding:"2px 6px" }}>&times;</button>
              </div>
            ))}
          </div>
          {editList.items.length === 0 && <p style={{ color:B.textLight, fontSize:14, textAlign:"center", padding:20 }}>No items yet. Add some above.</p>}
        </>}
      </Modal>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ═══ DASHBOARD ════════════════════════════════ */
/* ═══════════════════════════════════════════════ */

function Dashboard({ store, userProfile }) {
  const { items, supplies, activityLog, reservations } = store;
  const activeItems = items.filter(i => i.status !== "Disposed");
  const counts = {
    total: activeItems.length,
    avail: activeItems.filter(i => i.status === "Available").length,
    inUse: activeItems.filter(i => i.status === "In Use").length,
    co: activeItems.filter(i => i.status === "Checked Out").length,
    repair: activeItems.filter(i => i.status === "Under Repair").length,
  };

  const today = new Date().toISOString().split("T")[0];
  const checkedOut = activeItems.filter(i => i.status === "Checked Out");
  const overdue = checkedOut.filter(i => i.expectedReturn && i.expectedReturn < today);
  const lowStock = supplies.filter(c => c.quantity <= c.minQuantity);
  const pendingRes = reservations.filter(r => r.status === "Pending");

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

      {/* Pending Reservations */}
      {pendingRes.length > 0 && (
        <div style={{ background:"#EDE7F6", border:"1px solid #D1C4E9", borderLeft:"4px solid #7C5BA0", borderRadius:14, padding:"18px 22px", marginBottom:20 }}>
          <h3 style={{ margin:"0 0 12px", fontSize:15, fontFamily:f1, fontWeight:700, color:"#7C5BA0" }}>Pending Reservations ({pendingRes.length})</h3>
          {pendingRes.map(r => (
            <div key={r._docId} style={{ padding:"8px 14px", borderRadius:8, background:B.white, marginBottom:6, fontSize:14 }}>
              <span style={{ fontWeight:600 }}>{r.itemDesc}</span>
              <span style={{ color:B.textLight }}> — {r.requestedByName} for {r.purpose} ({r.eventDate})</span>
            </div>
          ))}
        </div>
      )}

      {/* Checked Out */}
      <div style={{ background:B.white, borderRadius:14, padding:24, border:"1px solid "+B.sand, boxShadow:"0 1px 3px rgba(27,42,74,0.06)", marginBottom:20 }}>
        <h3 style={{ margin:"0 0 14px", fontFamily:f1, fontSize:17, fontWeight:700, color:B.navy }}>Currently Checked Out</h3>
        {checkedOut.length === 0 ? <p style={{ color:B.textLight, fontSize:14 }}>No items currently checked out.</p> :
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {checkedOut.map(item => (
              <div key={item._docId} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderRadius:10, background:B.goldLight, border:"1px solid #E8DFC0", flexWrap:"wrap", gap:8 }}>
                <div>
                  <span style={{ fontWeight:600, fontSize:14 }}>{item.description}</span>
                  <span style={{ color:B.textLight, fontSize:13, marginLeft:8 }}>{item.itemId}</span>
                  {item.assignedTo && <span style={{ color:B.textMid, fontSize:13 }}> — {item.assignedTo}</span>}
                </div>
                <Badge status={item.expectedReturn && item.expectedReturn < today ? "Under Repair" : "Checked Out"} />
              </div>
            ))}
          </div>
        }
      </div>

      {/* Recent Activity */}
      <div style={{ background:B.white, borderRadius:14, padding:24, border:"1px solid "+B.sand, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <h3 style={{ margin:"0 0 14px", fontFamily:f1, fontSize:17, fontWeight:700, color:B.navy }}>Recent Activity</h3>
        {activityLog.length === 0 ? <p style={{ color:B.textLight, fontSize:14 }}>No activity yet. Start by adding items to your inventory!</p> :
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {activityLog.slice(0, 10).map(l => {
              const icons = { check_out:"📤", return:"↩️", add_item:"➕", dispose:"🗑️", restock:"📦", use_supply:"📉", mark_repair:"🔧", mark_repaired:"✅", add_supply:"➕" };
              return (
                <div key={l._docId} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 14px", borderRadius:8, background:B.warmGray }}>
                  <span style={{ fontSize:16 }}>{icons[l.action]||"📋"}</span>
                  <div style={{ flex:1 }}>
                    <span style={{ fontWeight:600, fontSize:13 }}>{l.action.replace(/_/g," ")}</span>
                    <span style={{ color:B.textLight, fontSize:12, marginLeft:6 }}>({l.itemId})</span>
                    <span style={{ color:B.textMid, fontSize:12 }}> — {l.performedByName}</span>
                  </div>
                  <span style={{ fontSize:11, color:B.textLight }}>{l.timestamp?.split("T")[0]}</span>
                </div>
              );
            })}
          </div>
        }
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

/* ═══════════════════════════════════════════════ */
/* ═══ PLACEHOLDER PAGES ════════════════════════ */
/* ═══════════════════════════════════════════════ */

function PlaceholderPage({ icon, title, desc }) {
  return (
    <div style={{ background:B.white, borderRadius:18, padding:"60px 32px", border:"1px solid "+B.sand, textAlign:"center" }}>
      <div style={{ fontSize:48, marginBottom:16 }}>{icon}</div>
      <h3 style={{ fontFamily:f1, color:B.navy, margin:"0 0 8px", fontSize:20 }}>{title}</h3>
      <p style={{ color:B.textLight, fontSize:15 }}>{desc}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ═══ MAIN APP SHELL ═══════════════════════════ */
/* ═══════════════════════════════════════════════ */

export default function App() {
  const authHook = useAuth();
  const { user, userProfile, loading: authLoading } = authHook;

  if (authLoading) return <Spinner />;
  if (!user || !userProfile) return <AuthScreen authHook={authHook} />;

  return <AppShell authHook={authHook} />;
}

function AppShell({ authHook }) {
  const { userProfile, logout } = authHook;
  const store = useFirestore(userProfile.churchId);
  const [tab, setTab] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);

  if (store.loading) return <Spinner />;

  const tabBtn = (k) => ({
    padding:"10px 18px", borderRadius:10, border:"none", cursor:"pointer",
    fontSize:13, fontWeight:600, fontFamily:f1, letterSpacing:.2,
    transition:"all 0.2s", whiteSpace:"nowrap",
    background: tab===k ? "rgba(42,125,110,0.18)" : "transparent",
    color: tab===k ? B.white : "rgba(255,255,255,0.45)",
  });

  const lowStock = (store.supplies || []).filter(c => c.quantity <= c.minQuantity);
  const pendingRes = (store.reservations || []).filter(r => r.status === "Pending");

  return (
    <div style={{ fontFamily:f2, background:`linear-gradient(170deg, ${B.cream} 0%, ${B.warmGray} 100%)`, minHeight:"100vh", color:B.textDark }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet"/>

      {/* ═══ HEADER ═══ */}
      <div style={{ background:`linear-gradient(135deg, ${B.navy} 0%, ${B.navyLight} 60%, #2C4066 100%)`, padding:"18px 28px 14px", color:B.white, position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, opacity:0.04, backgroundImage:"radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize:"24px 24px" }}/>
        <div style={{ maxWidth:1100, margin:"0 auto", position:"relative" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
            <FullLogo size={36} light={true} />
            <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
              <div style={{ position:"relative" }}>
                <button onClick={()=>setMenuOpen(!menuOpen)} style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.08)", borderRadius:10, padding:"7px 14px", border:"1px solid rgba(255,255,255,0.1)", cursor:"pointer", color:B.white }}>
                  <div style={{ width:30, height:30, borderRadius:8, background:B.teal, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, fontFamily:f1 }}>{(userProfile.name||"?")[0]}</div>
                  <span style={{ fontSize:13, fontWeight:600, fontFamily:f1 }}>{userProfile.name}</span>
                  <span style={{ fontSize:10, opacity:.5 }}>▾</span>
                </button>
                {menuOpen && (
                  <div style={{ position:"absolute", top:"100%", right:0, marginTop:6, background:B.white, borderRadius:12, padding:8, minWidth:180, boxShadow:"0 8px 32px rgba(27,42,74,0.2)", zIndex:100 }}>
                    <div style={{ padding:"8px 12px", fontSize:12, color:B.textLight }}>{userProfile.email}</div>
                    <div style={{ padding:"4px 12px", marginBottom:4 }}><span style={{ padding:"2px 8px", borderRadius:12, fontSize:11, fontWeight:600, fontFamily:f1, background:userProfile.role==="admin"?B.goldLight:B.tealPale, color:userProfile.role==="admin"?"#96750E":B.teal }}>{userProfile.role}</span></div>
                    <div style={{ height:1, background:B.sand, margin:"4px 0" }}/>
                    <button onClick={()=>{logout();setMenuOpen(false);}} style={{ width:"100%", textAlign:"left", padding:"8px 12px", background:"none", border:"none", cursor:"pointer", color:B.red, fontSize:13, fontWeight:600, fontFamily:f1, borderRadius:6 }}
                      onMouseEnter={e=>e.currentTarget.style.background=B.redPale}
                      onMouseLeave={e=>e.currentTarget.style.background="none"}>
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display:"flex", gap:2, marginTop:16, marginBottom:-14, overflowX:"auto" }}>
            {[["dashboard","Dashboard"],["inventory","All Items"],["supplies","Supplies"],["reservations","Reservations"],["log","Activity Log"],["settings","Settings"]].map(([k,v]) =>
              <button key={k} onClick={()=>{setTab(k);setMenuOpen(false);}} style={tabBtn(k)}>{v}
                {k==="supplies"&&lowStock.length>0&&<span style={{ marginLeft:6, background:B.red, color:"#fff", borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 }}>{lowStock.length}</span>}
                {k==="reservations"&&pendingRes.length>0&&<span style={{ marginLeft:6, background:B.gold, color:"#fff", borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 }}>{pendingRes.length}</span>}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Accent bar */}
      <div style={{ height:3, background:`linear-gradient(90deg, ${B.teal}, ${B.gold})` }}/>

      {/* Page content */}
      <div style={{ maxWidth:1100, margin:"0 auto", padding:"28px 28px 60px" }} onClick={()=>menuOpen&&setMenuOpen(false)}>
        {tab === "dashboard" && <Dashboard store={store} userProfile={userProfile} />}
        {tab === "settings" && <SettingsPage store={store} userProfile={userProfile} />}
        {tab === "inventory" && <PlaceholderPage icon="📋" title="All Items" desc="Inventory management coming in Session 2. You'll be able to add, edit, check out, and return items here." />}
        {tab === "supplies" && <PlaceholderPage icon="📦" title="Supplies & Consumables" desc="Supply tracking coming in Session 2. Track quantities, log usage, and get low-stock alerts." />}
        {tab === "reservations" && <PlaceholderPage icon="📅" title="Reservations" desc="Equipment reservations coming in Session 2. Ministry leaders can request items for events." />}
        {tab === "log" && <PlaceholderPage icon="📋" title="Activity Log" desc="Full activity history coming in Session 2. Every action tracked with who, what, and when." />}
      </div>

      {/* Footer */}
      <div style={{ background:B.navy, padding:"24px 28px", textAlign:"center" }}>
        <FullLogo size={26} light={true} />
        <p style={{ color:"rgba(255,255,255,0.25)", fontSize:11, fontFamily:f1, marginTop:10 }}>churchopshub.com</p>
      </div>
    </div>
  );
}
