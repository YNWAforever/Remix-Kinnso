import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Resolve the "@/..." alias the same way tsconfig does (paths: { "@/*": ["./*"] }),
// so tests can import app modules (e.g. "@/lib/articles/queries").
const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: { '@': root },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
})
