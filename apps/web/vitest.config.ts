import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Resolve the "@/..." alias the same way tsconfig does (paths: { "@/*": ["./*"] }),
// so tests can import app modules (e.g. "@/lib/articles/queries").
const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': root,
      // `server-only` is a Next.js runtime marker not installed in this workspace;
      // alias it to an empty stub so tests that transitively import a server-only
      // module (e.g. the offers page → lib/missions/travelpayouts.ts) resolve.
      'server-only': fileURLToPath(new URL('./vitest.server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
