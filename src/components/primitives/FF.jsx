import { Children, cloneElement, isValidElement, useId } from 'react';
import { B, f1 } from '../brand/tokens.js';

// H-6 from the 2026-05-12 mobile/a11y audit: previously the <label> was just a
// sibling of children — no htmlFor, no programmatic association. Screen readers
// would not announce the label when focus entered the input. Now FF generates
// an id, sets htmlFor on the label, and injects id + aria-* on the first child
// (cloneElement). Optional `required` / `error` props emit aria-required and
// aria-invalid + aria-describedby pointing at an error message element.
export function FF({ label, required, error, children }) {
  const inputId = useId();
  const errorId = error ? `${inputId}-error` : undefined;

  // Inject a11y attributes onto the first valid element child (typical use:
  // a single <input>/<select>/<textarea>). If callers pass anything else,
  // we leave the children as-is — the visible label still works, just no
  // programmatic linkage.
  let enhanced = children;
  const first = Children.toArray(children).find(isValidElement);
  if (first) {
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
    <label htmlFor={first?.props?.id || inputId} style={{ display:"block", fontSize:12, fontWeight:600, color:B.textLight, marginBottom:5, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1 }}>{label}</label>
    {enhanced}
    {error && (
      <div id={errorId} role="alert" style={{ marginTop:4, fontSize:12, color:B.red, fontFamily:f1 }}>{error}</div>
    )}
  </div>;
}
