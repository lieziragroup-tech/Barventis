import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@supabase/supabase-js',
      'lucide-react',
      'xlsx',
      'canvas-confetti'
    ],
  },
  server: {
    hmr: { overlay: true },
  },
});


