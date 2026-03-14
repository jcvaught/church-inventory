import { createContext, useState, useEffect } from 'react';

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
