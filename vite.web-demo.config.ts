import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(__dirname, 'web-demo'),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'web-demo-dist'),
    emptyOutDir: true,
    sourcemap: true,
  },
})
