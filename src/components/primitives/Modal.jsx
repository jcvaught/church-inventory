import { useContext } from 'react';
import { MobileCtx } from '../../hooks/useMobile.js';
import { B, f1 } from '../brand/tokens.js';

export function Modal({ open, onClose, title, wide, children }) {
  const isMobile = useContext(MobileCtx);
  if (!open) return null;
  return <div style={{ position:"fixed", inset:0, zIndex:1000, display:"flex", alignItems:isMobile?"flex-end":"center", justifyContent:"center" }} onClick={onClose}>
    <div style={{ position:"absolute", inset:0, background:"rgba(27,42,74,0.45)", backdropFilter:"blur(6px)" }}/>
    <div style={{ position:"relative", background:B.cream, borderRadius:isMobile?"18px 18px 0 0":18, padding:isMobile?"22px 18px 28px":"30px 34px", maxWidth:wide?720:520, width:isMobile?"100%":"92%", maxHeight:isMobile?"92vh":"88vh", overflowY:"auto", boxShadow:"0 -8px 40px rgba(27,42,74,0.18)" }} onClick={e=>e.stopPropagation()}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
        <h3 style={{ margin:0, fontSize:isMobile?17:20, fontFamily:f1, fontWeight:700, color:B.navy }}>{title}</h3>
        <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:B.textLight }}>&times;</button>
      </div>
      {children}
    </div>
  </div>;
}
