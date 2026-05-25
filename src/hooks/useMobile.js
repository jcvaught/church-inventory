import { createContext, useState, useEffect } from 'react';
import { BREAKPOINTS } from '../components/brand/tokens.js';

export const MobileCtx = createContext(false);

export function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    let timer;
    const h = () => { clearTimeout(timer); timer = setTimeout(() => setW(window.innerWidth), 100); };
    window.addEventListener('resize', h);
    return () => { window.removeEventListener('resize', h); clearTimeout(timer); };
  }, []);
  return w;
}

// Audit 2026-05-24 Phase 3. Returns 'mobile' (<768px), 'tablet' (768–1023px),
// or 'desktop' (≥1024px). Use this when a layout benefits from a third
// breakpoint — e.g. Dashboard's stat grid is 2-col on phone, 3-col on tablet,
// 5-col on desktop. For boolean mobile/non-mobile decisions, keep using
// MobileCtx (already wired through the tree, no extra rerender).
export function useBreakpoint() {
  const w = useWindowWidth();
  if (w < BREAKPOINTS.tablet) return 'mobile';
  if (w < BREAKPOINTS.desktop) return 'tablet';
  return 'desktop';
}
