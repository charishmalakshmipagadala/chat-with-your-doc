import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // During development, any request to /api/... is forwarded to our
    // Node backend (built on Day 2), so the browser never sees a different origin.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
