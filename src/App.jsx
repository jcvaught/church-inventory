import { useState, useEffect, Component } from 'react';
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
import { ItemsPage } from './pages/ItemsPage.jsx';
import { SuppliesPage } from './pages/SuppliesPage.jsx';
import { ReservationsPage } from './pages/ReservationsPage.jsx';
import { ActivityLogPage } from './pages/ActivityLogPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { BarcodeScanner } from './components/primitives/BarcodeScanner.jsx';
import { HelpPage } from './pages/HelpPage.jsx';
import { BlogIndex } from './pages/BlogIndex.jsx';
import { BlogPost } from './pages/BlogPost.jsx';
import { RES_STATUS } from './utils/constants.js';


class PageErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
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
  const [inviteData] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const code = p.get('invite');
    if (!code) return null;
    const hubs = p.get('hubs');
    window.history.replaceState({}, '', window.location.pathname);
    return { code: code.toUpperCase(), hubs: hubs != null ? hubs.split(',').filter(Boolean) : null };
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
        <button type="button" onClick={()=>setShowLegal("terms")} style={{ background:"none", border:"none", color:B.teal, fontWeight:600, cursor:"pointer", fontSize:13, padding:0, fontFamily:f2 }}>Terms of Service</button>
        {" "}and{" "}
        <button type="button" onClick={()=>setShowLegal("privacy")} style={{ background:"none", border:"none", color:B.teal, fontWeight:600, cursor:"pointer", fontSize:13, padding:0, fontFamily:f2 }}>Privacy Policy</button>
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
    e?.preventDefault(); setBusy(true);
    await register({ firstName:form.firstName, lastName:form.lastName, email:form.email, password:form.password, churchCode:form.churchCode });
    setBusy(false);
  }
  async function handleGoogleRegister(e) {
    e?.preventDefault(); setBusy(true);
    await registerWithGoogle({ churchCode:form.churchCode });
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

          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
            <div style={{ flex:1, height:1, background:B.sand }}/><span style={{ fontSize:12, color:B.textLight, fontFamily:f1 }}>OR</span><div style={{ flex:1, height:1, background:B.sand }}/>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
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
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
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
            <div style={{ padding:"20px 24px", overflowY:"auto", fontSize:13, color:B.textDark, lineHeight:1.7 }}>
              {showLegal === "terms" ? (
                <>
                  <p style={{ color:B.textLight, fontSize:12, marginTop:0 }}>Last updated: March 14, 2026</p>

                  <h3 style={{ fontFamily:f1, color:B.navy, marginTop:0 }}>1. Acceptance of Terms</h3>
                  <p>By creating an account or using ChurchOpsHub ("the Service," "we," "us," or "our"), you ("you" or "User") agree to be bound by these Terms of Service ("Terms"). If you are accepting on behalf of a church or organization, you represent that you have authority to bind that organization. If you do not agree, do not use the Service.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>2. Description of Service</h3>
                  <p>ChurchOpsHub is a cloud-based inventory and operations management platform designed for churches and religious organizations. Features include equipment tracking, supply management, reservations, maintenance ticketing, team management, and reporting. The Service is provided on a subscription basis with a free tier and optional paid hubs.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>3. Eligibility</h3>
                  <p>You must be at least 18 years old and capable of entering a binding contract to use the Service. The Service is intended for use by churches, religious nonprofits, and their authorized staff. By registering, you confirm that you meet these requirements.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>4. Account Registration & Security</h3>
                  <p>You agree to provide accurate, current, and complete information during registration. Each church organization may create one account. You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. Notify us immediately at <a href="mailto:churchopshub@gmail.com" style={{ color:B.teal }}>churchopshub@gmail.com</a> if you suspect unauthorized access. We are not liable for losses resulting from unauthorized use of your account.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>5. Subscriptions & Payment</h3>
                  <p>The Service offers a free base tier and optional paid hubs billed on a monthly subscription basis. Paid subscriptions are processed through Stripe. By subscribing, you authorize us to charge your payment method on a recurring basis. Subscriptions renew automatically unless cancelled before the renewal date. We reserve the right to change pricing with at least 30 days' notice to active subscribers. Refunds are not provided for partial billing periods, but we will work with you in good faith if exceptional circumstances arise. Contact us at <a href="mailto:churchopshub@gmail.com" style={{ color:B.teal }}>churchopshub@gmail.com</a> with billing questions.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>6. Your Data & License</h3>
                  <p>You retain full ownership of all data, content, and information you submit to the Service ("Your Data"). By using the Service, you grant us a limited, non-exclusive license to store, process, and display Your Data solely to provide the Service to you. We do not claim any other rights to Your Data. We do not sell, rent, or use Your Data for advertising or marketing purposes.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>7. Acceptable Use</h3>
                  <p>You agree not to: (a) use the Service for any unlawful purpose; (b) attempt to gain unauthorized access to other accounts or systems; (c) upload malicious code, viruses, or harmful content; (d) interfere with the Service's operation or other users' access; (e) reverse engineer, decompile, or attempt to extract source code from the Service; (f) resell or sublicense the Service without written permission. We reserve the right to investigate suspected violations and suspend accounts accordingly.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>8. Intellectual Property</h3>
                  <p>The Service, including its design, software, brand, and content (excluding Your Data), is owned by or licensed to ChurchOpsHub and protected by applicable intellectual property laws. These Terms do not grant you any rights to our trademarks, logos, or proprietary technology. All rights not expressly granted are reserved.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>9. Third-Party Services</h3>
                  <p>The Service relies on third-party providers including Google Firebase (data storage and authentication), Stripe (payment processing), Sentry (error monitoring), and EmailJS (email notifications). Your use of the Service is subject to those providers' terms and privacy policies. We are not responsible for the acts or omissions of third-party providers.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>10. Disclaimers</h3>
                  <p>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. We do not warrant that the Service will be uninterrupted, error-free, or completely secure. Use of the Service is at your own risk.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>11. Limitation of Liability</h3>
                  <p>TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, CHURCHOPSHUB AND ITS OPERATORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF DATA, LOSS OF PROFITS, OR BUSINESS INTERRUPTION, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL LIABILITY TO YOU SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID TO US IN THE 12 MONTHS PRECEDING THE CLAIM OR (B) $100.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>12. Indemnification</h3>
                  <p>You agree to indemnify, defend, and hold harmless ChurchOpsHub and its operators from and against any claims, damages, losses, or expenses (including reasonable attorneys' fees) arising out of or related to: (a) your use of the Service; (b) Your Data; (c) your violation of these Terms; or (d) your violation of any third party's rights.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>13. Termination</h3>
                  <p>We may suspend or terminate your account at any time for violation of these Terms, non-payment, or for any other reason with reasonable notice. Upon termination, your right to use the Service ceases immediately. You may cancel your account at any time by contacting us. We will retain Your Data for 30 days after termination to allow for export, then delete it permanently. Provisions that by their nature should survive termination (including Sections 6, 8, 10, 11, 12, and 15) shall survive.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>14. Changes to These Terms</h3>
                  <p>We may update these Terms from time to time. We will notify active users of material changes via email at least 14 days before the new terms take effect. Continued use of the Service after the effective date constitutes acceptance of the revised Terms. If you do not agree to the changes, you may cancel your account before the effective date.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>15. Governing Law & Disputes</h3>
                  <p>These Terms are governed by the laws of the Commonwealth of Virginia, without regard to conflict of law principles. Any dispute arising from these Terms or your use of the Service shall first be addressed through good-faith negotiation. If unresolved, disputes shall be submitted to binding arbitration under the rules of the American Arbitration Association, conducted in Fairfax County, Virginia. Notwithstanding the foregoing, either party may seek injunctive or equitable relief in a court of competent jurisdiction. YOU WAIVE ANY RIGHT TO A JURY TRIAL OR CLASS ACTION PROCEEDING.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>16. Contact</h3>
                  <p>Questions about these Terms? Contact us at <a href="mailto:churchopshub@gmail.com" style={{ color:B.teal }}>churchopshub@gmail.com</a>.</p>
                </>
              ) : (
                <>
                  <p style={{ color:B.textLight, fontSize:12, marginTop:0 }}>Last updated: March 14, 2026</p>

                  <h3 style={{ fontFamily:f1, color:B.navy, marginTop:0 }}>1. Who We Are</h3>
                  <p>ChurchOpsHub ("we," "us," or "our") is a software service for churches and religious organizations. This Privacy Policy explains how we collect, use, and protect information when you use our Service at churchopshub.com. By using the Service, you agree to the practices described here.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>2. Information We Collect</h3>
                  <p><strong>Information you provide:</strong> Name, email address, and password when you register. Church name and church code when creating an organization. Inventory records, equipment details, supply quantities, reservations, maintenance notes, and other operational data you enter. Profile information you choose to add.</p>
                  <p><strong>Information collected automatically:</strong> Error reports and crash data (collected via Sentry) when the application encounters a problem. Basic usage information such as which features are used. We do not use analytics services that track you across other websites.</p>
                  <p><strong>Payment information:</strong> If you subscribe to a paid plan, payment is processed by Stripe. We do not store your credit card number or full payment details — Stripe handles this directly and provides us only with a subscription status and customer identifier.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>3. How We Use Your Information</h3>
                  <p>We use your information to: provide and operate the Service; authenticate your identity and maintain your session; send transactional emails (account confirmation, password reset, reservation notifications); diagnose errors and improve reliability; communicate with you about your account or changes to the Service; and comply with legal obligations. We do not use your data for advertising, and we do not sell or rent your information to third parties.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>4. Data Ownership & Isolation</h3>
                  <p>You retain full ownership of all data you enter. Each church's data is strictly isolated in our database — enforced at the security rule level, not just by application logic. Members of one church organization cannot access another church's data. We access your data only as necessary to provide the Service or respond to a support request you initiate.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>5. Third-Party Service Providers</h3>
                  <p>We use the following sub-processors who may handle your data as part of delivering the Service:</p>
                  <ul style={{ paddingLeft:20, margin:"8px 0" }}>
                    <li><strong>Google Firebase</strong> — database (Firestore), authentication, and file storage. Data is stored in US-based Google Cloud regions. <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer" style={{ color:B.teal }}>Firebase Privacy</a></li>
                    <li><strong>Stripe</strong> — payment processing. Only contacted when you subscribe to a paid plan. <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color:B.teal }}>Stripe Privacy</a></li>
                    <li><strong>Sentry</strong> — error monitoring. Receives error messages and stack traces when the app crashes. We configure Sentry to avoid including sensitive inventory content in error reports. <a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer" style={{ color:B.teal }}>Sentry Privacy</a></li>
                    <li><strong>EmailJS</strong> — optional email notifications for reservation approvals/denials. Only used if your church administrator enables and configures this feature using your own EmailJS account. <a href="https://www.emailjs.com/legal/privacy-policy/" target="_blank" rel="noopener noreferrer" style={{ color:B.teal }}>EmailJS Privacy</a></li>
                    <li><strong>Google Fonts</strong> — font files loaded from Google's servers on page load. Google may collect basic request data per their standard CDN policies.</li>
                  </ul>
                  <p>We do not share your data with any other third parties except as required by law.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>6. Data Storage & Security</h3>
                  <p>Your data is stored in Google Firebase's US-based infrastructure. All data is encrypted in transit (TLS) and at rest (AES-256) by Google. We enforce database-level security rules that prevent cross-church data access. Uploaded photos are stored in Firebase Storage with the same access controls. While we take security seriously, no system is perfectly secure — please use a strong, unique password and contact us immediately if you suspect a breach.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>7. Data Retention</h3>
                  <p>We retain your data for as long as your account is active. If you cancel your account, we retain your data for 30 days to allow for export, after which it is permanently deleted. Error logs are retained for up to 90 days. Stripe retains payment records as required by financial regulations (typically 7 years).</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>8. Your Rights & Choices</h3>
                  <p>You have the right to: access the personal information we hold about you; correct inaccurate information (editable in-app or by contacting us); request deletion of your account and associated data; export your inventory and organizational data (available via CSV export in the app); and opt out of non-essential communications. To exercise these rights, contact us at <a href="mailto:churchopshub@gmail.com" style={{ color:B.teal }}>churchopshub@gmail.com</a>. We will respond within 30 days.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>9. California Residents (CCPA)</h3>
                  <p>If you are a California resident, you have additional rights under the California Consumer Privacy Act: the right to know what personal information we collect and how it is used; the right to delete your personal information; the right to opt out of the sale of personal information (we do not sell personal information); and the right to non-discrimination for exercising your privacy rights. To submit a request, contact us at <a href="mailto:churchopshub@gmail.com" style={{ color:B.teal }}>churchopshub@gmail.com</a> with the subject line "CCPA Request."</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>10. Children's Privacy</h3>
                  <p>The Service is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, contact us and we will delete it promptly.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>11. Cookies & Local Storage</h3>
                  <p>We use Firebase Authentication, which stores a session token in your browser's local storage to keep you signed in. We use your browser's localStorage to remember your in-app preferences (such as filter settings). We do not use advertising cookies or third-party tracking cookies. You can clear local storage through your browser settings, which will sign you out.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>12. Changes to This Policy</h3>
                  <p>We may update this Privacy Policy from time to time. We will notify you of material changes via email or a prominent notice in the app before the change takes effect. The date at the top of this page indicates when the policy was last revised. Continued use of the Service after the effective date constitutes acceptance of the revised policy.</p>

                  <h3 style={{ fontFamily:f1, color:B.navy }}>13. Contact</h3>
                  <p>Privacy questions or data requests? Contact us at <a href="mailto:churchopshub@gmail.com" style={{ color:B.teal }}>churchopshub@gmail.com</a>. We aim to respond within 30 days.</p>
                </>
              )}
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
  const { user, userProfile, loading: authLoading } = authHook;
  const [publicRequest] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const churchId = p.get('request');
    const cn = p.get('cn');
    return churchId ? { churchId, churchName: cn ? decodeURIComponent(cn) : '' } : null;
  });
  const [showHelp] = useState(() => new URLSearchParams(window.location.search).get('help') !== null);
  const [showAuth, setShowAuth] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('signup') !== null || p.get('invite') !== null;
  });
  const [authInitialMode, setAuthInitialMode] = useState('login');

  const handleGetStarted = (mode = 'register') => {
    setAuthInitialMode(mode);
    setShowAuth(true);
  };

  const pathname = window.location.pathname;
  if (pathname === '/blog') return <BlogIndex onGetStarted={handleGetStarted} />;
  if (pathname.startsWith('/blog/')) return <BlogPost slug={pathname.replace('/blog/', '')} onGetStarted={handleGetStarted} />;

  if (publicRequest) return <PublicRequestPage churchId={publicRequest.churchId} churchName={publicRequest.churchName} />;

  if (showHelp) return <HelpPage onBack={() => window.history.back()} />;

  if (authLoading) return <Spinner />;

  if (!user || !userProfile) {
    if (!showAuth) return <LandingPage onGetStarted={handleGetStarted} />;
    return <AuthScreen authHook={authHook} initialMode={authInitialMode} onBack={() => setShowAuth(false)} />;
  }

  return <AppShell authHook={authHook} />;
}

function AppShell({ authHook }) {
  const { user, userProfile, logout, resendVerification, deleteAccount } = authHook;
  const [verifyBannerDismissed, setVerifyBannerDismissed] = useState(false);
  const [resentVerify, setResentVerify] = useState(false);
  const store = useFirestore(userProfile.churchId);
  const { subscription, hasHub, canAddUser } = useSubscription(userProfile.churchId);
  const [tab, setTab] = useState(() => {
    if (new URLSearchParams(window.location.search).get('item')) return 'inventory';
    return localStorage.getItem('lastTab') || 'dashboard';
  });
  const [hubKey, setHubKey] = useState(() => localStorage.getItem('lastHub') || null);
  useEffect(() => { localStorage.setItem('lastTab', tab); }, [tab]);
  const [menuOpen, setMenuOpen] = useState(false);
  const isMobile = useWindowWidth() < 768;
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

  // Auto-clear store errors after 5 seconds
  useEffect(() => {
    if (!store.error) return;
    const t = setTimeout(() => store.clearError(), 5000);
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
    color: tab===k ? B.white : "rgba(255,255,255,0.45)",
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
              ["hubs","Hubs"],
              ["settings","Settings"],
            ].map(([k,v]) =>
              <button key={k} onClick={()=>{
                if(k==="hubs"&&tab==="hubs"){openHub(null);}
                else{setTab(k);}
                setMenuOpen(false);
              }} style={tabBtn(k)}>{v}
                {k==="supplies"&&lowStock.length>0&&<span style={{ marginLeft:6, background:B.red, color:"#fff", borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 }}>{lowStock.length}</span>}
                {k==="reservations"&&pendingRes.length>0&&<span style={{ marginLeft:6, background:B.gold, color:"#fff", borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 }}>{pendingRes.length}</span>}
              </button>
            )}
          </div>}
        </div>
      </div>

      {/* Accent bar */}
      <div style={{ height:3, background:`linear-gradient(90deg, ${B.teal}, ${B.gold})` }}/>

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
        {tab === "dashboard" && <Dashboard store={store} userProfile={userProfile} />}
        {tab === "settings" && <SettingsPage store={store} userProfile={userProfile} subscription={subscription} user={user} canAdd={canAdd} deleteAccount={deleteAccount} />}
        {tab === "inventory" && <ItemsPage store={store} userProfile={userProfile} initialItemId={initialItemId} scannedItemId={scannedItemId} onScannedItemConsumed={() => setScannedItemId(null)} />}
        {tab === "supplies" && <SuppliesPage store={store} userProfile={userProfile} />}
        {tab === "reservations" && <ReservationsPage store={store} userProfile={userProfile} />}
        {tab === "log" && <ActivityLogPage store={store} />}
        {tab === "hubs" && (
          <HubsPage
            store={store}
            userProfile={userProfile}
            hubKey={hubKey}
            onOpenHub={openHub}
            hasHub={hasHub}
            userCanSeeHub={userCanSeeHub}
            onGoToSettings={() => setTab('settings')}
          />
        )}
      </div>
      </PageErrorBoundary>

      {/* Error toast */}
      {store.error && (
        <div style={{ position:"fixed", bottom: isMobile ? 96 : 24, left:"50%", transform:"translateX(-50%)", zIndex:300, background:"#1E1E1E", color:"#fff", borderRadius:12, padding:"12px 20px", display:"flex", alignItems:"center", gap:14, boxShadow:"0 4px 20px rgba(0,0,0,0.3)", maxWidth:"90vw", minWidth:280 }}>
          <span style={{ fontSize:16 }}>⚠️</span>
          <span style={{ fontSize:13, fontFamily:f1, fontWeight:500, flex:1 }}>{store.error}</span>
          <button onClick={() => store.clearError()} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:18, lineHeight:1, padding:0 }}>×</button>
        </div>
      )}

      {/* Footer — desktop only */}
      {!isMobile && (
        <div style={{ background:B.navy, padding:"24px 28px", textAlign:"center" }}>
          <FullLogo size={26} light={true} />
          <p style={{ color:"rgba(255,255,255,0.25)", fontSize:11, fontFamily:f1, marginTop:10 }}>churchopshub.com</p>
          <div style={{ display:"flex", gap:16, justifyContent:"center", alignItems:"center" }}>
            <a href="?help" style={{ color:"rgba(255,255,255,0.35)", fontSize:11, fontFamily:f1, textDecoration:"none" }}>Help Center</a>
            <span style={{ color:"rgba(255,255,255,0.15)", fontSize:11 }}>·</span>
            <a href="/blog" style={{ color:"rgba(255,255,255,0.35)", fontSize:11, fontFamily:f1, textDecoration:"none" }}>Blog</a>
          </div>
        </div>
      )}

      {/* Mobile Bottom Nav */}
      {isMobile && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:200, background:B.white, borderTop:"1px solid "+B.sand, display:"flex", overflowX:"auto", scrollbarWidth:"none", paddingBottom:"env(safe-area-inset-bottom, 0px)" }}>
          {[
            ["dashboard","Home","🏠"],
            ["inventory","Items","📦"],
            ["supplies","Stock","🧴"],
            ["reservations","Reserve","📅"],
            ["hubs","Hubs","🔌"],
            ["settings","Settings","⚙️"],
          ].map(([k,label,icon]) => (
            <button key={k} onClick={()=>{
              if(k==="hubs"&&tab==="hubs"){openHub(null);}
              else{setTab(k);}
              setMenuOpen(false);
            }}
              style={{ flex:"0 0 64px", padding:"8px 2px 6px", border:"none", background:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2, color:tab===k?B.teal:B.textLight, position:"relative" }}>
              <span style={{ fontSize:20 }}>{icon}</span>
              <span style={{ fontSize:9, fontWeight:700, fontFamily:f1, letterSpacing:.3 }}>{label}</span>
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
