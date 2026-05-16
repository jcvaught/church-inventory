import { Component } from 'react';
import * as Sentry from '@sentry/react';
import { B, f1, f2, btnP, btnS } from '../brand/tokens.js';

// Terminal fallback for lazy-loaded hub failures. `lazyWithRetry` already
// retries once and forces a single guarded hard reload on a stale chunk;
// if it has reloaded and the import STILL fails (guard set), it rethrows,
// and this boundary catches the render error instead of leaving the user
// staring at a hung Suspense spinner. Also covers any other render-time
// crash inside a hub.
//
// A dynamic-import failure after a deploy is almost always a stale chunk,
// so we frame the chunk-error case as "new version available" with a
// one-click reload rather than a scary error.
const CHUNK_ERR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|'?text\/html'? is not a valid JavaScript MIME type/i;

function isChunkError(error) {
  return !!error && CHUNK_ERR.test(error.message || String(error));
}

export class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Suspense/render errors are swallowed by the boundary, so Sentry's
    // global handler never sees them — report explicitly. Tag chunk errors
    // so they can be filtered from the actionable-bug feed.
    Sentry.captureException(error, {
      tags: { boundary: 'hub', chunkError: isChunkError(error) },
      extra: { componentStack: info?.componentStack },
    });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = isChunkError(error);
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'80px 24px', textAlign:'center', gap:14 }}>
        <div style={{ fontFamily:f1, fontSize:20, fontWeight:700, color:B.navy }}>
          {stale ? 'A new version is available' : 'Something went wrong loading this hub'}
        </div>
        <div style={{ fontFamily:f2, fontSize:15, color:B.textMid, maxWidth:420, lineHeight:1.5 }}>
          {stale
            ? 'This page was updated since you opened the app. Reload to get the latest version.'
            : 'Reloading usually fixes this. If it keeps happening, let us know.'}
        </div>
        <div style={{ display:'flex', gap:10, marginTop:6 }}>
          <button style={btnP} onClick={() => window.location.reload()}>Reload</button>
          {!stale && (
            <button style={btnS} onClick={() => this.setState({ error: null })}>Try again</button>
          )}
        </div>
      </div>
    );
  }
}
