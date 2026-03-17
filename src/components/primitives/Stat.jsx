import { useContext } from 'react';
import { B, f1 } from '../brand/tokens.js';
import { MobileCtx } from '../../hooks/useMobile.js';

export function Stat({ label, value, icon, color }) {
  const isMobile = useContext(MobileCtx);
  return <div style={{ background:B.white, borderRadius:14, padding:isMobile?"14px 16px":"20px 22px", boxShadow:"0 1px 3px rgba(27,42,74,0.06)", border:"1px solid "+B.sand }}>
    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
      <span style={{ fontSize:isMobile?15:18 }}>{icon}</span>
      <span style={{ fontSize:10, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:1, fontFamily:f1, lineHeight:1.2 }}>{label}</span>
    </div>
    <div style={{ fontSize:isMobile?24:30, fontWeight:700, color:color||B.navy, fontFamily:f1 }}>{value}</div>
  </div>;
}
