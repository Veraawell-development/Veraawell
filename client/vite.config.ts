import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import removeConsole from 'vite-plugin-remove-console'

// https://vite.dev/config/
// Production builds drop console.log/debug noise. console.info is kept for
// the one deliberate banner in main.tsx; warn/error stay for real problems.
export default defineConfig({
  plugins: [react(), tailwindcss(), removeConsole({ includes: ['log', 'debug'] })],
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

