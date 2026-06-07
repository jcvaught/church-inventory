import { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { B, f1, f2 } from './brand/tokens.js';
import { EmojiIcon } from './primitives/EmojiIcon.jsx';

// "What needs attention this week" — admin-only AI digest panel on the
// Dashboard. Calls the getAttentionDigest callable (returns the cached weekly
// digest, or regenerates on refresh). The Cloud Function does all the work +
// caching; this just renders the result. See functions/index.js.

const PRIORITY = {
  high:   { color: B.red,  label: 'High' },
  medium: { color: B.gold, label: 'Soon' },
  low:    { color: B.teal, label: 'FYI' },
};

export function AttentionPanel() {
  const [state, setState] = useState({ status: 'loading', payload: null, error: '' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setState(s => ({ ...s, status: 'loading' }));
    try {
      const fn = httpsCallable(getFunctions(), 'getAttentionDigest');
      const res = await fn(refresh ? { refresh: true } : {});
      setState({ status: 'ready', payload: res.data, error: '' });
    } catch (err) {
      setState({ status: 'error', payload: null, error: err?.message || 'Could not load the weekly summary.' });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const { status, payload, error } = state;
  const generatedLabel = payload?.generatedAt
    ? new Date(payload.generatedAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div style={{ background: B.white, border: '1px solid ' + B.sand, borderRadius: 14, padding: '18px 20px', marginBottom: 24, boxShadow: '0 1px 3px rgba(27,42,74,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontFamily: f1, fontSize: 16, fontWeight: 700, color: B.navy }}>
          <EmojiIcon emoji="✨" decorative /> What needs attention this week
        </h3>
        <button
          onClick={() => load(true)}
          disabled={refreshing || status === 'loading'}
          style={{ background: 'none', border: '1px solid ' + B.sand, borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 600, fontFamily: f1, color: B.textMid, cursor: refreshing ? 'default' : 'pointer', opacity: refreshing ? 0.6 : 1 }}>
          {refreshing ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {status === 'loading' && (
        <p style={{ fontSize: 13, color: B.textLight, fontFamily: f2, margin: 0 }}>Reading across your hubs…</p>
      )}

      {status === 'error' && (
        <p style={{ fontSize: 13, color: B.red, fontFamily: f2, margin: 0 }}>{error}</p>
      )}

      {status === 'ready' && payload && (
        <>
          {payload.summary && (
            <p style={{ fontSize: 14, color: B.textDark, fontFamily: f2, margin: '0 0 12px', lineHeight: 1.5 }}>{payload.summary}</p>
          )}
          {payload.items?.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {payload.items.map((it, i) => {
                const p = PRIORITY[it.priority] || PRIORITY.medium;
                return (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: B.textDark, fontFamily: f2 }}>
                    <span style={{ flexShrink: 0, marginTop: 2, fontSize: 10, fontWeight: 700, color: p.color, background: B.cream, border: '1px solid ' + p.color, borderRadius: 10, padding: '1px 8px', minWidth: 38, textAlign: 'center' }}>{p.label}</span>
                    <span style={{ lineHeight: 1.45 }}>{it.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {generatedLabel && (
            <p style={{ fontSize: 11, color: B.textLight, fontFamily: f1, margin: '12px 0 0' }}>
              Updated {generatedLabel} · refreshes weekly
            </p>
          )}
        </>
      )}
    </div>
  );
}
