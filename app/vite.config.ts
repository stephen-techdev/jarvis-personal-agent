import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path must match the GitHub repository name for GitHub Pages project sites.
// If you rename the repo, change this value (and the Pages URL follows).

/** Unique id for this build, embedded in the bundle and in version.json. */
const buildId = Date.now().toString(36)

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'jarvis-build-version',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ id: buildId, builtAt: new Date().toISOString() }),
        })
      },
    },
  ],
  base: '/jarvis-personal-agent/',
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  server: { host: true },
})
