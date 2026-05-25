import { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { B, f1, f2, inp, btnP } from '../components/brand/tokens.js';
import { FF } from '../components/primitives/FF.jsx';
import { FullLogo } from '../components/brand/Logo.jsx';
import { SEO } from '../components/SEO.jsx';

export function PublicRequestPage({ churchId, churchName }) {
  const seoTitle = churchName ? `Submit a Request | ${churchName}` : 'Submit an Item Request | ChurchOpsHub';
  const seoDescription = churchName
    ? `Request an item from ${churchName}. Submit a quick form — they'll be in touch if they can help.`
    : 'Submit an item request to a ChurchOpsHub-powered church. Quick form — they’ll be in touch if they can help.';
  const seoCanonical = churchId ? `/?request=${encodeURIComponent(churchId)}` : '/';

  const [form, setForm] = useState({
    name: '', email: '', phone: '', itemDescription: '',
    quantity: '', dateNeeded: '', urgency: 'Medium', notes: '',
    website: '', // honeypot
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (form.website) return; // honeypot triggered
    if (!form.name.trim() || !form.itemDescription.trim()) {
      setError('Please fill in your name and the item you need.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await addDoc(collection(db, 'churches', churchId, 'publicRequests'), {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        itemDescription: form.itemDescription.trim(),
        quantity: form.quantity ? Number(form.quantity) : null,
        dateNeeded: form.dateNeeded || null,
        urgency: form.urgency,
        notes: form.notes.trim(),
        status: 'pending',
        submittedAt: new Date().toISOString(),
      });
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div style={{ minHeight:'100vh', background:B.cream, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <SEO title={seoTitle} description={seoDescription} canonical={seoCanonical} />
        <div style={{ maxWidth:480, width:'100%', textAlign:'center' }}>
          <FullLogo />
          <div style={{ marginTop:32, background:B.white, borderRadius:20, padding:'40px 32px', border:'1px solid '+B.sand }}>
            <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
            <h2 style={{ fontFamily:f1, color:B.navy, margin:'0 0 12px', fontSize:22 }}>Request Submitted!</h2>
            <p style={{ color:B.textMid, fontFamily:f2, fontSize:15, lineHeight:1.6, margin:0 }}>
              Thank you! Your request has been sent to {churchName || 'the church'}. They'll be in touch if they can help.
            </p>
          </div>
          <p style={{ marginTop:16, fontSize:12, color:B.textLight, fontFamily:f2 }}>
            Powered by <a href="/" style={{ color:B.teal, textDecoration:'none' }}>ChurchOpsHub</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', background:B.cream, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'32px 24px' }}>
      <SEO title={seoTitle} description={seoDescription} canonical={seoCanonical} />
      <div style={{ maxWidth:560, width:'100%' }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <FullLogo />
          <h2 style={{ fontFamily:f1, color:B.navy, margin:'20px 0 4px', fontSize:22 }}>Item Request Form</h2>
          <p style={{ color:B.textMid, fontFamily:f2, fontSize:15, margin:0 }}>
            {churchName ? `Submitting a request to ${churchName}` : 'Submit an item request'}
          </p>
        </div>
        <div style={{ background:B.white, borderRadius:20, padding:'28px 28px', border:'1px solid '+B.sand, boxShadow:'0 2px 12px rgba(27,42,74,0.06)' }}>
          {error && (
            <div style={{ background:B.redPale, border:'1px solid #FECACA', borderRadius:10, padding:'10px 14px', marginBottom:16, color:B.red, fontSize:13, fontWeight:600 }}>{error}</div>
          )}
          <FF label="Your Name" required>
            <input style={inp} value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="John Smith"/>
          </FF>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <FF label="Email (optional)">
              <input style={inp} type="email" value={form.email} onChange={e=>setForm({...form, email:e.target.value})} placeholder="you@example.com"/>
            </FF>
            <FF label="Phone (optional)">
              <input style={inp} type="tel" value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})} placeholder="555-555-5555"/>
            </FF>
          </div>
          <FF label="What item do you need?" required>
            <input style={inp} value={form.itemDescription} onChange={e=>setForm({...form, itemDescription:e.target.value})} placeholder="e.g. Folding chairs, projector, sound system..."/>
          </FF>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
            <FF label="Quantity">
              <input style={inp} type="number" min="1" value={form.quantity} onChange={e=>setForm({...form, quantity:e.target.value})} placeholder="1"/>
            </FF>
            <FF label="Date Needed">
              <input style={inp} type="date" value={form.dateNeeded} onChange={e=>setForm({...form, dateNeeded:e.target.value})}/>
            </FF>
            <FF label="Urgency">
              <select style={inp} value={form.urgency} onChange={e=>setForm({...form, urgency:e.target.value})}>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </FF>
          </div>
          <FF label="Additional Notes">
            <textarea style={{...inp, minHeight:80, resize:'vertical'}} value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})} placeholder="Any other details about your request..."/>
          </FF>
          {/* Honeypot — hidden from real users */}
          <input type="text" style={{ display:'none' }} value={form.website} onChange={e=>setForm({...form, website:e.target.value})} tabIndex={-1} aria-hidden="true"/>
          <button
            onClick={handleSubmit}
            disabled={submitting || !form.name.trim() || !form.itemDescription.trim()}
            style={{ ...btnP, width:'100%', marginTop:4, opacity:(submitting || !form.name.trim() || !form.itemDescription.trim()) ? .5 : 1 }}>
            {submitting ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
        <p style={{ textAlign:'center', marginTop:16, fontSize:12, color:B.textLight, fontFamily:f2 }}>
          Powered by <a href="/" style={{ color:B.teal, textDecoration:'none' }}>ChurchOpsHub</a>
        </p>
      </div>
    </div>
  );
}
