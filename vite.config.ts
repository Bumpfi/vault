import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // The largest chunk is hls.js (~500 KB), which is only loaded on demand.
  build: { chunkSizeWarningLimit: 600 },
  plugins: [
    tailwindcss(),
    tanstackStart({
      importProtection: {
        // src/server holds database access, secrets and Node-only code. Fail
        // the build if any of it would end up in the browser bundle. (Server
        // functions may import it inside their handlers; those are stripped.)
        client: { files: ['**/*.server.*', '**/src/server/**'] },
      },
    }),
    // Emits a standalone Node server to .output/server/index.mjs.
    nitroV2Plugin({ compatibilityDate: '2026-10-01' }),
    viteReact(),
  ],
})
