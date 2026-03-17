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
        globIgnores: ['**/mammoth-*.js', '**/sampleData-*.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
            },
          },
        ],
      },
    }),
  ],
  build: {
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
