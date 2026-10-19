import { defineConfig } from 'vite';
import { portalPwaPlugin } from './scripts/portal-pwa.mjs';

export default defineConfig(({ mode }) => ({ plugins: [portalPwaPlugin(mode)] }));
