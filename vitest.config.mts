import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const emptyStub = fileURLToPath(new URL('./tests/stubs/empty.ts', import.meta.url))

// Node 25 turned on Web Storage by default. Its localStorage global has no methods without
// --localstorage-file, shadows jsdom's, and makes every worker warn "`--localstorage-file` was
// provided without a valid path". Off in the test workers, so the suite sees jsdom's storage as it
// does on Node 24 in CI. Node 22 and 24 have no such global, so they get no flag.
const nodeMajor = Number(process.versions.node.split('.')[0])

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The `@/*` alias from tsconfig.json.
    tsconfigPaths: true,
    alias: {
      'server-only': emptyStub,
      'client-only': emptyStub,
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    execArgv: nodeMajor >= 25 ? ['--no-experimental-webstorage'] : [],
  },
})
