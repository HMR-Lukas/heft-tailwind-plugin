import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { compileTailwind } from '../src/compiler'
import { resolveOptions } from '../src/options'
import { createTailwindProject } from './helpers'

const temporaryDirectories: string[] = []
const signal: AbortSignal = new AbortController().signal

async function project(name: string, className?: string): Promise<string> {
  const root: string = await createTailwindProject(name, className)
  temporaryDirectories.push(root)
  return root
}

afterEach(async (): Promise<void> => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory: string) =>
      fs.rm(directory, { force: true, recursive: true }),
    ),
  )
})

describe.sequential('compileTailwind', (): void => {
  it('performs an initial build without Preflight', async (): Promise<void> => {
    const root: string = await project('initial-build')
    const result = await compileTailwind(resolveOptions(root, false), signal)

    expect(result.written).toBe(true)
    expect(result.css).toContain('.flex')
    expect(result.css).not.toContain('box-sizing: border-box')
  })

  it('adds and removes classes on subsequent builds', async (): Promise<void> => {
    const root: string = await project('class-changes')
    const sourcePath: string = path.join(root, 'src', 'component.tsx')
    const options = resolveOptions(root, false)

    await compileTailwind(options, signal)
    await fs.writeFile(sourcePath, "export const className = 'text-red-500'\n", 'utf8')
    const added = await compileTailwind(options, signal)
    expect(added.css).toContain('.text-red-500')
    expect(added.css).not.toContain('.flex {')

    await fs.writeFile(sourcePath, "export const className = 'block'\n", 'utf8')
    const removed = await compileTailwind(options, signal)
    expect(removed.css).toContain('.block')
    expect(removed.css).not.toContain('.text-red-500')
  })

  it('rebuilds after the input CSS changes', async (): Promise<void> => {
    const root: string = await project('input-change')
    const options = resolveOptions(root, false)
    await compileTailwind(options, signal)

    await fs.appendFile(options.inputPath, '\n.fixture-rule { color: red; }\n', 'utf8')
    const result = await compileTailwind(options, signal)
    expect(result.css).toContain('.fixture-rule')
  })

  it('detects classes in a new source file', async (): Promise<void> => {
    const root: string = await project('new-source')
    const options = resolveOptions(root, false)
    await compileTailwind(options, signal)

    await fs.writeFile(path.join(root, 'src', 'new-template.html'), '<div class="grid"></div>\n')
    const result = await compileTailwind(options, signal)
    expect(result.css).toContain('.grid')
  })

  it('minifies production output', async (): Promise<void> => {
    const root: string = await project('production')
    const development = await compileTailwind(resolveOptions(root, false), signal)
    const production = await compileTailwind(resolveOptions(root, true), signal)

    expect(production.css.length).toBeLessThan(development.css.length)
    expect(production.css).not.toContain('\n  ')
  })

  it('does not rewrite unchanged output', async (): Promise<void> => {
    const root: string = await project('unchanged')
    const options = resolveOptions(root, false)
    await compileTailwind(options, signal)
    const before = await fs.stat(options.outputPath)

    await new Promise<void>((resolve: () => void) => {
      setTimeout(resolve, 30)
    })
    const result = await compileTailwind(options, signal)
    const after = await fs.stat(options.outputPath)

    expect(result.written).toBe(false)
    expect(after.mtimeMs).toBe(before.mtimeMs)
  })

  it('does not write after a build abort', async (): Promise<void> => {
    const root: string = await project('abort')
    const options = resolveOptions(root, false)
    await fs.writeFile(options.outputPath, 'existing output\n', 'utf8')
    const controller = new AbortController()
    controller.abort()

    await expect(compileTailwind(options, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    await expect(fs.readFile(options.outputPath, 'utf8')).resolves.toBe('existing output\n')
  })

  it('supports project paths containing spaces', async (): Promise<void> => {
    const root: string = await project('path with spaces')
    const result = await compileTailwind(resolveOptions(root, false), signal)
    expect(result.css).toContain('.flex')
  })

  it('recovers after malformed CSS is fixed', async (): Promise<void> => {
    const root: string = await project('css-recovery')
    const options = resolveOptions(root, false)
    await fs.writeFile(options.inputPath, '@import "tailwindcss";\n.broken {', 'utf8')

    await expect(compileTailwind(options, signal)).rejects.toThrow()
    await fs.writeFile(options.inputPath, '@import "tailwindcss";\n.recovered { color: green; }\n')
    const result = await compileTailwind(options, signal)
    expect(result.css).toContain('.recovered')
  })

  it('applies Prefix and optional Preflight imports', async (): Promise<void> => {
    const root: string = await project('prefix-preflight')
    await fs.writeFile(
      path.join(root, 'src', 'component.tsx'),
      "export const className = 'tw:flex'\n",
      'utf8',
    )
    const options = resolveOptions(root, false, { prefix: 'tw', preflight: true })
    const result = await compileTailwind(options, signal)

    expect(result.css).toContain('.tw\\:flex')
    expect(result.css).toContain('box-sizing: border-box')
  })
})
