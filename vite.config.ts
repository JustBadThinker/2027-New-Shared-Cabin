import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
        manifest: {
          name: 'Boat Cabin Template Generator',
          short_name: 'BoatGen',
          description: 'Generate templates for boat cabins and charters offline.',
          theme_color: '#ffffff',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        }
      }),
      {
        name: 'image-proxy-middleware',
        configureServer(server) {
          const handleProxy = async (req: any, res: any) => {
            try {
              const reqUrl = new URL(req.url || '', 'http://localhost:3000');
              const targetUrl = reqUrl.searchParams.get('url');
              const fileId = reqUrl.searchParams.get('id');
              const authHeader = req.headers['authorization'];

              const headers: Record<string, string> = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              };
              if (authHeader) {
                headers['Authorization'] = authHeader;
              }

              let upstream: Response | null = null;

              // 1. If fileId and authHeader, fetch media directly from Drive API
              if (fileId && authHeader) {
                try {
                  const mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers });
                  const ct = mediaRes.headers.get('content-type') || '';
                  if (mediaRes.ok && !ct.startsWith('text/html')) {
                    upstream = mediaRes;
                  }
                } catch (_) {}
              }

              // 2. If targetUrl is provided and not drive html, try fetching it
              if (!upstream && targetUrl) {
                try {
                  const tRes = await fetch(targetUrl, { headers });
                  const ct = tRes.headers.get('content-type') || '';
                  if (tRes.ok && (ct.startsWith('image/') || ct.startsWith('application/octet-stream'))) {
                    upstream = tRes;
                  }
                } catch (_) {}
              }

              // 3. Try high-performance image proxies if direct fetch didn't return image
              if (!upstream && targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
                try {
                  const wsrv = await fetch(`https://wsrv.nl/?url=${encodeURIComponent(targetUrl)}`);
                  const ct = wsrv.headers.get('content-type') || '';
                  if (wsrv.ok && ct.startsWith('image/')) {
                    upstream = wsrv;
                  }
                } catch (_) {}
              }

              // 4. Try drive thumbnail or lh3 with auth
              if (!upstream && fileId) {
                const candidates = [
                  `https://lh3.googleusercontent.com/d/${fileId}`,
                  `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`
                ];
                for (const u of candidates) {
                  try {
                    const cRes = await fetch(u, { headers });
                    const ct = cRes.headers.get('content-type') || '';
                    if (cRes.ok && ct.startsWith('image/')) {
                      upstream = cRes;
                      break;
                    }
                  } catch (_) {}
                }
              }

              if (!upstream || !upstream.ok) {
                res.statusCode = 404;
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end('Image not found or inaccessible');
                return;
              }

              const contentType = upstream.headers.get('content-type') || 'image/jpeg';
              const arrayBuffer = await upstream.arrayBuffer();

              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', '*');
              res.setHeader('Content-Type', contentType);
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.end(Buffer.from(arrayBuffer));
            } catch (e: any) {
              res.statusCode = 500;
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(e?.message || 'Proxy failure');
            }
          };

          server.middlewares.use('/api/proxy-image', handleProxy);
        },
        configurePreviewServer(server) {
          const handleProxy = async (req: any, res: any) => {
            try {
              const reqUrl = new URL(req.url || '', 'http://localhost:3000');
              const targetUrl = reqUrl.searchParams.get('url');
              const fileId = reqUrl.searchParams.get('id');
              const authHeader = req.headers['authorization'];

              const headers: Record<string, string> = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              };
              if (authHeader) {
                headers['Authorization'] = authHeader;
              }

              let upstream: Response | null = null;

              if (fileId && authHeader) {
                try {
                  const mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers });
                  const ct = mediaRes.headers.get('content-type') || '';
                  if (mediaRes.ok && !ct.startsWith('text/html')) {
                    upstream = mediaRes;
                  }
                } catch (_) {}
              }

              if (!upstream && targetUrl) {
                try {
                  const tRes = await fetch(targetUrl, { headers });
                  const ct = tRes.headers.get('content-type') || '';
                  if (tRes.ok && (ct.startsWith('image/') || ct.startsWith('application/octet-stream'))) {
                    upstream = tRes;
                  }
                } catch (_) {}
              }

              if (!upstream && targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
                try {
                  const wsrv = await fetch(`https://wsrv.nl/?url=${encodeURIComponent(targetUrl)}`);
                  const ct = wsrv.headers.get('content-type') || '';
                  if (wsrv.ok && ct.startsWith('image/')) {
                    upstream = wsrv;
                  }
                } catch (_) {}
              }

              if (!upstream && fileId) {
                const candidates = [
                  `https://lh3.googleusercontent.com/d/${fileId}`,
                  `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`
                ];
                for (const u of candidates) {
                  try {
                    const cRes = await fetch(u, { headers });
                    const ct = cRes.headers.get('content-type') || '';
                    if (cRes.ok && ct.startsWith('image/')) {
                      upstream = cRes;
                      break;
                    }
                  } catch (_) {}
                }
              }

              if (!upstream || !upstream.ok) {
                res.statusCode = 404;
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end('Image not found or inaccessible');
                return;
              }

              const contentType = upstream.headers.get('content-type') || 'image/jpeg';
              const arrayBuffer = await upstream.arrayBuffer();

              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', '*');
              res.setHeader('Content-Type', contentType);
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.end(Buffer.from(arrayBuffer));
            } catch (e: any) {
              res.statusCode = 500;
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(e?.message || 'Proxy failure');
            }
          };

          server.middlewares.use('/api/proxy-image', handleProxy);
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      sourcemap: false,
      minify: 'esbuild',
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      headers: {
        'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
      },
    },
    preview: {
      headers: {
        'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
      },
    },
  };
});
