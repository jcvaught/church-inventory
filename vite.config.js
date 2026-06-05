import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

// Stable per-deploy build id. On Vercel the commit SHA is set and identical
// across the build process; locally we fall back to a timestamp. It's baked
// into the bundle as `__BUILD_ID__` AND emitted to dist/version.json, so the
// running app can poll version.json and detect when a newer build is live
// (sw.js is byte-stable across deploys, so SW update events never fire — a
// polled build id is the reliable "new version available" signal).
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now());

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    {
      name: 'emit-version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId: BUILD_ID }) });
      },
    },
    process.env.ANALYZE && visualizer({ open: true, filename: 'dist/bundle-stats.html', gzipSize: true }),
  ].filter(Boolean),
  build: {
    outDir: 'dist',
    minify: 'terser',
    terserOptions: {
      compress: true,
      mangle: false,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          // Minimum init the public ?jobs= route needs — keeps the anonymous
          // teen bundle off the heavy Auth/Firestore/Storage chunk.
          'vendor-firebase-min': ['firebase/app', 'firebase/functions'],
          'vendor-firebase-full': ['firebase/auth', 'firebase/firestore', 'firebase/storage'],
        },
      },
    },
  },
});
