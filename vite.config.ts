import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// TODO: Add rollup-plugin-visualizer for CI bundle analysis
// import { visualizer } from 'rollup-plugin-visualizer';
// Then add visualizer({ filename: 'dist/stats.html' }) to the plugins array.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: false,
      includeAssets: ['favicon.ico'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/sampleData-*.js'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          // AI API calls must never be cached — use NetworkOnly
          {
            urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/api\.anthropic\.com\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/api\.openai\.com\//,
            handler: 'NetworkOnly',
          },
          // Static assets — CacheFirst with long expiration
          {
            urlPattern: /\.(?:js|css|woff2?|png|svg|ico|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          // Navigation requests — NetworkFirst for freshness
          {
            urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'navigation-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    modulePreload: { polyfill: true },
    chunkSizeWarningLimit: 510,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/@dnd-kit')) {
            return 'dnd-kit';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'lucide-icons';
          }
          if (id.includes('node_modules/mammoth')) {
            return 'mammoth';
          }
          if (id.includes('/src/provider') || id.includes('/src/transform')) {
            return 'provider-transform';
          }
          if (id.includes('/src/i18n')) {
            return 'i18n';
          }
          if (id.includes('/src/storage')) {
            return 'storage';
          }
        },
      },
    },
  },
})
