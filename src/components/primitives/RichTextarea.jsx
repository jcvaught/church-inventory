import { useEffect, useId, useRef } from 'react';
import { B, f1 } from '../brand/tokens.js';

// Shared by TasksPage + MaintenancePage (previously duplicated). Renders a
// textarea with bullet/numbered toggles in a small toolbar above. Auto-grows
// with content (fix from 2026-05-13: without auto-grow, pressing Enter at
// end-of-content felt broken — state updated but the new empty line was
// outside the locked min-height). When a `label` is passed it renders an
// internal <label htmlFor>; otherwise just the toolbar.
export function RichTextarea({ value, onChange, style, placeholder, onKeyDown, label }) {
  const taRef = useRef();
  const taId = useId();

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);

  function getLineRange(selStart, selEnd) {
    const lines = value.split('\n');
    let pos = 0, startLine = 0, endLine = lines.length - 1, foundStart = false;
    for (let i = 0; i < lines.length; i++) {
      const end = pos + lines[i].length;
      if (!foundStart && selStart <= end) { startLine = i; foundStart = true; }
      if (foundStart && selEnd <= end) { endLine = i; break; }
      pos = end + 1;
    }
    return { lines, startLine, endLine };
  }

  function applyLineTransform(kind /* 'bullet' | 'numbered' */) {
    const el = taRef.current;
    if (!el) return;
    const ss = el.selectionStart;
    const se = el.selectionEnd;
    const { lines, startLine, endLine } = getLineRange(ss, se);
    const slice = lines.slice(startLine, endLine + 1);
    const re = kind === 'bullet' ? /^• / : /^\d+\.\s/;
    const allHave = slice.every(l => re.test(l));
    let n = 1;
    const newLines = lines.map((l, i) => {
      if (i < startLine || i > endLine) return l;
      const stripped = l.replace(/^\d+\.\s/, '').replace(/^• /, '');
      if (allHave) return stripped;
      return kind === 'bullet' ? '• ' + stripped : (n++) + '. ' + stripped;
    });
    function starts(arr) {
      const out = new Array(arr.length);
      let pos = 0;
      for (let i = 0; i < arr.length; i++) { out[i] = pos; pos += arr[i].length + 1; }
      return out;
    }
    const oldStarts = starts(lines);
    const newStarts = starts(newLines);
    function adjust(p) {
      let li = lines.length - 1;
      for (let i = 0; i < lines.length; i++) {
        if (p <= oldStarts[i] + lines[i].length) { li = i; break; }
      }
      const offset = p - oldStarts[li];
      return newStarts[li] + Math.min(offset, newLines[li].length);
    }
    const newSs = adjust(ss);
    const newSe = adjust(se);
    onChange(newLines.join('\n'));
    setTimeout(() => { if (!el) return; el.focus(); el.setSelectionRange(newSs, newSe); }, 0);
  }
  function toggleBullet() { applyLineTransform('bullet'); }
  function toggleNumbered() { applyLineTransform('numbered'); }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      const el = taRef.current;
      const pos = el.selectionStart;
      const textBefore = value.substring(0, pos);
      const lineStart = textBefore.lastIndexOf('\n') + 1;
      const currentLine = textBefore.substring(lineStart);
      const atLineEnd = pos === value.length || value[pos] === '\n';

      const numMatch = currentLine.match(/^(\d+)\. /);
      if (currentLine === '• ' && atLineEnd) {
        e.preventDefault();
        const newValue = value.substring(0, lineStart) + value.substring(pos);
        onChange(newValue);
        setTimeout(() => { el.selectionStart = el.selectionEnd = lineStart; }, 0);
        return;
      }
      if (currentLine.startsWith('• ')) {
        e.preventDefault();
        const insert = '\n• ';
        const newValue = value.substring(0, pos) + insert + value.substring(el.selectionEnd);
        onChange(newValue);
        setTimeout(() => { el.selectionStart = el.selectionEnd = pos + insert.length; }, 0);
        return;
      }
      if (numMatch && currentLine === numMatch[0] && atLineEnd) {
        e.preventDefault();
        const newValue = value.substring(0, lineStart) + value.substring(pos);
        onChange(newValue);
        setTimeout(() => { el.selectionStart = el.selectionEnd = lineStart; }, 0);
        return;
      }
      if (numMatch) {
        e.preventDefault();
        const insert = '\n' + (parseInt(numMatch[1]) + 1) + '. ';
        const newValue = value.substring(0, pos) + insert + value.substring(el.selectionEnd);
        onChange(newValue);
        setTimeout(() => { el.selectionStart = el.selectionEnd = pos + insert.length; }, 0);
        return;
      }
    }
    onKeyDown?.(e);
  }

  const tb = { padding:'3px 9px', borderRadius:6, border:'1px solid '+B.sand, background:B.warmGray, color:B.textMid, fontSize:12, fontFamily:f1, cursor:'pointer', fontWeight:600 };
  const buttons = (
    <>
      <button type="button" onMouseDown={e => { e.preventDefault(); toggleBullet(); }} style={tb}>• List</button>
      <button type="button" onMouseDown={e => { e.preventDefault(); toggleNumbered(); }} style={tb}>1. List</button>
    </>
  );

  return (
    <div style={label ? { marginBottom:16 } : {}}>
      {label ? (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
          <label htmlFor={taId} style={{ fontSize:12, fontWeight:600, color:B.textLight, textTransform:'uppercase', letterSpacing:.8, fontFamily:f1 }}>{label}</label>
          <div style={{ display:'flex', gap:4 }}>{buttons}</div>
        </div>
      ) : (
        <div style={{ display:'flex', gap:4, marginBottom:4 }}>{buttons}</div>
      )}
      <textarea id={taId} ref={taRef} value={value} onChange={e => onChange(e.target.value)} style={style} placeholder={placeholder} onKeyDown={handleKeyDown}/>
    </div>
  );
}
