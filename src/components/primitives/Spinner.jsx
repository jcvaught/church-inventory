import { B, f1, f2 } from '../brand/tokens.js';

export function Spinner() {
  return <div style={{ fontFamily:f2, display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:B.cream, color:B.textLight, flexDirection:"column", gap:12 }}>
    <div style={{ width:40, height:40, border:"3px solid "+B.sand, borderTopColor:B.teal, borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    <span style={{ fontFamily:f1, fontWeight:500 }}>Loading...</span>
  </div>;
}
