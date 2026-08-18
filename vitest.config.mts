import { defineConfig } from 'vitest/config'
import type { UserConfig } from 'vitest/config'

const config: UserConfig = defineConfig({
  test: {
    coverage: {
      reporter: ['text', 'html'],
    },
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
  },
})

export default config
