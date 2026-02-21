import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const WINDMILL = env.WINDMILL_BASE_URL || 'https://flowmill.fastactionclaims.com';

  return {
    server: {
      allowedHosts: ['rowanroseclaims.co.uk'],
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        // ── Windmill static assets (served directly, bypasses Express) ──
        '/_app': { target: WINDMILL, changeOrigin: true, secure: true },
        '/logo.svg': { target: WINDMILL, changeOrigin: true, secure: true },

        // ── Windmill SPA entry — served by Express (injects URL fix) ──
        '/wm': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },

        // ── CRM backend (handles both CRM routes + Windmill API fallback) ──
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
        '/send-email': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
    preview: {
      allowedHosts: ['rowanroseclaims.co.uk'],
    },
    appType: 'spa',
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
