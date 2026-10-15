// COH-016 — "Connect ChatGPT" card (Settings → My Account area).
//
// Lets the owner mint, list and revoke the API keys that let the ChatGPT desktop
// app work their tasks through the `mcp` Cloud Function. SettingsPage renders
// this ONLY for CHATGPT_KEY_UID; that is a courtesy — the server allowlist
// (functions/lib/mcp/keys.js API_KEY_ALLOWLIST) is the real gate, and
// createApiKey refuses every other uid.
//
// The key is shown once, in a modal, and is never kept in state after it closes.

import { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase.js';
import { B, f1, f2, inp, btnP, btnS, btnD } from './brand/tokens.js';
import { Modal } from './primitives/Modal.jsx';
import { FF } from './primitives/FF.jsx';
import { Spinner } from './primitives/Spinner.jsx';
import { useConfirm } from './primitives/ConfirmDialog.jsx';

// Mirror of API_KEY_ALLOWLIST in functions/lib/mcp/keys.js (jvaught@fxcc.org).
export const CHATGPT_KEY_UID = 'RCFuTSK9ARfGF83v6TOS1Yf4Cnn2';
const MCP_URL = 'https://us-central1-church-inventory-9615c.cloudfunctions.net/mcp';

const call = (name, data) => httpsCallable(getFunctions(app), name)(data).then((r) => r.data);
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never');

const label = { fontSize: 12, color: B.textLight, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .8, fontFamily: f1, marginBottom: 4 };

export function ConnectChatGPTCard() {
  const [keys, setKeys] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [keyLabel, setKeyLabel] = useState('ChatGPT desktop');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState(null); // { key, expiresAt } — shown once
  const [copied, setCopied] = useState('');
  const { confirm, ConfirmHost } = useConfirm();

  const load = useCallback(async () => {
    try {
      const r = await call('listApiKeys', {});
      setKeys(r.keys || []);
    } catch {
      setKeys([]);
      setError('Could not load your keys. Please try again.');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function copy(text, what) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(what);
    setTimeout(() => setCopied(''), 2000);
  }

  async function handleCreate() {
    setCreating(true);
    setError('');
    try {
      const r = await call('createApiKey', { label: keyLabel.trim() });
      setNewKey({ key: r.key, expiresAt: r.expiresAt });
      await load();
    } catch (e) {
      setError(e?.message?.replace(/^.*?:\s*/, '') || 'Could not create a key.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(k) {
    const ok = await confirm({
      title: 'Revoke this key?',
      message: `"${k.label}" will stop working immediately. ChatGPT will lose access until you connect it with a new key.`,
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!ok) return;
    try {
      await call('revokeApiKey', { id: k.id });
      await load();
    } catch {
      setError('Could not revoke the key. Please try again.');
    }
  }

  const live = (keys || []).filter((k) => !k.revoked && !k.expired);

  return (
    <div style={{ background: B.white, borderRadius: 14, padding: '22px 24px', border: '1px solid ' + B.sand, marginBottom: 16, boxShadow: '0 1px 3px rgba(27,42,74,0.06)' }}>
      <h3 style={{ margin: '0 0 8px', fontFamily: f1, fontSize: 16, fontWeight: 700, color: B.navy }}>Connect ChatGPT</h3>
      <div style={{ fontSize: 13, color: B.textMid, fontFamily: f2, marginBottom: 16, lineHeight: 1.5 }}>
        Let the ChatGPT desktop app work your tasks: see them, change status, update fields, add comments and create new ones.
        It acts as you, with exactly your access, and cannot reassign or re-share anything. Keys last 90 days.
      </div>

      <div style={label}>MCP server URL</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input readOnly aria-label="MCP server URL" value={MCP_URL} onFocus={(e) => e.target.select()}
          style={{ ...inp, flex: '1 1 320px', fontFamily: 'monospace', fontSize: 12 }} />
        <button onClick={() => copy(MCP_URL, 'url')} style={{ ...btnS, fontSize: 13, padding: '9px 16px', color: copied === 'url' ? B.teal : undefined }}>
          {copied === 'url' ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div style={label}>Setup</div>
      <ol style={{ margin: '0 0 16px', paddingLeft: 20, fontSize: 13, color: B.textMid, fontFamily: f2, lineHeight: 1.6 }}>
        <li>Create a key below and copy it (it is shown only once).</li>
        <li>In the ChatGPT desktop app: <strong>Settings → Plugins → Add → Add MCP server</strong>.</li>
        <li>Choose type <strong>Streamable HTTP</strong> and paste the URL above.</li>
        <li>Set the Bearer token env var name to <code>CHURCHOPSHUB_KEY</code> and set that variable to your key.</li>
      </ol>

      <div style={label}>Your keys</div>
      {keys === null ? (
        <div style={{ padding: '8px 0' }}><Spinner /></div>
      ) : keys.length === 0 ? (
        <div style={{ fontSize: 13, color: B.textLight, fontFamily: f2, marginBottom: 12 }}>No keys yet.</div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          {keys.map((k) => {
            const inactive = k.revoked || k.expired;
            return (
              <div key={k.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid ' + B.sand, opacity: inactive ? 0.55 : 1 }}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, fontFamily: f1, color: B.textDark }}>
                    {k.label} {k.revoked && <span style={{ color: B.red, fontSize: 12 }}>(revoked)</span>}
                    {!k.revoked && k.expired && <span style={{ color: B.textLight, fontSize: 12 }}>(expired)</span>}
                  </div>
                  <div style={{ fontSize: 12, color: B.textLight, fontFamily: f2 }}>
                    Created {fmt(k.createdAt)} · Expires {fmt(k.expiresAt)} · Last used {fmtTime(k.lastUsedAt)}
                  </div>
                </div>
                {!inactive && (
                  <button onClick={() => handleRevoke(k)} style={{ ...btnD, fontSize: 12, padding: '7px 14px' }}>Revoke</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <div role="alert" style={{ color: B.red, fontSize: 13, fontFamily: f2, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px', maxWidth: 300 }}>
          <FF label="Key label">
            <input value={keyLabel} maxLength={60} onChange={(e) => setKeyLabel(e.target.value)} style={inp} />
          </FF>
        </div>
        <button onClick={handleCreate} disabled={creating || !keyLabel.trim() || live.length >= 5}
          style={{ ...btnP, fontSize: 13, padding: '10px 18px', marginBottom: 14, opacity: (creating || !keyLabel.trim() || live.length >= 5) ? 0.5 : 1 }}>
          {creating ? 'Creating…' : 'Create key'}
        </button>
      </div>
      {live.length >= 5 && <div style={{ fontSize: 12, color: B.textLight, fontFamily: f2 }}>You have 5 active keys, the maximum. Revoke one to create another.</div>}

      <Modal open={!!newKey} onClose={() => setNewKey(null)} title="Your new key">
        <div style={{ fontSize: 13, color: B.textMid, fontFamily: f2, marginBottom: 12, lineHeight: 1.5 }}>
          <strong>You won’t see this again.</strong> Copy it now and store it where ChatGPT can read it as the
          <code> CHURCHOPSHUB_KEY</code> variable. If you lose it, revoke it and create a new one.
        </div>
        <input readOnly aria-label="New API key" value={newKey?.key || ''} onFocus={(e) => e.target.select()}
          style={{ ...inp, fontFamily: 'monospace', fontSize: 12, marginBottom: 12 }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => copy(newKey.key, 'key')} style={{ ...btnP, fontSize: 13 }}>{copied === 'key' ? 'Copied!' : 'Copy key'}</button>
          <button onClick={() => setNewKey(null)} style={{ ...btnS, fontSize: 13 }}>Done</button>
        </div>
      </Modal>
      <ConfirmHost />
    </div>
  );
}
