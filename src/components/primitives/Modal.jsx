import { useContext, useEffect, useId, useRef } from 'react';
import { MobileCtx } from '../../hooks/useMobile.js';
import { B, f1 } from '../brand/tokens.js';

export function Modal({ open, onClose, title, wide, maxWidth, children }) {
  const isMobile = useContext(MobileCtx);
  const titleId = useId();
  const panelRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  // Pin onClose through a ref so the focus-management effect below doesn't re-run
  // on every parent render. Callers pass `onClose` as an inline arrow, so without
  // this ref the effect would tear down + rebuild on every keystroke inside the
  // modal — and the rebuild calls `.focus()` on the panel's first input, which
  // can interrupt typing.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Audit overnight 2026-05-12 / Mobile H-1: a11y — Escape closes the modal,
  // focus moves into the panel on open, and focus is restored to the trigger
  // on close. role="dialog" + aria-modal + aria-labelledby below complete the
  // contract so screen readers announce the dialog correctly.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement;
    const FOCUSABLE_SEL = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    const onKey = (e) => {
      if (e.key === 'Escape') { onCloseRef.current?.(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      // Focus trap: keep Tab cycling within the panel. Without this, Tab leaves
      // the dialog and lands on background controls behind the backdrop.
      const focusable = Array.from(panelRef.current.querySelectorAll(FOCUSABLE_SEL))
        .filter(el => el.offsetParent !== null || el === panelRef.current);
      if (focusable.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!panelRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    // Move focus into the panel on the next paint so screen readers pick it up.
    // Prefer form inputs over buttons — a single querySelector with both in the
    // selector list returns elements in DOM order, and the close-button "X" sits
    // before any form input in the panel's DOM. We want the cursor in the first
    // typeable field, not on the close button.
    const t = setTimeout(() => {
      const target =
        panelRef.current?.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ||
        panelRef.current?.querySelector('button:not([disabled])') ||
        panelRef.current;
      target?.focus?.();
    }, 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') {
        // Defer focus restore so React's unmount finishes first.
        setTimeout(() => prev.focus(), 0);
      }
    };
  }, [open]);

  if (!open) return null;
  const resolvedMaxWidth = maxWidth || (wide ? 720 : 520);

  // Audit 2026-05-24 Phase 3 (item 6): separate <Modal.Footer> children from
  // the main body. When a Footer is present, the panel becomes a flex
  // column: title row + scrollable body + sticky footer pinned to the
  // bottom. Long forms (item detail, ticket detail) no longer scroll their
  // Cancel/Save row off-screen.
  let bodyChildren = children;
  let footerChild = null;
  const childArr = Array.isArray(children) ? children : [children];
  const found = childArr.find(c => c && c.type === ModalFooter);
  if (found) {
    footerChild = found;
    bodyChildren = childArr.filter(c => c !== found);
  }
  const hasFooter = !!footerChild;

  return <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ position:"fixed", inset:0, zIndex:1000, display:"flex", alignItems:isMobile?"flex-end":"center", justifyContent:"center" }} onClick={onClose}>
    <div style={{ position:"absolute", inset:0, background:"rgba(27,42,74,0.45)", backdropFilter:"blur(6px)" }}/>
    {/* H-2: maxHeight uses dvh (dynamic viewport) so iOS Safari's
        shrinking toolbar doesn't clip the action row at the bottom of the modal.
        dvh is supported in iOS Safari 15.4+ (early 2022) — well within
        the teen-iPhone target audience. */}
    <div ref={panelRef} tabIndex={-1} style={{ position:"relative", background:B.cream, borderRadius:isMobile?"18px 18px 0 0":18, padding:hasFooter?0:(isMobile?"22px 18px calc(28px + env(safe-area-inset-bottom, 0px))":"30px 34px"), maxWidth:resolvedMaxWidth, width:isMobile?"100%":"92%", maxHeight:isMobile?"92dvh":"88dvh", overflowY:hasFooter?"hidden":"auto", display:hasFooter?"flex":undefined, flexDirection:hasFooter?"column":undefined, boxShadow:"0 -8px 40px rgba(27,42,74,0.18)" }} onClick={e=>e.stopPropagation()}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:hasFooter?0:22, padding:hasFooter?(isMobile?"22px 18px 14px":"26px 30px 16px"):0, flexShrink:0 }}>
        <h3 id={titleId} style={{ margin:0, fontSize:isMobile?17:20, fontFamily:f1, fontWeight:700, color:B.navy }}>{title}</h3>
        <button onClick={onClose} aria-label="Close dialog" style={{ background:"none", border:"none", fontSize:24, cursor:"pointer", color:B.textLight, padding:"6px 10px", lineHeight:1 }}>&times;</button>
      </div>
      {hasFooter ? (
        <>
          <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:isMobile?"0 18px 8px":"0 30px 14px" }}>
            {bodyChildren}
          </div>
          <div style={{ flexShrink:0, borderTop:"1px solid "+B.sand, background:B.cream, padding:isMobile?"14px 18px calc(18px + env(safe-area-inset-bottom, 0px))":"16px 30px 20px", borderRadius:isMobile?"0 0 0 0":"0 0 18px 18px" }}>
            {footerChild.props.children}
          </div>
        </>
      ) : (
        bodyChildren
      )}
    </div>
  </div>;
}

// Sentinel slot — placed inside <Modal> to designate which children should
// be pinned to the bottom. The Modal owns the actual sticky styling; this
// component exists only as a marker, so callers stay declarative. Its
// `children` are read via `element.props.children` in the Modal body.
export function ModalFooter() { return null; }
Modal.Footer = ModalFooter;
