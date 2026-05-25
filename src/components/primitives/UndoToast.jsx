import { useEffect, useRef, useState, useContext } from 'react';
import { MobileCtx } from '../../hooks/useMobile.js';
import { B, f1, f2 } from '../brand/tokens.js';

// Audit 2026-05-24 Phase 2 — fixed-position toast with countdown + Undo button.
// The toast auto-dismisses after `durationMs` (default 5s); calling onDismiss
// after Undo or timeout clears the parent's state so the toast unmounts.
//
// Pages mount it inline:
//   const [undo, setUndo] = useState(null);
//   // ...
//   setUndo({ message: 'Person deactivated.', onUndo: async () => updateUser(...) });
//   // ...
//   {undo && <UndoToast {...undo} onDismiss={() => setUndo(null)} />}

export function UndoToast({ message, onUndo, onDismiss, durationMs = 5000 }) {
  const isMobile = useContext(MobileCtx);
  const [remaining, setRemaining] = useState(durationMs);
  const dismissedRef = useRef(false);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const left = Math.max(0, durationMs - (Date.now() - start));
      setRemaining(left);
      if (left === 0) {
        clearInterval(id);
        if (!dismissedRef.current) {
          dismissedRef.current = true;
          onDismiss?.();
        }
      }
    }, 100);
    return () => clearInterval(id);
  }, [durationMs, onDismiss]);

  async function handleUndo() {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    try { await onUndo?.(); } finally { onDismiss?.(); }
  }

  const seconds = Math.ceil(remaining / 1000);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: isMobile ? 16 : '50%',
        right: isMobile ? 16 : undefined,
        bottom: isMobile ? 'calc(76px + env(safe-area-inset-bottom, 0px))' : 32,
        transform: isMobile ? undefined : 'translateX(-50%)',
        zIndex: 1100,
        background: B.navy,
        color: B.white,
        padding: '12px 16px',
        borderRadius: 12,
        boxShadow: '0 8px 28px rgba(27,42,74,0.32)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontSize: 14,
        fontFamily: f2,
        maxWidth: isMobile ? undefined : 480,
        minWidth: isMobile ? undefined : 320,
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={handleUndo}
        style={{
          background: 'none',
          border: '1px solid rgba(255,255,255,0.4)',
          color: B.white,
          padding: '6px 14px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          fontFamily: f1,
          cursor: 'pointer',
          letterSpacing: 0.3,
        }}
      >
        Undo {seconds}s
      </button>
      <button
        onClick={() => { dismissedRef.current = true; onDismiss?.(); }}
        aria-label="Dismiss"
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.6)',
          fontSize: 18,
          lineHeight: 1,
          cursor: 'pointer',
          padding: '4px 6px',
        }}
      >
        &times;
      </button>
    </div>
  );
}
