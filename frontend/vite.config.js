import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    //host: '0.0.0.0', // Importante para aceitar conexões no container
    port: 80, // Porta padrão do Vite
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // Usando o nome do serviço do Docker Compose
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    },
  },
})
