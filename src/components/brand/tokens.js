// Audit 2026-05-24 Phase 3: shared breakpoints so pages don't reinvent the
// 768px threshold. `useBreakpoint()` in src/hooks/useMobile.js returns the
// matching key ('mobile' | 'tablet' | 'desktop'). The old single MobileCtx
// (true/false at 768px) stays in place — it still drives bottom-nav-only
// changes — but layouts that benefit from a 3-state distinction (Dashboard
// stat grid, eventually the app tab bar) can call useBreakpoint() instead.
export const BREAKPOINTS = { mobile: 480, tablet: 768, desktop: 1024 };

export const B = {
  navy: "#1B2A4A", navyLight: "#243556",
  teal: "#2A7D6E", tealLight: "#34957F", tealPale: "#E6F5F1",
  gold: "#D4A843", goldLight: "#F5ECD4",
  cream: "#FAFAF7", warmGray: "#F2F0EB", sand: "#E8E4DC",
  // textLight darkened three times for WCAG-AA contrast:
  //   1) audit M8 (2026-05-25): #8B93A1 → #6B7280 — fixed the white-bg case.
  //   2) E2E Layer 1 (2026-05-25): #6B7280 → #5F6878 — fixed warmGray.
  //   3) E2E Layer 1 follow-up (2026-05-25): #5F6878 → #58606E — fixed sand.
  // Final value sits at ~5.02:1 on B.sand, ~5.55:1 on B.warmGray, ~5.97:1 on
  // B.cream/white. Visually almost identical to the prior value but clears
  // axe-core color-contrast on every brand background. Distinct from textMid
  // (#5A6477) by ~5% in luminance, preserving the visual hierarchy.
  textDark: "#1B2A4A", textMid: "#5A6477", textLight: "#58606E",
  white: "#FFFFFF", red: "#D94F4F", redPale: "#FDF2F2",
};
export const f1 = "'Outfit',sans-serif";
export const f2 = "'Source Sans 3',sans-serif";
export const inp = { width:"100%", padding:"11px 14px", borderRadius:10, border:"1px solid "+B.sand, fontSize:14, fontFamily:f2, background:B.white, boxSizing:"border-box", outline:"none", color:B.textDark };
export const btnP = { padding:"11px 24px", borderRadius:10, border:"none", background:B.teal, color:B.white, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:f1, letterSpacing:.2 };
export const btnS = { padding:"11px 24px", borderRadius:10, border:"1px solid "+B.sand, background:B.white, color:B.textDark, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:f1 };
export const btnD = { padding:"11px 24px", borderRadius:10, border:"1px solid #FECACA", background:B.redPale, color:B.red, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:f1 };
