import { defineConfig } from 'tsdown'
import type { UserConfig } from 'tsdown'

const config: UserConfig = defineConfig({
  clean: true,
  dts: true,
  entry: {
    TailwindPlugin: 'src/TailwindPlugin.ts',
    cli: 'src/cli.ts',
  },
  format: 'cjs',
  platform: 'node',
  target: 'node22',
})

export default config
