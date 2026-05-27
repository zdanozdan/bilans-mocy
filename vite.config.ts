import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { projectFileApiPlugin } from './vite-plugin-project-file'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), projectFileApiPlugin()],
})
