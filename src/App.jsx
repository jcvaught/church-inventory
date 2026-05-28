import { useState, useEffect, useRef, useId, Component } from 'react';
import * as Sentry from '@sentry/react';
import { useAuth } from './useAuth.js';
import { useFirestore } from './useFirestore.js';
import { useSubscription } from './hooks/useSubscription.js';
import { B, f1, f2, inp, btnP, btnS } from './components/brand/tokens.js';
import { MobileCtx, useWindowWidth } from './hooks/useMobile.js';
import { Logo, FullLogo } from './components/brand/Logo.jsx';
import { FF } from './components/primitives/FF.jsx';
import { Spinner } from './components/primitives/Spinner.jsx';
import { HubsPage } from './pages/HubsPage.jsx';
import { LandingPage } from './pages/LandingPage.jsx';
import { PublicRequestPage } from './pages/PublicRequestPage.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { VolunteerHome } from './pages/VolunteerHome.jsx';
import { isVolunteerOnly } from './utils/roleHelpers.js';
import { ItemsPage } from './pages/ItemsPage.jsx';
import { SuppliesPage } from './pages/SuppliesPage.jsx';
import { ReservationsPage } from './pages/ReservationsPage.jsx';
import { ActivityLogPage } from './pages/ActivityLogPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { BarcodeScanner } from './components/primitives/BarcodeScanner.jsx';
import { HelpPage } from './pages/HelpPage.jsx';
import { PrivacyPage } from './pages/PrivacyPage.jsx';
import { TermsPage } from './pages/TermsPage.jsx';
import { PublicSMSProgramPage } from './pages/PublicSMSProgramPage.jsx';
import { BlogIndex } from './pages/BlogIndex.jsx';
import { BlogPost } from './pages/BlogPost.jsx';
import { TermsBody } from './components/legal/TermsBody.jsx';
import { PrivacyBody } from './components/legal/PrivacyBody.jsx';
import { RES_STATUS } from './utils/constants.js';


class PageErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(error, info) {
    Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack } } });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', background: '#FFF1F2', border: '1px solid #FECACA', borderRadius: 14, margin: 24 }}>
          <div style={{ fontWeight: 700, color: '#B91C1C', marginBottom: 12 }}>Page crashed — error details:</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#7F1D1D' }}>{this.state.error.toString()}{'\n\n'}{this.state.error.stack}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: '8px 18px', background: '#B91C1C', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ═══════════════════════════════════════════════ */
/* ═══ AUTH SCREENS ═════════════════════════════ */
/* ═══════════════════════════════════════════════ */

function AuthScreen({ authHook, initialMode = 'login', onBack }) {
  const { login, loginWithGoogle, register, registerWithGoogle, createChurch, resetPassword, error, setError } = authHook;
  const isMobile = useWindowWidth() < 768;
  const [inviteData] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const code = p.get('invite');
    if (code) {
      const hubs = p.get('hubs');
      const data = { code: code.toUpperCase(), hubs: hubs != null ? hubs.split(',').filter(Boolean) : null };
      // The invite param is stripped from the URL just below, and inviteData
      // lives only in component state — so a refresh or a redirect-based Google
      // sign-in would lose it (Continue button then stuck disabled on an empty
      // church code). Stash it in sessionStorage so it survives the round-trip.
      try { sessionStorage.setItem('coh_invite', JSON.stringify(data)); } catch { /* sessionStorage unavailable */ }
      window.history.replaceState({}, '', window.location.pathname);
      return data;
    }
    // No invite in the URL — fall back to one captured earlier this tab session.
    try {
      const saved = sessionStorage.getItem('coh_invite');
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return null;
  });
  const [mode, setMode] = useState(inviteData ? "register" : initialMode);
  const [form, setForm] = useState({ firstName:"", lastName:"", email:"", password:"", churchCode: inviteData?.code || "", churchName:"" });
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleInfo, setGoogleInfo] = useState(null);
  const [resetSent, setResetSent] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showLegal, setShowLegal] = useState(null); // "terms" | "privacy" | null
  const u = (k,v) => { setForm(f=>({...f,[k]:v})); setError(null); };

  const tosCheckbox = (
    <div style={{ display:"flex", alignItems:"flex-start", gap:8, margin:"0 0 14px", fontSize:13, color:B.textLight }}>
      <input type="checkbox" id="tos" checked={agreedToTerms} onChange={e=>setAgreedToTerms(e.target.checked)} style={{ marginTop:2, accentColor:B.teal, cursor:"pointer" }} />
      <label htmlFor="tos" style={{ cursor:"pointer", lineHeight:1.5 }}>
        I agree to the{" "}
        <button type="button" onClick={()=>setShowLegal("terms")} style={{ background:"none", border:"none", color:B.teal, fontWeight:600, cursor:"pointer", fontSize:13, padding:0, fontFamily:f2, textDecoration:"underline" }}>Terms of Service</button>
        {" "}and{" "}
        <button type="button" onClick={()=>setShowLegal("privacy")} style={{ background:"none", border:"none", color:B.teal, fontWeight:600, cursor:"pointer", fontSize:13, padding:0, fontFamily:f2, textDecoration:"underline" }}>Privacy Policy</button>
      </label>
    </div>
  );

  async function handleResetPassword(e) {
    e?.preventDefault(); setBusy(true);
    const res = await resetPassword(form.email);
    setBusy(false);
    if (res?.success) setResetSent(true);
  }

  async function handleLogin(e) {
    e?.preventDefault(); setBusy(true);
    await login(form.email, form.password);
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
    e?.preventDefault();
    if (honeypot) return; // S-12: bot trap — silently reject
    setBusy(true);
    const res = await register({ firstName:form.firstName, lastName:form.lastName, email:form.email, password:form.password, churchCode:form.churchCode, allowedHubs: inviteData?.hubs ?? null });
    if (res?.success) { try { sessionStorage.removeItem('coh_invite'); } catch { /* ignore */ } }
    setBusy(false);
  }
  async function handleGoogleRegister(e) {
    e?.preventDefault(); setBusy(true);
    const res = await registerWithGoogle({ churchCode:form.churchCode, allowedHubs: inviteData?.hubs ?? null });
    if (res?.success) { try { sessionStorage.removeItem('coh_invite'); } catch { /* ignore */ } }
    setBusy(false);
  }
  async function handleCreateChurch(e) {
    e?.preventDefault();
    if (honeypot) return; // Bot trap — silently reject
    setBusy(true);
    await createChurch({ churchName:form.churchName, churchCode:form.churchCode, firstName:form.firstName, lastName:form.lastName, email:form.email, password:form.password });
    setBusy(false);
  }

  const cardStyle = { background:B.white, borderRadius:20, padding:"44px 40px", maxWidth:420, width:"92%", boxShadow:"0 8px 40px rgba(27,42,74,0.1)" };

  return (
    <div style={{ fontFamily:f2, minHeight:"100vh", background:`linear-gradient(170deg, ${B.cream} 0%, ${B.warmGray} 100%)`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      {onBack && (
        <button onClick={onBack} style={{ position:"fixed", top:20, left:20, background:"none", border:"none", cursor:"pointer", color:B.textMid, fontFamily:f1, fontSize:14, fontWeight:600, display:"flex", alignItems:"center", gap:6, padding:"6px 10px", borderRadius:8 }}>
          ← Back
        </button>
      )}

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

          <button onClick={handleLogin} disabled={busy} style={{ ...btnP, width:"100%", marginTop:4, opacity:busy?.5:1 }}>
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
            <p style={{ color:B.textLight, margin:0, fontSize:14 }}>{inviteData ? "You've been invited — your access is pre-configured." : "Ask your administrator for the church code"}</p>
          </div>
          {inviteData?.hubs?.length > 0 && (
            <div style={{ background:B.tealPale, border:"1px solid "+B.teal, borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:13, color:B.teal }}>
              <strong style={{ fontFamily:f1 }}>Hub access included:</strong> {inviteData.hubs.join(', ')}
            </div>
          )}

          <button onClick={handleGoogle} disabled={busy} style={{ ...btnS, width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:20, padding:12 }}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Join with Google
          </button>
          <p style={{ fontSize:12, color:B.textLight, textAlign:"center", margin:"-12px 0 16px", lineHeight:1.5 }}>
            Trouble with Google? Some work or school (Google Workspace) accounts block third-party sign-in — just use the email &amp; password form below.
          </p>

          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
            <div style={{ flex:1, height:1, background:B.sand }}/><span style={{ fontSize:12, color:B.textLight, fontFamily:f1 }}>OR</span><div style={{ flex:1, height:1, background:B.sand }}/>
          </div>

          {/* S-12: Honeypot — hidden from real users; bots fill it in */}
          <input type="text" value={honeypot} onChange={e=>setHoneypot(e.target.value)} style={{ display:"none" }} tabIndex={-1} autoComplete="off" aria-hidden="true" />

          <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:12 }}>
            <FF label="First Name"><input style={inp} value={form.firstName} onChange={e=>u("firstName",e.target.value)} placeholder="John"/></FF>
            <FF label="Last Name"><input style={inp} value={form.lastName} onChange={e=>u("lastName",e.target.value)} placeholder="Smith"/></FF>
          </div>
          <FF label="Email"><input style={inp} type="email" value={form.email} onChange={e=>u("email",e.target.value)} placeholder="you@email.com"/></FF>
          <FF label="Password"><input style={inp} type="password" value={form.password} onChange={e=>u("password",e.target.value)} placeholder="At least 6 characters"/></FF>
          <FF label="Church Code"><input style={{...inp, fontFamily:"monospace", letterSpacing:2, textTransform:"uppercase"}} value={form.churchCode} onChange={e=>u("churchCode",e.target.value)} placeholder="e.g. FXCC"/></FF>
          {tosCheckbox}
          {error && <p style={{ color:B.red, fontSize:13, fontWeight:600, margin:"0 0 12px" }}>{error}</p>}
          <button onClick={handleRegister} disabled={busy||!form.firstName||!form.lastName||!form.email||!form.password||!form.churchCode||!agreedToTerms} style={{ ...btnP, width:"100%", opacity:(busy||!form.firstName||!form.lastName||!form.churchCode||!agreedToTerms)?.5:1 }}>
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
          {tosCheckbox}
          {error && <p style={{ color:B.red, fontSize:13, fontWeight:600, margin:"0 0 12px" }}>{error}</p>}
          <button onClick={handleGoogleRegister} disabled={busy||!form.churchCode||!agreedToTerms} style={{ ...btnP, width:"100%", opacity:(busy||!form.churchCode||!agreedToTerms)?.5:1 }}>
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
          {/* Honeypot — hidden from real users; bots fill it in */}
          <input type="text" value={honeypot} onChange={e=>setHoneypot(e.target.value)} style={{ display:"none" }} tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <FF label="Church Name"><input style={inp} value={form.churchName} onChange={e=>u("churchName",e.target.value)} placeholder="e.g. Fairfax Church of Christ"/></FF>
          <FF label="Church Code (your team will use this to join)"><input style={{...inp, fontFamily:"monospace", letterSpacing:2, textTransform:"uppercase"}} value={form.churchCode} onChange={e=>u("churchCode",e.target.value)} placeholder="e.g. FXCC-2026"/></FF>
          <div style={{ height:1, background:B.sand, margin:"8px 0 16px" }}/>
          <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:12 }}>
            <FF label="First Name"><input style={inp} value={form.firstName} onChange={e=>u("firstName",e.target.value)} placeholder="John"/></FF>
            <FF label="Last Name"><input style={inp} value={form.lastName} onChange={e=>u("lastName",e.target.value)} placeholder="Smith"/></FF>
          </div>
          <FF label="Email"><input style={inp} type="email" value={form.email} onChange={e=>u("email",e.target.value)} placeholder="you@church.org"/></FF>
          <FF label="Password"><input style={inp} type="password" value={form.password} onChange={e=>u("password",e.target.value)} placeholder="At least 6 characters"/></FF>
          {tosCheckbox}
          {error && <p style={{ color:B.red, fontSize:13, fontWeight:600, margin:"0 0 12px" }}>{error}</p>}
          <button onClick={handleCreateChurch} disabled={busy||!form.churchName||!form.churchCode||!form.firstName||!form.lastName||!form.email||!form.password||!agreedToTerms} style={{ ...btnP, width:"100%", opacity:(busy||!agreedToTerms)?.5:1 }}>
            {busy ? "Setting up..." : "Create Church & Account"}
          </button>
          <div style={{ textAlign:"center", marginTop:16 }}>
            <button onClick={()=>{setMode("login");setError(null);}} style={{ background:"none", border:"none", color:B.teal, fontWeight:600, cursor:"pointer", fontSize:13, fontFamily:f1 }}>Back to sign in</button>
          </div>
        </div>
      )}

      {/* Legal modal (Terms of Service / Privacy Policy) */}
      {showLegal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={()=>setShowLegal(null)}>
          <div style={{ background:B.white, borderRadius:16, maxWidth:560, width:"100%", maxHeight:"80vh", display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ padding:"20px 24px 16px", borderBottom:"1px solid "+B.sand, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <h2 style={{ fontFamily:f1, fontWeight:700, fontSize:18, color:B.navy, margin:0 }}>
                {showLegal === "terms" ? "Terms of Service" : "Privacy Policy"}
              </h2>
              <button onClick={()=>setShowLegal(null)} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:B.textLight, lineHeight:1 }}>×</button>
            </div>
            <div style={{ padding:"20px 24px", overflowY:"auto", color:B.textDark }}>
              {showLegal === "terms" ? <TermsBody /> : <PrivacyBody />}
            </div>
            <div style={{ padding:"16px 24px", borderTop:"1px solid "+B.sand }}>
              <button onClick={()=>{setAgreedToTerms(true);setShowLegal(null);}} style={{ ...btnP, width:"100%" }}>I Agree</button>
            </div>
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
  const { user, userProfile, profileMissing, loading: authLoading } = authHook;
  const [publicRequest] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const churchId = p.get('request');
    const cn = p.get('cn');
    return churchId ? { churchId, churchName: cn ? decodeURIComponent(cn) : '' } : null;
  });
  // ?jobs= (PublicJobsPage) is gated at main.jsx so anonymous teen traffic
  // never imports App.jsx or its authenticated-app dependencies.
  // Both clean paths (/privacy, /terms, /sms-program — via Vercel rewrites) and
  // the legacy query-param variants (?privacy, ?terms, ?sms-program) route to
  // the same pages. Pathname check is the primary; query-param is backward
  // compat for existing links shared before the rewrite was added.
  const _path = window.location.pathname.replace(/\/+$/, '');
  const _qs = new URLSearchParams(window.location.search);
  const [showHelp] = useState(() => _qs.get('help') !== null || _path === '/help');
  const [showPrivacy] = useState(() => _qs.get('privacy') !== null || _path === '/privacy');
  const [showTerms] = useState(() => _qs.get('terms') !== null || _path === '/terms');
  const [showSmsProgram] = useState(() => _qs.get('sms-program') !== null || _path === '/sms-program');
  const [showAuth, setShowAuth] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('signup') !== null || p.get('signin') !== null || p.get('invite') !== null;
  });
  const [authInitialMode, setAuthInitialMode] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('signin') !== null) return 'login';
    if (p.get('signup') !== null) return 'register';
    return 'login';
  });

  const handleGetStarted = (mode = 'register') => {
    setAuthInitialMode(mode);
    setShowAuth(true);
  };

  const pathname = window.location.pathname;
  if (pathname === '/blog') return <BlogIndex onGetStarted={handleGetStarted} />;
  if (pathname.startsWith('/blog/')) return <BlogPost slug={pathname.replace('/blog/', '')} onGetStarted={handleGetStarted} />;

  if (publicRequest) return <PublicRequestPage churchId={publicRequest.churchId} churchName={publicRequest.churchName} />;

  if (showHelp) return <HelpPage onBack={() => window.history.back()} />;
  if (showPrivacy) return <PrivacyPage />;
  if (showTerms) return <TermsPage />;
  if (showSmsProgram) return <PublicSMSProgramPage />;

  if (authLoading) return <Spinner />;

  // Authenticated but the Firestore user profile is missing — the stuck-signup
  // state Haleigh Watson reported on 2026-05-14. Show a recovery screen
  // instead of silently bouncing the user back to the login form.
  if (user && profileMissing) {
    return <ProfileMissingScreen authHook={authHook} />;
  }

  if (!user || !userProfile) {
    if (!showAuth) return <LandingPage onGetStarted={handleGetStarted} />;
    return <AuthScreen authHook={authHook} initialMode={authInitialMode} onBack={() => setShowAuth(false)} />;
  }

  return <AppShell authHook={authHook} />;
}

function ProfileMissingScreen({ authHook }) {
  const { user, logout, registerWithGoogle, error, setError } = authHook;
  const [recoverCode, setRecoverCode] = useState('');
  const [recovering, setRecovering] = useState(false);
  // Hubs from an invite captured earlier this tab session, if any (so a
  // recovered account keeps its intended hub access; null = inherit all).
  const savedHubs = (() => {
    try { const s = sessionStorage.getItem('coh_invite'); return s ? (JSON.parse(s).hubs ?? null) : null; }
    catch { return null; }
  })();
  const handleComplete = async () => {
    setError(null);
    setRecovering(true);
    // registerWithGoogle writes a profile for the CURRENT authed user (any
    // provider) — it's the same "attach church code → create profile" step the
    // normal flow uses, and it clears profileMissing on success so the app
    // proceeds. On a bad code it signs the user out (existing S-11 behavior).
    const res = await registerWithGoogle({ churchCode: recoverCode, allowedHubs: savedHubs });
    if (res?.success) { try { sessionStorage.removeItem('coh_invite'); } catch { /* ignore */ } }
    setRecovering(false);
  };
  const supportSubject = encodeURIComponent('ChurchOpsHub: account incomplete after signup');
  const supportBody = encodeURIComponent(
    `Hi — I'm having trouble signing into ChurchOpsHub. The app says my account is incomplete.\n\n` +
    `My email: ${user?.email || '(unknown)'}\n` +
    `Account created: ${user?.metadata?.creationTime || '(unknown)'}\n\n` +
    `Please help recover my account.`
  );
  return (
    <div style={{ fontFamily:f2, minHeight:'100vh', background:`linear-gradient(170deg, ${B.cream} 0%, ${B.warmGray} 100%)`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <div style={{ background:B.white, borderRadius:20, padding:'40px 36px', maxWidth:480, width:'92%', boxShadow:'0 8px 40px rgba(27,42,74,0.1)' }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}><Logo size={48}/></div>
          <h1 style={{ fontFamily:f1, fontSize:22, fontWeight:700, color:B.navy, margin:'0 0 8px' }}>Account incomplete</h1>
          <p style={{ color:B.textMid, fontSize:14, margin:0, lineHeight:1.6 }}>
            You're signed in, but we can't find your account data. This usually means signup didn't finish.
          </p>
        </div>
        <div style={{ background:B.cream, borderRadius:12, padding:'14px 18px', marginBottom:20, fontSize:13, color:B.textMid, lineHeight:1.6 }}>
          <div style={{ fontWeight:600, color:B.navy, fontFamily:f1, marginBottom:4 }}>Signed in as</div>
          <div style={{ wordBreak:'break-all' }}>{user?.email || '(no email)'}</div>
        </div>
        <p style={{ fontSize:13, color:B.textMid, lineHeight:1.6, marginBottom:12 }}>
          Finish setting up your account — enter your church code below:
        </p>
        <FF label="Church Code">
          <input
            style={{ ...inp, fontFamily:'monospace', letterSpacing:2, textTransform:'uppercase' }}
            value={recoverCode}
            onChange={e=>{ setRecoverCode(e.target.value); setError(null); }}
            onKeyDown={e=>e.key==='Enter'&&recoverCode&&!recovering&&handleComplete()}
            placeholder="e.g. FXCC"
          />
        </FF>
        {error && <p style={{ color:B.red, fontSize:13, fontWeight:600, margin:'0 0 12px' }}>{error}</p>}
        <button onClick={handleComplete} disabled={recovering||!recoverCode} style={{ ...btnP, width:'100%', marginBottom:16, opacity:(recovering||!recoverCode)?.5:1 }}>
          {recovering ? 'Completing…' : 'Complete registration'}
        </button>
        <p style={{ fontSize:13, color:B.textMid, lineHeight:1.6, marginBottom:20 }}>
          Still stuck? Email <a href={`mailto:churchopshub@gmail.com?subject=${supportSubject}&body=${supportBody}`} style={{ color:B.teal, fontWeight:600 }}>churchopshub@gmail.com</a> and we'll restore your account, usually within a few hours.
        </p>
        <button onClick={logout} style={{ ...btnS, width:'100%' }}>Sign out</button>
      </div>
    </div>
  );
}

function AppShell({ authHook }) {
  const { user, userProfile, logout, resendVerification, deleteAccount } = authHook;
  const [verifyBannerDismissed, setVerifyBannerDismissed] = useState(false);
  const [resentVerify, setResentVerify] = useState(false);
  const store = useFirestore(userProfile.churchId);
  const { subscription, loading: subscriptionLoading, hasHub, canAddUser, trialDaysRemaining } = useSubscription(userProfile.churchId);
  const [trialBannerDismissed, setTrialBannerDismissed] = useState(false);
  const [tab, setTab] = useState(() => {
    if (new URLSearchParams(window.location.search).get('item')) return 'inventory';
    const stored = localStorage.getItem('lastTab');
    if (stored) return stored;
    // Volunteers (role:user with allowedHubs=['jobs']) land on Hubs, which
    // auto-routes into Jobs Hub via HubsPage. Everyone else gets Dashboard.
    return isVolunteerOnly(userProfile) ? 'hubs' : 'dashboard';
  });
  const [hubKey, setHubKey] = useState(() => localStorage.getItem('lastHub') || null);
  const [jobsInitialView, setJobsInitialView] = useState(null);
  useEffect(() => { localStorage.setItem('lastTab', tab); }, [tab]);
  const [menuOpen, setMenuOpen] = useState(false);
  const accountTriggerRef = useRef(null);
  const accountMenuRef = useRef(null);
  const accountMenuId = useId();
  const isMobile = useWindowWidth() < 768;

  // Audit 2026-05-24 Phase 3 (item 3): account menu a11y — focus the first
  // menu item on open, trap Tab/Shift+Tab inside, close on Escape, and
  // restore focus to the trigger on close. Mirrors the Modal primitive's
  // contract so screen-reader users get the same affordance.
  useEffect(() => {
    if (!menuOpen) return;
    const FOCUSABLE_SEL = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const t = setTimeout(() => {
      const first = accountMenuRef.current?.querySelector(FOCUSABLE_SEL);
      first?.focus?.();
    }, 0);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        accountTriggerRef.current?.focus?.();
        return;
      }
      if (e.key !== 'Tab' || !accountMenuRef.current) return;
      const focusable = Array.from(accountMenuRef.current.querySelectorAll(FOCUSABLE_SEL))
        .filter(el => el.offsetParent !== null);
      if (focusable.length === 0) { e.preventDefault(); return; }
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!accountMenuRef.current.contains(active)) {
        e.preventDefault();
        firstEl.focus();
      } else if (e.shiftKey && active === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [menuOpen]);
  const [initialItemId] = useState(() => new URLSearchParams(window.location.search).get('item'));
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedItemId, setScannedItemId] = useState(null);

  useEffect(() => {
    if (initialItemId) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Auto-clear store errors after 10 seconds
  useEffect(() => {
    if (!store.error) return;
    const t = setTimeout(() => store.clearError(), 10000);
    return () => clearTimeout(t);
  }, [store.error]);

  // Auto-link accessPerson by email when user logs in
  useEffect(() => {
    if (!userProfile?.email || !store.accessPeople?.length) return;
    const email = userProfile.email.toLowerCase();
    const unlinked = store.accessPeople.filter(p => p.active && !p.userId && p.email?.toLowerCase() === email);
    unlinked.forEach(p => store.linkAccessPerson(p._docId, userProfile.uid));
  }, [userProfile?.uid, store.accessPeople]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show onboarding for new admins with no items yet
  useEffect(() => {
    if (!store.loading && userProfile.role === 'admin' && !store.config?.onboardingComplete && store.items.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowOnboarding(true);
    }
  }, [store.loading, store.config?.onboardingComplete, store.items.length]);

  if (store.loading) return <Spinner />;

  function dismissOnboarding(goToTab) {
    store.updateConfig({ onboardingComplete: true });
    setShowOnboarding(false);
    if (goToTab) setTab(goToTab);
  }

  function handleScan(text) {
    let itemId = text.trim();
    try { const u = new URL(text); const p = u.searchParams.get('item'); if (p) itemId = p; } catch { /* URL parse failed — use raw text as itemId */ }
    setScannedItemId(itemId);
    setShowScanner(false);
    setTab('inventory');
  }

  const tabBtn = (k) => ({
    padding:"10px 18px", borderRadius:10, border:"none", cursor:"pointer",
    fontSize:13, fontWeight:600, fontFamily:f1, letterSpacing:.2,
    transition:"all 0.2s", whiteSpace:"nowrap",
    background: tab===k ? "rgba(42,125,110,0.18)" : "transparent",
    // Inactive tab bumped 0.45 → 0.6 for WCAG-AA on navy (Layer 1 a11y pass).
    color: tab===k ? B.white : "rgba(255,255,255,0.6)",
  });

  const lowStock = (store.supplies || []).filter(c => c.quantity <= c.minQuantity);
  const pendingRes = (store.reservations || []).filter(r => r.status === RES_STATUS.PENDING);

  // Per-user hub visibility: admins see all; others filtered by allowedHubs
  // people_access is manager+ only — regular users cannot see it regardless of allowedHubs
  function userCanSeeHub(hubName) {
    if (!hasHub(hubName)) return false;
    if (userProfile?.role === 'admin') return true;
    if (hubName === 'people_access' && userProfile?.role === 'user') return false;
    const allowed = userProfile?.allowedHubs;
    if (allowed == null) return true;
    return allowed.includes(hubName);
  }

  function openHub(key) {
    if (key) localStorage.setItem('lastHub', key);
    else localStorage.removeItem('lastHub');
    setHubKey(key);
  }

  // Mobile bottom nav + desktop tabs. Volunteers (role:user, allowedHubs=['jobs'])
  // get a 4-tab jobs-first shell; everyone else gets the standard 7-tab admin shell.
  // The "Hubs" key stays the same — for volunteers it just auto-routes into Jobs.
  const volunteerMode = isVolunteerOnly(userProfile);
  const mobileTabs = volunteerMode
    ? [["dashboard","Home","🏠"], ["hubs","Jobs","💼"], ["log","Activity","📋"], ["settings","Settings","⚙️"]]
    : [["dashboard","Home","🏠"], ["inventory","Items","📦"], ["supplies","Stock","🧴"], ["reservations","Reserve","📅"], ["log","Log","📋"], ["hubs","Hubs","🔌"], ["settings","Settings","⚙️"]];
  const desktopTabs = volunteerMode
    ? [["dashboard","Home"], ["hubs","Jobs"], ["log","Activity"], ["settings","Settings"]]
    : [["dashboard","Dashboard"], ["inventory","All Items"], ["supplies","Supplies"], ["reservations","Reservations"], ["log","Activity Log"], ["hubs","Hubs"], ["settings","Settings"]];

  const canAdd = canAddUser((store.users || []).length);

  return (
    <MobileCtx.Provider value={isMobile}>
    <div style={{ fontFamily:f2, background:`linear-gradient(170deg, ${B.cream} 0%, ${B.warmGray} 100%)`, minHeight:"100vh", color:B.textDark }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet"/>

      {/* ═══ HEADER ═══ */}
      <div style={{ background:`linear-gradient(135deg, ${B.navy} 0%, ${B.navyLight} 60%, #2C4066 100%)`, padding:isMobile?"14px 16px 14px":"18px 28px 14px", color:B.white, position:"relative" }}>
        <div style={{ position:"absolute", inset:0, opacity:0.04, backgroundImage:"radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize:"24px 24px", overflow:"hidden", pointerEvents:"none" }}/>
        <div style={{ maxWidth:1100, margin:"0 auto", position:"relative" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
            <FullLogo size={36} light={true} />
            <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
              <button onClick={() => setShowScanner(true)} aria-label="Scan barcode or QR code" style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(255,255,255,0.08)", borderRadius:10, padding:"7px 12px", border:"1px solid rgba(255,255,255,0.1)", cursor:"pointer", color:B.white, fontFamily:f1, fontSize:13, fontWeight:600 }}>
                📷 Scan
              </button>
              <div style={{ position:"relative" }}>
                <button ref={accountTriggerRef} onClick={()=>setMenuOpen(!menuOpen)} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={accountMenuId} style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.08)", borderRadius:10, padding:"7px 14px", border:"1px solid rgba(255,255,255,0.1)", cursor:"pointer", color:B.white }}>
                  <div style={{ width:30, height:30, borderRadius:8, background:B.teal, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, fontFamily:f1 }}>{(userProfile.name||"?")[0]}</div>
                  <span style={{ fontSize:13, fontWeight:600, fontFamily:f1 }}>{userProfile.name}</span>
                  <span style={{ fontSize:10, opacity:.5 }} aria-hidden="true">▾</span>
                </button>
                {menuOpen && (
                  <div ref={accountMenuRef} id={accountMenuId} role="menu" aria-label="Account menu" style={{ position:"absolute", top:"100%", right:0, marginTop:6, background:B.white, borderRadius:12, padding:8, minWidth:180, boxShadow:"0 8px 32px rgba(27,42,74,0.2)", zIndex:100 }}>
                    <div style={{ padding:"8px 12px", fontSize:12, color:B.textLight }}>{userProfile.email}</div>
                    <div style={{ padding:"4px 12px", marginBottom:4 }}><span style={{ padding:"2px 8px", borderRadius:12, fontSize:11, fontWeight:600, fontFamily:f1, background:userProfile.role==="admin"?B.goldLight:userProfile.role==="manager"?"#EDF2FF":B.tealPale, color:userProfile.role==="admin"?"#96750E":userProfile.role==="manager"?"#3730A3":B.teal }}>{userProfile.role}</span></div>
                    <div style={{ height:1, background:B.sand, margin:"4px 0" }}/>
                    <button role="menuitem" onClick={()=>{logout();setMenuOpen(false);}} style={{ width:"100%", textAlign:"left", padding:"8px 12px", background:"none", border:"none", cursor:"pointer", color:B.red, fontSize:13, fontWeight:600, fontFamily:f1, borderRadius:6 }}
                      onMouseEnter={e=>e.currentTarget.style.background=B.redPale}
                      onMouseLeave={e=>e.currentTarget.style.background="none"}>
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabs — desktop only. Audit 2026-05-24 Phase 3: at tablet widths
              (768–1100px) the 7 tabs can overflow the 1100px max-width
              container. `scrollSnapType: x mandatory` makes the row scroll
              tab-by-tab so users land on a full button, and `maskImage`
              fades the right edge to hint there's more off-screen. */}
          {!isMobile && <div style={{ display:"flex", gap:2, marginTop:16, marginBottom:-14, overflowX:"auto", scrollSnapType:"x mandatory", scrollbarWidth:"none", WebkitMaskImage:"linear-gradient(90deg, #000 0, #000 calc(100% - 24px), transparent 100%)", maskImage:"linear-gradient(90deg, #000 0, #000 calc(100% - 24px), transparent 100%)" }}>
            {desktopTabs.map(([k,v]) =>
              <button key={k} onClick={()=>{
                if(k==="hubs"&&tab==="hubs"){openHub(null);}
                else{setTab(k);}
                setMenuOpen(false);
              }} style={{ ...tabBtn(k), scrollSnapAlign:"start", flexShrink:0 }}>{v}
                {k==="supplies"&&lowStock.length>0&&<span style={{ marginLeft:6, background:B.red, color:"#fff", borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 }}>{lowStock.length}</span>}
                {k==="reservations"&&pendingRes.length>0&&<span style={{ marginLeft:6, background:B.gold, color:"#fff", borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 }}>{pendingRes.length}</span>}
              </button>
            )}
          </div>}
        </div>
      </div>

      {/* Accent bar */}
      <div style={{ height:3, background:`linear-gradient(90deg, ${B.teal}, ${B.gold})` }}/>

      {/* Trial banner */}
      {subscription?.freeHubsSelected === null && subscription?.trialEndsAt && !trialBannerDismissed && (() => {
        const days = trialDaysRemaining();
        if (days <= 0) return null;
        const urgent = days <= 7;
        return (
          <div style={{ background: urgent ? '#FFF1F2' : '#F0FDF4', borderBottom: `1px solid ${urgent ? '#FECACA' : '#BBF7D0'}`, padding:'10px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
            <span style={{ fontSize:13, color: urgent ? '#B91C1C' : '#166534', fontFamily:f1 }}>
              {urgent
                ? `Your free trial ends in ${days} day${days !== 1 ? 's' : ''} — upgrade to keep your hubs.`
                : `Free trial active — all hubs unlocked for ${days} more day${days !== 1 ? 's' : ''}.`}
            </span>
            <div style={{ display:'flex', gap:10, alignItems:'center', flexShrink:0 }}>
              {urgent && (
                <button onClick={() => setTab('settings')} style={{ background:'none', border:'none', color:'#B91C1C', fontWeight:700, cursor:'pointer', fontSize:13, fontFamily:f1, textDecoration:'underline' }}>
                  Upgrade now
                </button>
              )}
              <button onClick={() => setTrialBannerDismissed(true)} aria-label="Dismiss trial banner" style={{ background:'none', border:'none', color: urgent ? '#96101A' : '#166534', cursor:'pointer', fontSize:18, lineHeight:1, fontFamily:f1 }}>×</button>
            </div>
          </div>
        );
      })()}

      {/* Email verification banner */}
      {!user.emailVerified && !verifyBannerDismissed && (
        <div style={{ background:B.goldLight, borderBottom:"1px solid "+B.gold, padding:"10px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
          <span style={{ fontSize:13, color:"#7A5800", fontFamily:f1 }}>
            Please verify your email address. Check your inbox for a verification link.
          </span>
          <div style={{ display:"flex", gap:10, alignItems:"center", flexShrink:0 }}>
            <button onClick={async () => { await resendVerification(); setResentVerify(true); setTimeout(() => setResentVerify(false), 4000); }}
              style={{ background:"none", border:"none", color:"#7A5800", fontWeight:700, cursor:"pointer", fontSize:13, fontFamily:f1, textDecoration:"underline" }}>
              {resentVerify ? "Sent!" : "Resend"}
            </button>
            <button onClick={() => setVerifyBannerDismissed(true)}
              style={{ background:"none", border:"none", color:"#96750E", cursor:"pointer", fontSize:18, lineHeight:1, fontFamily:f1 }}>×</button>
          </div>
        </div>
      )}

      {/* Page content */}
      <PageErrorBoundary key={tab}>
      <div style={{ maxWidth:1100, margin:"0 auto", padding:isMobile?"16px 14px 96px":"28px 28px 60px" }} onClick={()=>menuOpen&&setMenuOpen(false)}>
        {tab === "dashboard" && (isVolunteerOnly(userProfile)
          ? <VolunteerHome store={store} userProfile={userProfile} onOpenJobs={(view) => { setJobsInitialView(view || null); openHub('jobs'); setTab('hubs'); }} />
          : <Dashboard store={store} userProfile={userProfile} canSeeJobHub={userCanSeeHub('jobs')} />)}
        {tab === "settings" && <SettingsPage store={store} userProfile={userProfile} subscription={subscription} user={user} canAdd={canAdd} deleteAccount={deleteAccount} />}
        {tab === "inventory" && <ItemsPage store={store} userProfile={userProfile} initialItemId={initialItemId} scannedItemId={scannedItemId} onScannedItemConsumed={() => setScannedItemId(null)} />}
        {tab === "supplies" && <SuppliesPage store={store} userProfile={userProfile} />}
        {tab === "reservations" && <ReservationsPage store={store} userProfile={userProfile} />}
        {tab === "log" && <ActivityLogPage store={store} userProfile={userProfile} />}
        {tab === "hubs" && (
          <HubsPage
            store={store}
            userProfile={userProfile}
            hubKey={hubKey}
            onOpenHub={openHub}
            hasHub={hasHub}
            subscriptionLoading={subscriptionLoading}
            userCanSeeHub={userCanSeeHub}
            onGoToSettings={() => setTab('settings')}
            jobsInitialView={jobsInitialView}
          />
        )}
      </div>
      </PageErrorBoundary>

      {/* Error toast */}
      {store.error && (
        <div style={{ position:"fixed", bottom: isMobile ? "calc(96px + env(safe-area-inset-bottom, 0px))" : 24, left:"50%", transform:"translateX(-50%)", zIndex:300, background:"#1E1E1E", color:"#fff", borderRadius:12, padding:"12px 20px", display:"flex", alignItems:"center", gap:14, boxShadow:"0 4px 20px rgba(0,0,0,0.3)", maxWidth:"90vw", minWidth:280 }}>
          <span style={{ fontSize:16 }} aria-hidden="true">⚠️</span>
          <span style={{ fontSize:13, fontFamily:f1, fontWeight:500, flex:1 }}>{store.error}</span>
          <button onClick={() => store.clearError()} aria-label="Dismiss error" style={{ background:"none", border:"none", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:20, lineHeight:1, padding:"6px 10px" }}>×</button>
        </div>
      )}

      {/* Footer — desktop only */}
      {!isMobile && (
        <div style={{ background:B.navy, padding:"24px 28px", textAlign:"center" }}>
          <FullLogo size={26} light={true} />
          {/* Bumped from rgba 0.25 → 0.6 for WCAG-AA contrast on navy
              (Layer 1 a11y pass, 2026-05-25). Previous values were
              2.22:1 (text) and 4.1:1 (links) — both below 4.5:1. */}
          <p style={{ color:"rgba(255,255,255,0.6)", fontSize:11, fontFamily:f1, marginTop:10 }}>churchopshub.com</p>
          <div style={{ display:"flex", gap:16, justifyContent:"center", alignItems:"center" }}>
            <a href="?help" style={{ color:"rgba(255,255,255,0.6)", fontSize:11, fontFamily:f1, textDecoration:"none" }}>Help Center</a>
            <span style={{ color:"rgba(255,255,255,0.3)", fontSize:11 }}>·</span>
            <a href="/blog" style={{ color:"rgba(255,255,255,0.6)", fontSize:11, fontFamily:f1, textDecoration:"none" }}>Blog</a>
          </div>
        </div>
      )}

      {/* Mobile Bottom Nav — H-3 from the 2026-05-12 audit: previously
          each tab was `flex: 0 0 64px` which made the bar 448px wide and
          overflow-scroll on any iPhone narrower than that — Hubs and Settings
          slid off-screen on iPhone SE / 12 mini (320-375px) and teens never
          discovered the Jobs Hub. Now `flex: 1` so all 7 tabs share the width
          evenly and the row always fits the viewport. */}
      {isMobile && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:200, background:B.white, borderTop:"1px solid "+B.sand, display:"flex", paddingBottom:"env(safe-area-inset-bottom, 0px)" }}>
          {mobileTabs.map(([k,label,icon]) => (
            <button key={k} onClick={()=>{
              if(k==="hubs"&&tab==="hubs"){openHub(null);}
              else{setTab(k);}
              setMenuOpen(false);
            }}
              style={{ flex:"1 1 0", minWidth:0, padding:"8px 2px 6px", border:"none", background:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2, color:tab===k?B.teal:B.textLight, position:"relative" }}>
              <span style={{ fontSize:20 }} aria-hidden="true">{icon}</span>
              <span style={{ fontSize:10, fontWeight:700, fontFamily:f1, letterSpacing:.3 }}>{label}</span>
              {k==="supplies"&&lowStock.length>0&&<span style={{ position:"absolute", top:4, right:"calc(50% - 16px)", background:B.red, color:"#fff", borderRadius:10, padding:"0 4px", fontSize:9, fontWeight:700, minWidth:14, textAlign:"center" }}>{lowStock.length}</span>}
              {k==="reservations"&&pendingRes.length>0&&<span style={{ position:"absolute", top:4, right:"calc(50% - 16px)", background:B.gold, color:"#fff", borderRadius:10, padding:"0 4px", fontSize:9, fontWeight:700, minWidth:14, textAlign:"center" }}>{pendingRes.length}</span>}
            </button>
          ))}
        </div>
      )}
      {/* Onboarding modal — new admins, no items yet */}
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      {showOnboarding && (() => {
        const steps = [
          {
            title: "Welcome to ChurchOpsHub!",
            icon: "🎉",
            body: (
              <>
                <p style={{ margin:"0 0 12px" }}>You've set up your church — great first step. This quick walkthrough will help you get your inventory up and running in minutes.</p>
                <p style={{ margin:0 }}>ChurchOpsHub keeps track of all your equipment, supplies, and who has what — so nothing gets lost and everyone stays on the same page.</p>
              </>
            ),
            primaryLabel: "Let's go →",
            primaryAction: () => setOnboardingStep(1),
            skipLabel: "Skip for now",
          },
          {
            title: "Step 1 — Set Up Locations & Ministries",
            icon: "⚙️",
            body: (
              <>
                <p style={{ margin:"0 0 12px" }}>Before adding items, it helps to have your church's <strong>locations</strong> (e.g. Sanctuary, Youth Room, Sound Booth) and <strong>ministries</strong> (e.g. Worship, Kids, Media) set up so you can organize everything from the start.</p>
                <p style={{ margin:"0 0 12px" }}>We've added some common defaults — just remove or rename what doesn't apply to you.</p>
                <div style={{ background:B.tealPale, borderRadius:10, padding:"10px 14px", fontSize:13, color:B.teal, fontFamily:f1, fontWeight:600 }}>
                  Go to <strong>Settings → Locations</strong> and <strong>Settings → Ministries</strong> to customize your lists.
                </div>
              </>
            ),
            primaryLabel: "Go to Settings",
            primaryAction: () => dismissOnboarding("settings"),
            secondaryLabel: "Next →",
            secondaryAction: () => setOnboardingStep(2),
            skipLabel: "Skip for now",
          },
          {
            title: "Step 2 — Add Your First Item",
            icon: "📦",
            body: (
              <>
                <p style={{ margin:"0 0 12px" }}>Now you're ready to add inventory. Each item gets an ID, a name, a location, and a status. You can also attach photos, financial details, and QR codes for quick lookups.</p>
                <p style={{ margin:"0 0 12px" }}>Start with your most-used or highest-value equipment first — you can always add more later.</p>
                <div style={{ background:B.tealPale, borderRadius:10, padding:"10px 14px", fontSize:13, color:B.teal, fontFamily:f1, fontWeight:600 }}>
                  Click <strong>"+ Add Item"</strong> on the All Items page to get started.
                </div>
              </>
            ),
            primaryLabel: "Go to All Items",
            primaryAction: () => dismissOnboarding("inventory"),
            secondaryLabel: "← Back",
            secondaryAction: () => setOnboardingStep(1),
            skipLabel: "Done",
          },
        ];
        const step = steps[onboardingStep];
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:400, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
            <div style={{ background:B.white, borderRadius:20, maxWidth:480, width:"100%", boxShadow:"0 20px 60px rgba(27,42,74,0.25)", overflow:"hidden" }}>
              {/* Progress dots */}
              <div style={{ background:`linear-gradient(135deg, ${B.navy}, ${B.navyLight})`, padding:"20px 24px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:28 }}>{step.icon}</span>
                <div style={{ display:"flex", gap:6 }}>
                  {steps.map((_, i) => (
                    <div key={i} style={{ width:8, height:8, borderRadius:4, background: i === onboardingStep ? B.white : "rgba(255,255,255,0.3)", transition:"background .2s" }} />
                  ))}
                </div>
              </div>
              <div style={{ padding:"24px 28px" }}>
                <h2 style={{ fontFamily:f1, fontWeight:700, fontSize:20, color:B.navy, margin:"0 0 16px" }}>{step.title}</h2>
                <div style={{ fontSize:14, color:B.textDark, lineHeight:1.65 }}>{step.body}</div>
              </div>
              <div style={{ padding:"0 28px 24px", display:"flex", flexDirection:"column", gap:10 }}>
                <button onClick={step.primaryAction} style={{ ...btnP, width:"100%" }}>{step.primaryLabel}</button>
                {step.secondaryLabel && (
                  <button onClick={step.secondaryAction} style={{ ...btnS, width:"100%" }}>{step.secondaryLabel}</button>
                )}
                <button onClick={() => dismissOnboarding(null)} style={{ background:"none", border:"none", color:B.textLight, fontSize:13, cursor:"pointer", fontFamily:f1, padding:"4px 0" }}>{step.skipLabel}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
    </MobileCtx.Provider>
  );
}
