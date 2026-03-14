import { B, f1 } from '../brand/tokens.js';

export function Badge({ status }) {
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
