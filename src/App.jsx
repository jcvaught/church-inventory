import { useState, useEffect, useContext } from 'react';
import { useAuth } from './useAuth.js';
import { useFirestore } from './useFirestore.js';
import { useSubscription } from './hooks/useSubscription.js';
import { B, f1, f2, inp, btnP, btnS } from './components/brand/tokens.js';
import { MobileCtx, useWindowWidth } from './hooks/useMobile.js';
import { Logo, FullLogo } from './components/brand/Logo.jsx';
import { FF } from './components/primitives/FF.jsx';
import { Spinner } from './components/primitives/Spinner.jsx';
import { UpgradeGate } from './components/primitives/UpgradeGate.jsx';
import { MaintenancePage } from './pages/hubs/MaintenancePage.jsx';
import { InsightsPage } from './pages/hubs/InsightsPage.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { ItemsPage } from './pages/ItemsPage.jsx';
import { SuppliesPage } from './pages/SuppliesPage.jsx';
import { ReservationsPage } from './pages/ReservationsPage.jsx';
import { ActivityLogPage } from './pages/ActivityLogPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';


/* ═══════════════════════════════════════════════ */
/* ═══ AUTH SCREENS ═════════════════════════════ */
/* ═══════════════════════════════════════════════ */

function AuthScreen({ authHook }) {
  const { login, loginWithGoogle, register, registerWithGoogle, createChurch, resetPassword, error, setError } = authHook;
  const [mode, setMode] = useState("login"); // login, register, createChurch, googleRegister, forgotPassword
  const [form, setForm] = useState({ name:"", email:"", password:"", churchCode:"", churchName:"" });
  const [busy, setBusy] = useState(false);
  const [googleInfo, setGoogleInfo] = useState(null);
  const [resetSent, setResetSent] = useState(false);
  const u = (k,v) => { setForm(f=>({...f,[k]:v})); setError(null); };

  async function handleResetPassword(e) {
    e?.preventDefault(); setBusy(true);
    const res = await resetPassword(form.email);
    setBusy(false);
    if (res?.success) setResetSent(true);
  }

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

          <div style={{ textAlign:"right", marginTop:-8, marginBottom:12 }}>
            <button onClick={()=>{setMode("forgotPassword");setError(null);setResetSent(false);}} style={{ background:"none", border:"none", color:B.teal, fontWeight:500, cursor:"pointer", fontSize:12, fontFamily:f1 }}>Forgot password?</button>
          </div>

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

      {mode === "forgotPassword" && (
        <div style={cardStyle}>
          <div style={{ textAlign:"center", marginBottom:28 }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}><Logo size={52} /></div>
            <h1 style={{ fontFamily:f1, fontSize:24, fontWeight:700, color:B.navy, margin:"0 0 4px" }}>Reset password</h1>
            <p style={{ color:B.textLight, margin:0, fontSize:14 }}>We'll send a reset link to your email</p>
          </div>

          {resetSent ? (
            <div style={{ background:B.cream, borderRadius:12, padding:"16px 20px", textAlign:"center", marginBottom:16 }}>
              <p style={{ color:B.teal, fontWeight:600, margin:"0 0 4px", fontFamily:f1 }}>Email sent!</p>
              <p style={{ color:B.textLight, fontSize:13, margin:0 }}>Check your inbox for a password reset link.</p>
            </div>
          ) : (
            <>
              <FF label="Email"><input style={inp} type="email" value={form.email} onChange={e=>u("email",e.target.value)} placeholder="you@church.org" onKeyDown={e=>e.key==="Enter"&&handleResetPassword()}/></FF>
              {error && <p style={{ color:B.red, fontSize:13, fontWeight:600, margin:"0 0 12px" }}>{error}</p>}
              <button onClick={handleResetPassword} disabled={busy||!form.email} style={{ ...btnP, width:"100%", opacity:(busy||!form.email)?.5:1 }}>
                {busy ? "Sending..." : "Send Reset Link"}
              </button>
            </>
          )}

          <div style={{ textAlign:"center", marginTop:20 }}>
            <button onClick={()=>{setMode("login");setError(null);setResetSent(false);}} style={{ background:"none", border:"none", color:B.teal, fontWeight:600, cursor:"pointer", fontSize:13, fontFamily:f1 }}>Back to sign in</button>
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
  const { user, userProfile, logout } = authHook;
  const store = useFirestore(userProfile.churchId);
  const { subscription, hasHub, canAddUser } = useSubscription(userProfile.churchId);
  const [tab, setTab] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const isMobile = useWindowWidth() < 768;
  const [initialItemId] = useState(() => new URLSearchParams(window.location.search).get('item'));

  useEffect(() => {
    if (initialItemId) {
      window.history.replaceState({}, '', window.location.pathname);
      setTab('inventory');
    }
  }, []);

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
  const hasMaintenance = hasHub('maintenance');
  const hasInsights = hasHub('insights');

  // Per-user hub visibility: admins see all; others filtered by allowedHubs
  function userCanSeeHub(hubName) {
    if (!hasHub(hubName)) return false;
    if (userProfile?.role === 'admin') return true;
    const allowed = userProfile?.allowedHubs;
    if (allowed == null) return true;
    return allowed.includes(hubName);
  }
  const showMaintenanceTab = !hasMaintenance || userCanSeeHub('maintenance');
  const showInsightsTab = !hasInsights || userCanSeeHub('insights');
  const canAdd = canAddUser((store.users || []).length);

  return (
    <MobileCtx.Provider value={isMobile}>
    <div style={{ fontFamily:f2, background:`linear-gradient(170deg, ${B.cream} 0%, ${B.warmGray} 100%)`, minHeight:"100vh", color:B.textDark }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet"/>

      {/* ═══ HEADER ═══ */}
      <div style={{ background:`linear-gradient(135deg, ${B.navy} 0%, ${B.navyLight} 60%, #2C4066 100%)`, padding:isMobile?"14px 16px 14px":"18px 28px 14px", color:B.white, position:"relative", overflow:"hidden" }}>
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
                    <div style={{ padding:"4px 12px", marginBottom:4 }}><span style={{ padding:"2px 8px", borderRadius:12, fontSize:11, fontWeight:600, fontFamily:f1, background:userProfile.role==="admin"?B.goldLight:userProfile.role==="manager"?"#EDF2FF":B.tealPale, color:userProfile.role==="admin"?"#96750E":userProfile.role==="manager"?"#3730A3":B.teal }}>{userProfile.role}</span></div>
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

          {/* Tabs — desktop only */}
          {!isMobile && <div style={{ display:"flex", gap:2, marginTop:16, marginBottom:-14, overflowX:"auto" }}>
            {[
              ["dashboard","Dashboard"],["inventory","All Items"],["supplies","Supplies"],
              ["reservations","Reservations"],["log","Activity Log"],
              ...(showInsightsTab ? [["insights","Insights"]] : []),
              ...(showMaintenanceTab ? [["maintenance","Maintenance"]] : []),
              ["settings","Settings"],
            ].map(([k,v]) =>
              <button key={k} onClick={()=>{setTab(k);setMenuOpen(false);}} style={tabBtn(k)}>{v}
                {k==="maintenance"&&!hasMaintenance&&<span style={{ marginLeft:4, opacity:.7 }}>🔒</span>}
                {k==="insights"&&!hasInsights&&<span style={{ marginLeft:4, opacity:.7 }}>🔒</span>}
                {k==="supplies"&&lowStock.length>0&&<span style={{ marginLeft:6, background:B.red, color:"#fff", borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 }}>{lowStock.length}</span>}
                {k==="reservations"&&pendingRes.length>0&&<span style={{ marginLeft:6, background:B.gold, color:"#fff", borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 }}>{pendingRes.length}</span>}
              </button>
            )}
          </div>}
        </div>
      </div>

      {/* Accent bar */}
      <div style={{ height:3, background:`linear-gradient(90deg, ${B.teal}, ${B.gold})` }}/>

      {/* Page content */}
      <div style={{ maxWidth:1100, margin:"0 auto", padding:isMobile?"16px 14px 96px":"28px 28px 60px" }} onClick={()=>menuOpen&&setMenuOpen(false)}>
        {tab === "dashboard" && <Dashboard store={store} userProfile={userProfile} />}
        {tab === "settings" && <SettingsPage store={store} userProfile={userProfile} subscription={subscription} user={user} canAdd={canAdd} />}
        {tab === "inventory" && <ItemsPage store={store} userProfile={userProfile} initialItemId={initialItemId} />}
        {tab === "supplies" && <SuppliesPage store={store} userProfile={userProfile} />}
        {tab === "reservations" && <ReservationsPage store={store} userProfile={userProfile} />}
        {tab === "log" && <ActivityLogPage store={store} />}
        {tab === "insights" && (
          <UpgradeGate
            hubName="insights"
            hubLabel="Insights Hub"
            hubPrice="$7"
            hubDescription="Understand how your inventory is really being used — utilization stats, ministry breakdowns, seasonal trends, and financial tracking."
            hasHub={hasInsights}
          >
            <InsightsPage store={store} userProfile={userProfile} />
          </UpgradeGate>
        )}
        {tab === "maintenance" && (
          <UpgradeGate
            hubName="maintenance"
            hubLabel="Maintenance Hub"
            hubPrice="$19"
            hubDescription="Track repair tickets, manage vendors, and keep your equipment in top shape."
            hasHub={hasMaintenance}
          >
            <MaintenancePage store={store} userProfile={userProfile} />
          </UpgradeGate>
        )}
      </div>

      {/* Footer — desktop only */}
      {!isMobile && (
        <div style={{ background:B.navy, padding:"24px 28px", textAlign:"center" }}>
          <FullLogo size={26} light={true} />
          <p style={{ color:"rgba(255,255,255,0.25)", fontSize:11, fontFamily:f1, marginTop:10 }}>churchopshub.com</p>
        </div>
      )}

      {/* Mobile Bottom Nav */}
      {isMobile && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:200, background:B.white, borderTop:"1px solid "+B.sand, display:"flex", paddingBottom:"env(safe-area-inset-bottom, 0px)" }}>
          {[
            ["dashboard","Home","🏠"],
            ["inventory","Items","📦"],
            ["supplies","Stock","🧴"],
            ["reservations","Reserve","📅"],
            ...(showInsightsTab ? [["insights","Insights","📊"]] : []),
            ...(showMaintenanceTab ? [["maintenance","Maint","🔧"]] : []),
            ["settings","Settings","⚙️"],
          ].map(([k,label,icon]) => (
            <button key={k} onClick={()=>{setTab(k);setMenuOpen(false);}}
              style={{ flex:1, padding:"8px 2px 6px", border:"none", background:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2, color:tab===k?B.teal:B.textLight, position:"relative" }}>
              <span style={{ fontSize:20 }}>{icon}</span>
              <span style={{ fontSize:9, fontWeight:700, fontFamily:f1, letterSpacing:.3 }}>{label}{k==="maintenance"&&!hasMaintenance?" 🔒":""}{k==="insights"&&!hasInsights?" 🔒":""}</span>
              {k==="supplies"&&lowStock.length>0&&<span style={{ position:"absolute", top:4, right:"calc(50% - 16px)", background:B.red, color:"#fff", borderRadius:10, padding:"0 4px", fontSize:9, fontWeight:700, minWidth:14, textAlign:"center" }}>{lowStock.length}</span>}
              {k==="reservations"&&pendingRes.length>0&&<span style={{ position:"absolute", top:4, right:"calc(50% - 16px)", background:B.gold, color:"#fff", borderRadius:10, padding:"0 4px", fontSize:9, fontWeight:700, minWidth:14, textAlign:"center" }}>{pendingRes.length}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
    </MobileCtx.Provider>
  );
}
