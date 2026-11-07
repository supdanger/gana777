import { defineConfig } from 'vite';
import { portalPwaPlugin } from './scripts/portal-pwa.mjs';

export default defineConfig(({ mode }) => ({
  plugins: [portalPwaPlugin(mode)],
  build: {
    rollupOptions: {
      output: {
        // Stable dependencies can stay in the browser cache across app changes.
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return;
          if (id.includes('/@supabase/')) return 'supabase-client';
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor';
          if (id.includes('/lucide-react/')) return 'icons';
        },
      },
    },
  },
}));
