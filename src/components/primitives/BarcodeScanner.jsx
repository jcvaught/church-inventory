import { useState, useEffect, useRef } from 'react';
import { B, f1, f2 } from '../brand/tokens.js';

export function BarcodeScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('starting'); // 'starting' | 'scanning' | 'detected' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!videoRef.current) return;
    let controls = null;
    let fired = false;
    let mounted = true;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (!mounted) return;

        const reader = new BrowserMultiFormatReader();
        const callback = (result) => {
          if (result && !fired) {
            fired = true;
            controls?.stop();
            if (mounted) {
              setStatus('detected');
              setTimeout(() => onScan(result.getText()), 300);
            }
          }
        };

        // Try rear/environment camera first (better for mobile), fall back to any camera
        let c;
        try {
          c = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, videoRef.current, callback);
        } catch {
          if (!mounted) return;
          c = await reader.decodeFromConstraints({ video: true }, videoRef.current, callback);
        }

        controls = c;
        if (!mounted || fired) { c.stop(); return; }
        setStatus('scanning');
      } catch {
        if (mounted) {
          setErrorMsg('Camera access denied. Check browser permissions and try again.');
          setStatus('error');
        }
      }
    })();

    return () => {
      mounted = false;
      controls?.stop();
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: f1, fontWeight: 700, fontSize: 16, color: '#fff' }}>Scan Item</div>
          <div style={{ fontFamily: f2, fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>QR codes and barcodes supported</div>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', color: '#fff', fontFamily: f1, fontSize: 13, fontWeight: 600 }}>
          ✕ Close
        </button>
      </div>

      {/* Camera area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
        {status === 'error' ? (
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
            <p style={{ fontFamily: f1, fontSize: 15, margin: '0 0 8px' }}>Camera unavailable</p>
            <p style={{ fontFamily: f2, fontSize: 13, color: 'rgba(255,255,255,0.6)', maxWidth: 280, margin: 0 }}>{errorMsg}</p>
          </div>
        ) : (
          <>
            <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
              <video
                ref={videoRef}
                style={{ width: '100%', borderRadius: 16, display: 'block', background: '#111', minHeight: 280 }}
                autoPlay
                muted
                playsInline
              />
              {/* Viewfinder overlay */}
              {status !== 'detected' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <div style={{ width: 210, height: 210, border: `2.5px solid ${B.teal}`, borderRadius: 16, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
                </div>
              )}
              {/* Detected flash */}
              {status === 'detected' && (
                <div style={{ position: 'absolute', inset: 0, borderRadius: 16, background: 'rgba(42,125,110,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 56 }}>✅</span>
                </div>
              )}
            </div>
            <p style={{ fontFamily: f2, fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', margin: 0 }}>
              {status === 'starting' ? 'Starting camera…' : status === 'detected' ? 'Code detected!' : 'Point camera at a QR code or barcode'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
