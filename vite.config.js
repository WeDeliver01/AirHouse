import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    // The application shipped as a single 1.7 MB chunk, so every visitor --
    // including an anonymous one landing on a lead-capture page -- downloaded
    // the admin dashboard, the charting library and the PDF generator before
    // anything rendered. Splitting the heavy, rarely-needed dependencies out
    // means they are fetched only by the pages that use them.
    rollupOptions: {
      output: {
        // Splitting by hand is easy to get wrong, and getting it wrong is not
        // a size regression -- it is a blank page.
        //
        // The previous rules matched React with `id.includes('/react/')`,
        // which left React's own dependencies (scheduler, and anything else
        // it reaches) in `vendor`. That made `react` import `vendor` while
        // `vendor` imported `react`: a cycle. ES modules in a cycle evaluate
        // one side before the other's exports are initialised, so a library
        // in `vendor` calling `React.memo` at module scope got `undefined`:
        //
        //   Uncaught TypeError: Cannot read properties of undefined (reading 'memo')
        //
        // and nothing rendered at all.
        //
        // Two rules keep that from recurring:
        //
        //   1. React, react-dom and scheduler ship together, so the React
        //      chunk depends on nothing outside itself.
        //   2. Only leaves get their own chunk -- heavy libraries the app
        //      imports but which nothing else here imports. Edges then point
        //      one way, from the leaf to React, and a cycle cannot form.
        //
        // scripts/check-bundle.mjs enforces this on every build.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          // The React runtime and everything it needs, in one chunk.
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-is)[\\/]/.test(id)) return 'react'

          // Leaves: imported by the app, importing only React.
          if (id.includes('recharts') || id.includes('d3-')) return 'charts'
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify')) return 'pdf'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('@sentry')) return 'monitoring'
          if (id.includes('react-router')) return 'router'

          return 'vendor'
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // `npm test` is the unit suite, and nothing here configured it, so vitest
  // fell back to its default glob -- which also matches e2e/*.spec.js. Loading
  // a Playwright spec under vitest throws "Playwright Test did not expect
  // test.describe() to be called here", so `npm test` exited non-zero even
  // with every unit test passing, and the CI quality gate was red on a green
  // suite. The journey tests have their own runner: `npm run test:e2e`.
  test: {
    include: ['{src,server,deploy,scripts}/**/*.{test,spec}.{js,jsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
  server: {
    port: 5000,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  }
})
