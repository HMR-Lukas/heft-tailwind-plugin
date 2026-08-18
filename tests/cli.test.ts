import packageJson from '../package.json'
import { describe, expect, it, vi } from 'vitest'
import { getPackageVersion, runCli } from '../src/cli'

describe('CLI', (): void => {
  it('reports the installed package version', async (): Promise<void> => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runCli(['--version'])

    expect(getPackageVersion()).toBe(packageJson.version)
    expect(write).toHaveBeenCalledWith(`${packageJson.version}\n`)
    write.mockRestore()
  })
})
