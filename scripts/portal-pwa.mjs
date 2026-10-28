import { readFileSync } from 'node:fs';

// Emit installation metadata only in the player build, never the admin panel.
export function portalPwaPlugin(mode) {
  // Match src/lib.ts: only mode "admin" is the panel. Vite's default
  // production build is also the player portal and needs its manifest.
  if (mode === 'admin') return null;
  const files = new Map([
    ['manifest.webmanifest', 'application/manifest+json'],
    ['icon-panda-192.png', 'image/png'],
    ['icon-panda-512.png', 'image/png'],
    ['icon-panda-master.png', 'image/png'],
    ['icon-panda-maskable-512.png', 'image/png'],
    ['apple-touch-icon-panda.png', 'image/png'],
    ['sw.js', 'text/javascript'],
  ].map(([name, type]) => [`/pwa/${name}`, {
    type, source: readFileSync(new URL(`../src/pwa/${name}`, import.meta.url)),
  }]));
  const worker = files.get('/pwa/sw.js');
  files.delete('/pwa/sw.js');
  files.set('/sw.js', worker);
  return {
    name: 'player-portal-install',
    transformIndexHtml() {
      return [
        { tag: 'link', attrs: { rel: 'manifest', href: '/pwa/manifest.webmanifest' }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'icon', type: 'image/png', href: '/pwa/icon-panda-192.png?v=violet-1' }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: '/pwa/apple-touch-icon-panda.png?v=violet-1' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: 'GANA777' }, injectTo: 'head' },
      ];
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const asset = files.get((req.url ?? '').split('?')[0]);
        if (!asset) return next();
        res.setHeader('Content-Type', asset.type);
        res.end(asset.source);
      });
    },
    generateBundle() {
      for (const [url, asset] of files) {
        this.emitFile({ type: 'asset', fileName: url.slice(1), source: asset.source });
      }
    },
  };
}
