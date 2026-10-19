import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Mobiilikirjauksen testityökalut: päällä esikatselussa ja paikallisesti, pois tuotannosta (VERCEL_ENV=production).
    __KIRJAUS_TESTIVERSIO__: JSON.stringify(process.env.VERCEL_ENV !== 'production')
  },
  build: {
    rollupOptions: {
      // Mobiilikirjaus on oma sivunsa (kirjaus.html), jotta julkisen sovelluksen paketti ei kasva.
      input: {
        main: 'index.html',
        kirjaus: 'kirjaus.html'
      }
    }
  },
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