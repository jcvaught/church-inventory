import { B, f1 } from '../brand/tokens.js';

// Audit 2026-05-24 Phase 4 — pattern fix for color-only status indicators.
// Renders a colored dot with an accessible text label. When `showLabel` is
// true the label sits visibly next to the dot; otherwise it's visually-hidden
// (screen-reader-only) and the dot still carries `role="img"` + `aria-label`
// so the meaning is never color-alone.
//
// Color is required and must be a hex/rgb string. `label` is required because
// the whole point is to stop conveying state through color alone.

const SR_ONLY = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export function StatusDot({ color, label, size = 8, showLabel = false, ringColor }) {
  const dot = (
    <span
      role="img"
      aria-label={label}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        border: ringColor ? `1px solid ${ringColor}` : undefined,
        flexShrink: 0,
      }}
    />
  );
  if (showLabel) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {dot}
        <span style={{ fontSize: 13, fontFamily: f1, color: B.textDark }}>{label}</span>
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {dot}
      <span style={SR_ONLY}>{label}</span>
    </span>
  );
}
