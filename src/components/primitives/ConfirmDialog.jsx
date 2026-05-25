import { useCallback, useRef, useState } from 'react';
import { Modal } from './Modal.jsx';
import { B, f1, f2, inp, btnP, btnS, btnD } from '../brand/tokens.js';

// Audit 2026-05-24 Phase 2 — single replacement for window.confirm across the app.
// `useConfirm()` returns an imperative `confirm(opts)` that resolves to true/false
// when the user picks an action, plus a `<ConfirmHost />` JSX node the caller must
// mount somewhere inside the component tree.
//
// Supported opts (all optional except `message`):
//   title          – heading text (default "Are you sure?")
//   message        – body string OR ReactNode
//   confirmLabel   – CTA text (default "Confirm")
//   cancelLabel    – cancel text (default "Cancel")
//   danger         – render CTA with btnD (default false)
//   typeToConfirm  – string the user must retype before CTA enables (e.g. church name).
//                    Pass falsy/empty to skip the type-to-confirm gate.

export function useConfirm() {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((opts = {}) => new Promise((resolve) => {
    resolverRef.current = resolve;
    setState({
      title: opts.title || 'Are you sure?',
      message: opts.message ?? '',
      confirmLabel: opts.confirmLabel || 'Confirm',
      cancelLabel: opts.cancelLabel || 'Cancel',
      danger: !!opts.danger,
      typeToConfirm: opts.typeToConfirm || '',
    });
  }), []);

  const finish = useCallback((value) => {
    setState(null);
    const r = resolverRef.current;
    resolverRef.current = null;
    if (r) r(value);
  }, []);

  const ConfirmHost = useCallback(() => state ? (
    <ConfirmDialog
      {...state}
      onCancel={() => finish(false)}
      onConfirm={() => finish(true)}
    />
  ) : null, [state, finish]);

  return { confirm, ConfirmHost };
}

export function ConfirmDialog({
  title, message, confirmLabel, cancelLabel,
  danger, typeToConfirm, onCancel, onConfirm,
}) {
  const [typed, setTyped] = useState('');
  const needsType = !!typeToConfirm;
  const typeOk = !needsType || typed === typeToConfirm;

  return (
    <Modal open onClose={onCancel} title={title}>
      <div style={{ fontSize: 14, fontFamily: f2, color: B.textMid, lineHeight: 1.5 }}>
        {message}
      </div>

      {needsType && (
        <div style={{ marginTop: 18 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, fontFamily: f1, color: B.navy, marginBottom: 6 }}>
            Type <span style={{ fontFamily: 'ui-monospace,monospace', color: B.red }}>{typeToConfirm}</span> to confirm
          </label>
          <input
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={typeToConfirm}
            autoComplete="off"
            style={inp}
            aria-label="Type to confirm"
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
        <button onClick={onCancel} style={btnS}>{cancelLabel}</button>
        <button
          onClick={onConfirm}
          disabled={!typeOk}
          style={{ ...(danger ? btnD : btnP), opacity: typeOk ? 1 : 0.5, cursor: typeOk ? 'pointer' : 'not-allowed' }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
