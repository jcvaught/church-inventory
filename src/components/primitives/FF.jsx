import { Children, cloneElement, isValidElement, useId } from 'react';
import { B, f1 } from '../brand/tokens.js';

// H-6 from the 2026-05-12 mobile/a11y audit (extended 2026-05-14 P-4): native
// DOM children (<input>/<select>/<textarea>) get id + aria-* via cloneElement
// and an <label htmlFor>. Custom components (TagInput, BlockedByInput, the
// *Select pills) don't forward injected props to their inner input, so the
// htmlFor would point at nothing — instead we wrap them in role="group" with
// aria-labelledby pointing at the visible label. The user-facing markup looks
// the same; only the a11y plumbing changes.
const labelStyle = { display:"block", fontSize:12, fontWeight:600, color:B.textLight, marginBottom:5, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1 };

export function FF({ label, required, error, children }) {
  const inputId = useId();
  const labelId = `${inputId}-label`;
  const errorId = error ? `${inputId}-error` : undefined;

  const first = Children.toArray(children).find(isValidElement);
  const isDOMElement = first && typeof first.type === 'string';

  let enhanced = children;
  if (first && isDOMElement) {
    const extra = {
      id: first.props.id || inputId,
      ...(required ? { 'aria-required': true } : {}),
      ...(error ? { 'aria-invalid': true } : {}),
      ...(errorId ? { 'aria-describedby': errorId } : {}),
    };
    enhanced = Children.map(children, (child) => (
      child === first && isValidElement(child) ? cloneElement(child, extra) : child
    ));
  }

  return <div style={{ marginBottom:16 }}>
    {isDOMElement ? (
      <label htmlFor={first?.props?.id || inputId} style={labelStyle}>{label}</label>
    ) : (
      <div id={labelId} style={labelStyle}>{label}</div>
    )}
    {isDOMElement ? enhanced : (
      <div
        role="group"
        aria-labelledby={labelId}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
      >
        {children}
      </div>
    )}
    {error && (
      <div id={errorId} role="alert" style={{ marginTop:4, fontSize:12, color:B.red, fontFamily:f1 }}>{error}</div>
    )}
  </div>;
}
