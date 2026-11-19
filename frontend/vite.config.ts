import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// A API (FastAPI) roda em http://localhost:8000. O proxy evita CORS no desenvolvimento.
const API = process.env.ECO_API ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': API,
      '/imagens': API,
    },
  },
  preview: {
    proxy: {
      '/api': API,
      '/imagens': API,
    },
  },
})
