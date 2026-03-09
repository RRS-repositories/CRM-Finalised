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
    },
    build: {
      // === PERFORMANCE: Manual chunk splitting for optimal caching & parallel loading ===
      rollupOptions: {
        output: {
          manualChunks: {
            // React core - rarely changes, cached long-term
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            // Heavy UI libraries split into separate chunks
            'vendor-charts': ['recharts'],
            'vendor-editor': [
              '@tiptap/react', '@tiptap/starter-kit',
              '@tiptap/extension-color', '@tiptap/extension-text-style',
              '@tiptap/extension-underline', '@tiptap/extension-text-align',
              '@tiptap/extension-link', '@tiptap/extension-image',
              '@tiptap/extension-table', '@tiptap/extension-table-row',
              '@tiptap/extension-table-cell', '@tiptap/extension-table-header',
              '@tiptap/extension-font-family', '@tiptap/extension-highlight',
            ],
            'vendor-flow': ['reactflow'],
            // State management
            'vendor-state': ['zustand'],
            // Heavy data processing - only loaded when BulkImport or Documents used
            'vendor-excel': ['exceljs'],
          },
        },
      },
      // Target modern browsers for smaller output
      target: 'es2020',
      // Enable CSS code splitting
      cssCodeSplit: true,
      // Increase chunk size warning limit (our vendor chunks are intentionally large)
      chunkSizeWarningLimit: 800,
    },
  };
});
