import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import type { IncomingMessage } from 'node:http';

/**
 * Development only: serve the Netlify Functions under /api/* from the Vite
 * dev server, so `npm run dev` works end-to-end (live OpenStreetMap data)
 * without the Netlify CLI. In production, Netlify routes /api/* to the
 * functions via each function's `config.path`.
 */
function apiDevServer(): Plugin {
  const routes: Record<string, string> = {
    '/api/places': '/netlify/functions/places.ts',
    '/api/geocode': '/netlify/functions/geocode.ts',
    '/api/ai-search': '/netlify/functions/ai-search.ts',
    '/api/internal/refresh-places': '/netlify/functions/refresh-places-background.ts',
    '/api/health': '/netlify/functions/health.ts',
  };
  const readBody = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > 64_000) reject(new Error('too large'));
        else chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  return {
    name: 'third-place-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (!path.startsWith('/api/')) return next();
        const file = routes[path];
        res.setHeader('Content-Type', 'application/json');
        if (!file) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: { code: 'not_found', message: 'Unknown API route.', retryable: false } }));
          return;
        }
        try {
          const mod = (await server.ssrLoadModule(file)) as { default: (r: Request) => Promise<Response | void> };
          const raw = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
          const body = raw ? new Uint8Array(raw) : undefined;
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const result = await mod.default(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body }));
          const response = result instanceof Response ? result : new Response(null, { status: 202 });
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          server.config.logger.error(`[api] ${(e as Error).message}`);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: { code: 'internal_error', message: 'Dev API error (see terminal).', retryable: true } }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Make server-only variables from .env files visible to the dev API (never to the browser bundle).
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) if (!k.startsWith('VITE_') && process.env[k] === undefined) process.env[k] = v;
  // Dev only: no 10 s function limit locally, and a disk cache that survives restarts.
  process.env.PLACES_BUDGET_MS ??= '24000';
  process.env.THIRD_PLACE_DEV_CACHE_DIR ??= fileURLToPath(new URL('./node_modules/.cache/third-place', import.meta.url));

  return {
    plugins: [react(), apiDevServer()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            supabase: ['@supabase/supabase-js'],
          },
        },
      },
    },
  };
});
