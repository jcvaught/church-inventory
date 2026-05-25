import { B, f1, f2 } from '../brand/tokens.js';

/* Screen-reader-friendly fallback for Recharts SVGs, which carry no text
   alternative. Renders a collapsed <details> block beneath a chart; expanding
   exposes the same numbers in a real <table>. Audit 2026-05-24 Phase 1. */
export function DataTableDisclosure({ caption, headers, rows, summary = 'View data table' }) {
  if (!rows || rows.length === 0) return null;
  return (
    <details style={{ marginTop: 8, marginBottom: 4 }}>
      <summary style={{ cursor: 'pointer', fontFamily: f1, fontSize: 12, fontWeight: 600, color: B.textMid, padding: '6px 0' }}>
        {summary}
      </summary>
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid ' + B.sand, marginTop: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: f2, fontSize: 13 }}>
          {caption && (
            <caption style={{ textAlign: 'left', padding: '8px 12px', fontFamily: f1, fontSize: 12, fontWeight: 600, color: B.textLight }}>
              {caption}
            </caption>
          )}
          <thead>
            <tr style={{ background: B.warmGray }}>
              {headers.map(h => (
                <th key={h} scope="col" style={{ padding: '8px 12px', textAlign: 'left', fontFamily: f1, fontSize: 11, fontWeight: 600, color: B.textLight, textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderTop: '1px solid ' + B.sand, background: i % 2 === 0 ? B.white : B.cream }}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: '8px 12px', color: B.textDark, verticalAlign: 'middle' }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
