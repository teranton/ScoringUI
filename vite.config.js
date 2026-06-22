import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Ohjataan kaikki selainpuolen /api -haut Vercelin backend-porttiin
      '/api': {
        target: 'http://localhost:3000', // Vercel dev -pääportti
        changeOrigin: true,
        secure: false,
      }
    }
  }
})