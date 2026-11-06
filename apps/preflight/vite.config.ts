import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Preflight origin. Three entries share this origin so the handoff window can read
// first-party Preflight storage and talk to the slot frame.
//   /            hygiene app (not frameable)
//   /slot.html   sponsored slot frame (frameable only by registered publishers)
//   /handoff.html user-initiated preference handoff (top-level window)
// The same headers are declared in vercel.json for deployed builds.
const PUBLISHER_ORIGINS = (process.env.PREFLIGHT_PUBLISHER_ORIGINS ?? 'http://localhost:5174').split(',');

function frameHeaders(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const path = (req.url ?? '/').split('?')[0];
  if (path === '/slot.html') {
    res.setHeader('Content-Security-Policy', `frame-ancestors ${PUBLISHER_ORIGINS.join(' ')}`);
  } else if (path === '/' || path === '/index.html' || path === '/handoff.html') {
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    res.setHeader('X-Frame-Options', 'DENY');
  }
  next();
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'preflight-frame-headers',
      configureServer(server) {
        server.middlewares.use(frameHeaders);
      },
      configurePreviewServer(server) {
        server.middlewares.use(frameHeaders);
      },
    },
  ],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  preview: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        slot: resolve(import.meta.dirname, 'slot.html'),
        handoff: resolve(import.meta.dirname, 'handoff.html'),
      },
    },
  },
});
