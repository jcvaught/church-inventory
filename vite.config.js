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
          'vendor-firebase': [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
            'firebase/storage',
            'firebase/functions',
          ],
        },
      },
    },
  },
});
