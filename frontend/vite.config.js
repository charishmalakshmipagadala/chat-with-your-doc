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
      // API_URL lets you point at a backend on another port (default 3001).
      '/api': process.env.API_URL || 'http://localhost:3001',
    },
  },
})
