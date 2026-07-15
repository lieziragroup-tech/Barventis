import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) return 'vendor-react';
          if (id.includes('node_modules/@supabase')) return 'vendor-supabase';
          if (id.includes('node_modules/recharts')) return 'vendor-charts';
          if (id.includes('node_modules/xlsx')) return 'vendor-xlsx';
          if (id.includes('node_modules/framer-motion')) return 'vendor-motion';
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },

  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@supabase/supabase-js',
      'lucide-react',
      'xlsx',
    ],
  },

  server: {
    port: 5173,
    hmr: { overlay: true },
  },
});
