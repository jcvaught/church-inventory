import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
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
