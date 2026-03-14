import { B, f1 } from '../brand/tokens.js';

export function FF({ label, children }) {
  return <div style={{ marginBottom:16 }}>
    <label style={{ display:"block", fontSize:12, fontWeight:600, color:B.textLight, marginBottom:5, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1 }}>{label}</label>
    {children}
  </div>;
}
