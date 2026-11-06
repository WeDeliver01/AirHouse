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
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('recharts') || id.includes('d3-')) return 'charts'
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify')) return 'pdf'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('@sentry')) return 'monitoring'
          if (id.includes('react-router')) return 'router'
          if (id.includes('react-dom') || id.includes('/react/')) return 'react'
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
