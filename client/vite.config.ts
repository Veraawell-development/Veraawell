import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import removeConsole from 'vite-plugin-remove-console'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), removeConsole({ includes: ['log'] })],
  server: {
    proxy: {
      '/api': 'http://localhost:5001',
    },
    // Exclude Playwright output dirs from the file watcher to prevent
    // Vite from trying to process the test report HTML/CSS assets
    watch: {
      ignored: ['**/playwright-report/**', '**/test-results/**', '**/e2e/.auth/**'],
    },
  },
})

