import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/liquid-glass-laminar-flow/',
  plugins: [react()],
})
