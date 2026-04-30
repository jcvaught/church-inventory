import { B, f1 } from './tokens.js';

export function Logo({ size = 40, light = false }) {
  const c1 = light ? "#fff" : B.teal;
  const c2 = light ? "rgba(255,255,255,0.6)" : B.gold;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <path d="M36 12a17 17 0 1 0 0 24" stroke={c1} strokeWidth="5" strokeLinecap="round" fill="none"/>
      <path d="M32 18a10 10 0 1 0 0 12" stroke={c2} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7"/>
      <circle cx="30" cy="24" r="4" fill={c1}/>
      <circle cx="40" cy="12" r="3" fill={c2}/>
      <circle cx="40" cy="36" r="3" fill={c2}/>
      <circle cx="42" cy="24" r="2" fill={c2} opacity="0.6"/>
    </svg>
  );
}

export function FullLogo({ size = 38, light = false }) {
  const color = light ? "#fff" : B.navy;
  return (
    <div style={{ display:"flex", alignItems:"center", gap: size * 0.28 }}>
      <Logo size={size} light={light} />
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontFamily:f1, fontSize:size*0.46, fontWeight:700, color, letterSpacing:-0.5 }}>
          ChurchOps<span style={{ color: light ? "rgba(255,255,255,0.7)" : B.teal }}>Hub</span>
        </div>
        <div style={{ fontFamily:f1, fontSize:size*0.2, fontWeight:400, color: light ? "rgba(255,255,255,0.45)" : B.textLight, letterSpacing:1.5, textTransform:"uppercase", marginTop:1 }}>
          Run Your Church
        </div>
      </div>
    </div>
  );
}
