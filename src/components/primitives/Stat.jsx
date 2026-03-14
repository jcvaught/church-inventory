import { B, f1 } from '../brand/tokens.js';

export function Stat({ label, value, icon, color }) {
  return <div style={{ background:B.white, borderRadius:14, padding:"20px 22px", flex:"1 1 130px", minWidth:130, boxShadow:"0 1px 3px rgba(27,42,74,0.06)", border:"1px solid "+B.sand }}>
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
      <span style={{ fontSize:18 }}>{icon}</span>
      <span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:1, fontFamily:f1 }}>{label}</span>
    </div>
    <div style={{ fontSize:30, fontWeight:700, color:color||B.navy, fontFamily:f1 }}>{value}</div>
  </div>;
}
