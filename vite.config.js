import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-charts':   ['recharts'],
          'vendor-xlsx':     ['xlsx'],
        },
      },
    },
    minify: 'esbuild',
    chunkSizeWarningLimit: 600,
  },

  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@supabase/supabase-js',
      'lucide-react',
      'xlsx',
      'canvas-confetti',
    ],
  },

  server: {
    port: 5173,
    hmr: { overlay: true },
  },
});