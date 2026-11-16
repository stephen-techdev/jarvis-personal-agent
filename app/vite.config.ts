import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path must match the GitHub repository name for GitHub Pages project sites.
// If you rename the repo, change this value (and the Pages URL follows).
export default defineConfig({
  plugins: [react()],
  base: '/jarvis-personal-agent/',
  server: { host: true },
})
