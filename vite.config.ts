import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Source-map upload runs only in environments where SENTRY_AUTH_TOKEN is
// present (CI deploy, or a manual build with the token exported). Local dev
// and PR-CI build the bundle with `sourcemap: 'hidden'` and skip the upload.
// `disable: true` also leaves the .map files in dist/ instead of deleting
// them, so a developer can still source-map locally.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Nido - Control de Gastos',
        short_name: 'Nido',
        description: 'Control de gastos para parejas',
        // warm "hogar cálido" palette: paper for the browser/splash chrome
        theme_color: '#F4EDE1',
        background_color: '#F4EDE1',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      }
    }),
    sentryVitePlugin({
      org: 'sssamuelll',
      // PLACEHOLDER: adjust to match the project slug Samuel creates in Sentry.
      // The plugin is disabled when SENTRY_AUTH_TOKEN is unset, so this value
      // is only consulted at upload time.
      project: 'nido-client',
      authToken: sentryAuthToken,
      sourcemaps: {
        assets: './dist/client/**',
        filesToDeleteAfterUpload: './dist/client/**/*.map',
      },
      disable: !sentryAuthToken,
      silent: !sentryAuthToken,
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3100',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist/client',
    // 'hidden' emits .map files (so Sentry can upload them) without writing
    // the //# sourceMappingURL comment into the JS bundle — source stays out
    // of devtools for end users.
    sourcemap: 'hidden',
  }
})
