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

          <button onClick={handleGoogle} disabled={busy} style={{ ...btnS, width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:20, padding:12 }}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Join with Google
          </button>

          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
            <div style={{ flex:1, height:1, background:B.sand }}/><span style={{ fontSize:12, color:B.textLight, fontFamily:f1 }}>OR</span><div style={{ flex:1, height:1, background:B.sand }}/>
          </div>

          <FF label="Your Name"><input style={inp} value={form.name} onChange={e=>u("name",e.target.value)} placeholder="Full name"/></FF>
          <FF label="Email"><input style={inp} type="email" value={form.email} onChange={e=>u("email",e.target.value)} placeholder="you@email.com"/></FF>
          <FF label="Password"><input style={inp} type="password" value={form.password} onChange={e=>u("password",e.target.value)} placeholder="At least 6 characters"/></FF>
          <FF label="Church Code"><input style={{...inp, fontFamily:"monospace", letterSpacing:2, textTransform:"uppercase"}} value={form.churchCode} onChange={e=>u("churchCode",e.target.value)} placeholder="e.g. FXCC"/></FF>
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
              const icons = { check_out:"📤", return:"↩️", add_item:"➕", dispose:"🗑️", restock:"📦", use_supply:"📉", mark_repair:"🔧", mark_repaired:"✅", add_supply:"➕", reservation_approved:"✅📅", reservation_denied:"❌📅" };
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
/* ═══ ALL ITEMS PAGE ══════════════════════════ */
/* ═══════════════════════════════════════════════ */

function ItemsPage({ store, userProfile }) {
  const { items, settings, addItem, updateItem, checkOutItem, returnItem, retireItem, markRepair, markRepaired } = store;
  const activeItems = items.filter(i => i.status !== "Disposed");
  const disposedItems = items.filter(i => i.status === "Disposed");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [showDisposed, setShowDisposed] = useState(false);

  // Modals
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(null);       // item object
  const [showCheckOut, setShowCheckOut] = useState(null); // item object
  const [showReturn, setShowReturn] = useState(null);     // item object
  const [showRepair, setShowRepair] = useState(null);     // item object
  const [showRetire, setShowRetire] = useState(null);     // item object
  const [showDetail, setShowDetail] = useState(null);     // item object

  // Forms
  const emptyItem = { itemId:"", description:"", location:"", ministry:"", status:"Available", condition:"Good", notes:"", tags:[] };
  const [itemForm, setItemForm] = useState(emptyItem);
  const [coForm, setCoForm] = useState({ person:"", purpose:"", ministry:"", date:"", returnDate:"" });
  const [retForm, setRetForm] = useState({ condition:"Good", notes:"" });
  const [repairForm, setRepairForm] = useState({ issue:"", handler:"", expectedDate:"" });
  const [retireForm, setRetireForm] = useState({ reason:"Broken", date:"", notes:"", recoveryValue:"" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const locations = settings?.locations || [];
  const ministries = settings?.ministries || [];
  const tagOptions = settings?.tags || [];
  const userId = userProfile?.id || userProfile?.uid;
  const userName = userProfile?.name || "Unknown";

  // Filter logic
  const displayItems = (showDisposed ? disposedItems : activeItems).filter(item => {
    if (search && !item.description?.toLowerCase().includes(search.toLowerCase()) && !item.itemId?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (locationFilter !== "all" && item.location !== locationFilter) return false;
    return true;
  });

  // Helpers
  function flash(text) { setMsg(text); setTimeout(()=>setMsg(""), 3000); }
  const today = new Date().toISOString().split("T")[0];

  // ── Add Item ──
  async function handleAdd() {
    if (!itemForm.itemId.trim() || !itemForm.description.trim()) return;
    setSaving(true);
    await addItem({
      itemId: itemForm.itemId.trim(),
      description: itemForm.description.trim(),
      location: itemForm.location,
      ministry: itemForm.ministry,
      status: "Available",
      condition: itemForm.condition || "Good",
      notes: itemForm.notes,
      tags: itemForm.tags || [],
      assignedTo: "",
      checkOutDate: "",
      expectedReturn: ""
    }, userId, userName);
    setShowAdd(false);
    setItemForm(emptyItem);
    setSaving(false);
    flash("Item added to inventory!");
  }

  // ── Edit Item ──
  async function handleEdit() {
    if (!showEdit) return;
    setSaving(true);
    await updateItem(showEdit._docId, {
      itemId: itemForm.itemId.trim(),
      description: itemForm.description.trim(),
      location: itemForm.location,
      ministry: itemForm.ministry,
      condition: itemForm.condition,
      notes: itemForm.notes,
      tags: itemForm.tags || []
    }, userId, userName);
    setShowEdit(null);
    setSaving(false);
    flash("Item updated!");
  }

  // ── Check Out ──
  async function handleCheckOut() {
    if (!showCheckOut || !coForm.person.trim()) return;
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
      status: item.status
    });
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
      acts.push(<button key="co" onClick={(e)=>{e.stopPropagation();setCoForm({ person:"", purpose:"", ministry:item.ministry||"", date:today, returnDate:"" });setShowCheckOut(item);}} style={{ ...btnP, padding:"6px 14px", fontSize:12 }}>Check Out</button>);
      acts.push(<button key="rep" onClick={(e)=>{e.stopPropagation();setShowRepair(item);}} style={{ ...btnS, padding:"6px 14px", fontSize:12 }}>Repair</button>);
    }
    if (item.status === "Checked Out" || item.status === "In Use") {
      acts.push(<button key="ret" onClick={(e)=>{e.stopPropagation();setShowReturn(item);}} style={{ ...btnP, padding:"6px 14px", fontSize:12, background:B.gold }}>Return</button>);
    }
    if (item.status === "Under Repair") {
      acts.push(<button key="fixed" onClick={(e)=>{e.stopPropagation();handleRepaired(item);}} style={{ ...btnP, padding:"6px 14px", fontSize:12 }}>Mark Repaired</button>);
    }
    if (item.status !== "Disposed") {
      acts.push(<button key="edit" onClick={(e)=>{e.stopPropagation();openEdit(item);}} style={{ ...btnS, padding:"6px 14px", fontSize:12 }}>Edit</button>);
    }
    return acts;
  }

  // ── Item detail row ──
  function ItemRow({ item }) {
    const overdue = item.status === "Checked Out" && item.expectedReturn && item.expectedReturn < today;
    return (
      <div
        onClick={()=>setShowDetail(showDetail?._docId === item._docId ? null : item)}
        style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"14px 18px", borderRadius:12, cursor:"pointer",
          background: overdue ? B.redPale : B.white,
          border: overdue ? "1px solid #FECACA" : "1px solid "+B.sand,
          transition:"all 0.15s", flexWrap:"wrap", gap:10
        }}
        onMouseEnter={e=>{ if(!overdue) e.currentTarget.style.borderColor=B.teal; e.currentTarget.style.boxShadow="0 2px 8px rgba(42,125,110,0.08)"; }}
        onMouseLeave={e=>{ e.currentTarget.style.borderColor=overdue?"#FECACA":B.sand; e.currentTarget.style.boxShadow="none"; }}
      >
        <div style={{ display:"flex", alignItems:"center", gap:12, flex:1, minWidth:200 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:B.tealPale, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>📋</div>
          <div>
            <div style={{ fontWeight:600, fontSize:14, color:B.navy }}>{item.description || "Unnamed"}</div>
            <div style={{ fontSize:12, color:B.textLight, display:"flex", gap:8, flexWrap:"wrap", marginTop:2 }}>
              <span style={{ fontFamily:"monospace", letterSpacing:1 }}>{item.itemId}</span>
              {item.location && <span>📍 {item.location}</span>}
              {item.assignedTo && <span>👤 {item.assignedTo}</span>}
              {overdue && <span style={{ color:B.red, fontWeight:700 }}>OVERDUE</span>}
            </div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <Badge status={item.status} />
          {itemActions(item)}
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
        <button onClick={()=>{setItemForm(emptyItem);setShowAdd(true);}} style={btnP}>+ Add Item</button>
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
            <select value={locationFilter} onChange={e=>setLocationFilter(e.target.value)} style={{...inp, width:"auto", flex:"0 1 180px"}}>
              <option value="all">All Locations</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
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
          <div style={{ display:"flex", gap:8, marginTop:20, flexWrap:"wrap" }}>
            {itemActions(showDetail)}
            {showDetail.status !== "Disposed" && (
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
        <button onClick={handleAdd} disabled={saving||!itemForm.itemId.trim()||!itemForm.description.trim()} style={{ ...btnP, width:"100%", opacity:(saving||!itemForm.itemId.trim()||!itemForm.description.trim())?.5:1, marginTop:4 }}>
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
/* ═══════════════════════════════════════════════ */
/* ═══ SUPPLIES PAGE ═══════════════════════════ */
/* ═══════════════════════════════════════════════ */

function SuppliesPage({ store, userProfile }) {
  const { supplies, settings, addSupply, useSupply, restockSupply } = store;

  const [search, setSearch] = useState("");
  const [showLowOnly, setShowLowOnly] = useState(false);

  // Modals
  const [showAdd, setShowAdd] = useState(false);
  const [showUse, setShowUse] = useState(null);      // supply object
  const [showRestock, setShowRestock] = useState(null); // supply object

  // Forms
  const emptySupply = { supplyId:"", description:"", location:"", ministry:"", quantity:0, minQuantity:5, unit:"each" };
  const [supForm, setSupForm] = useState(emptySupply);
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
        <button onClick={()=>{setSupForm(emptySupply);setShowAdd(true);}} style={btnP}>+ Add Supply</button>
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
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))", gap:12 }}>
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


/* ═══════════════════════════════════════════════ */
/* ═══ ACTIVITY LOG PAGE ════════════════════════ */
/* ═══════════════════════════════════════════════ */

function ActivityLogPage({ store }) {
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
            <input type="date" style={inp} value={dateTo} onChange={e=>{setDateTo(e.target.value);setPage(0);}} />
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
            <button disabled={safePage===0} onClick={()=>setPage(safePage-1)} style={{ ...btnS, padding:"6px 14px", fontSize:12, opacity:safePage===0?.4:1 }}>← Prev</button>
            <span style={{ fontSize:13, color:B.textMid, fontFamily:f1 }}>Page {safePage+1} of {totalPages}</span>
            <button disabled={safePage>=totalPages-1} onClick={()=>setPage(safePage+1)} style={{ ...btnS, padding:"6px 14px", fontSize:12, opacity:safePage>=totalPages-1?.4:1 }}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════ */
/* ═══ RESERVATIONS PAGE ════════════════════════ */
/* ═══════════════════════════════════════════════ */

function ReservationsPage({ store, userProfile }) {
  const { items, settings, reservations, addReservation, updateReservation, checkOutItem, logActivity } = store;
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

  async function handleAdd() {
    if (!form.itemDocId || !form.eventName.trim() || !form.eventDate) return;
    setSaving(true);
    try {
      await addReservation({
        itemDocId: form.itemDocId,
        itemId: form.itemId,
        itemDesc: form.itemDesc,
        eventName: form.eventName,
        eventDate: form.eventDate,
        returnDate: form.returnDate,
        purpose: form.purpose,
        ministry: form.ministry,
        notes: form.notes,
      }, userId, userName);
      flash("Reservation requested!");
      setForm(emptyRes);
      setShowAdd(false);
    } catch(e) { flash("Error: "+e.message); }
    setSaving(false);
  }

  async function handleApprove(res) {
    setSaving(true);
    await updateReservation(res._docId, { status:"Approved", approvedBy:userId, approvedByName:userName, approvedAt:new Date().toISOString() });
    await logActivity("reservation_approved", res.itemId, userId, userName, { eventName:res.eventName, requestedBy:res.requestedByName });
    flash("Reservation approved!");
    setShowDetail(null);
    setSaving(false);
  }

  async function handleDeny(res) {
    setSaving(true);
    await updateReservation(res._docId, { status:"Denied", deniedBy:userId, deniedByName:userName, deniedAt:new Date().toISOString() });
    await logActivity("reservation_denied", res.itemId, userId, userName, { eventName:res.eventName, requestedBy:res.requestedByName });
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
        <button onClick={()=>{setForm(emptyRes);setShowAdd(true);}} style={btnP}>+ New Reservation</button>
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
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                      <span style={{ fontWeight:700, fontSize:16, fontFamily:f1, color:B.navy }}>{r.eventName}</span>
                      <ResBadge status={r.status}/>
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
      <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="New Reservation" wide>
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
        <FF label="Additional Notes">
          <textarea style={{...inp, minHeight:60, resize:"vertical"}} value={form.notes} onChange={e=>setForm(f=>({...f, notes:e.target.value}))} placeholder="Any special requirements..."/>
        </FF>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
          <button onClick={()=>setShowAdd(false)} style={btnS}>Cancel</button>
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
        {tab === "inventory" && <ItemsPage store={store} userProfile={userProfile} />}
        {tab === "supplies" && <SuppliesPage store={store} userProfile={userProfile} />}
        {tab === "reservations" && <ReservationsPage store={store} userProfile={userProfile} />}
        {tab === "log" && <ActivityLogPage store={store} />}
      </div>

      {/* Footer */}
      <div style={{ background:B.navy, padding:"24px 28px", textAlign:"center" }}>
        <FullLogo size={26} light={true} />
        <p style={{ color:"rgba(255,255,255,0.25)", fontSize:11, fontFamily:f1, marginTop:10 }}>churchopshub.com</p>
      </div>
    </div>
  );
}
