// Audit 2026-05-24 Phase 4 — pattern fix for emoji-as-icon usage.
// Two modes:
//   • Decorative — `<EmojiIcon emoji="📦" decorative />` emits `aria-hidden`
//     so screen readers skip it. Use when the surrounding text already names
//     the thing.
//   • Semantic   — `<EmojiIcon emoji="📦" label="Inventory" />` emits
//     `role="img"` + `aria-label` so the meaning is announced.
//
// Per WAI guidance, an emoji glyph with no aria treatment is read as its
// Unicode name (e.g. "🔁" → "clockwise vertical arrows") which rarely matches
// the author's intent — pick a mode.

export function EmojiIcon({ emoji, label, decorative = false, style }) {
  const base = { fontStyle: 'normal', ...(style || {}) };
  if (decorative || !label) {
    return (
      <span aria-hidden="true" style={base}>
        {emoji}
      </span>
    );
  }
  return (
    <span role="img" aria-label={label} style={base}>
      {emoji}
    </span>
  );
}
