import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  HeftConfiguration,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions,
  IHeftTaskSession,
} from '@rushstack/heft'
import { afterEach, describe, expect, it } from 'vitest'
import TailwindPlugin from '../src/TailwindPlugin'
import { createTailwindProject } from './helpers'

const temporaryDirectories: string[] = []

afterEach(async (): Promise<void> => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory: string) =>
      fs.rm(directory, { force: true, recursive: true }),
    ),
  )
})

describe('TailwindPlugin', (): void => {
  it('registers run and incremental hooks with the expected watcher', async (): Promise<void> => {
    const root: string = await createTailwindProject('plugin-watch')
    temporaryDirectories.push(root)
    let runCallback: ((options: IHeftTaskRunHookOptions) => Promise<void>) | undefined
    let incrementalCallback:
      | ((options: IHeftTaskRunIncrementalHookOptions) => Promise<void>)
      | undefined
    const logLines: string[] = []
    const taskSession = {
      hooks: {
        run: {
          tapPromise: (
            _name: string,
            callback: (options: IHeftTaskRunHookOptions) => Promise<void>,
          ): void => {
            runCallback = callback
          },
        },
        runIncremental: {
          tapPromise: (
            _name: string,
            callback: (options: IHeftTaskRunIncrementalHookOptions) => Promise<void>,
          ): void => {
            incrementalCallback = callback
          },
        },
      },
      logger: {
        terminal: {
          writeLine: (line: string): void => {
            logLines.push(line)
          },
        },
      },
      parameters: { production: false },
    } as unknown as IHeftTaskSession

    new TailwindPlugin().apply(
      taskSession,
      { buildFolderPath: root } as HeftConfiguration,
      {},
    )

    expect(runCallback).toBeTypeOf('function')
    expect(incrementalCallback).toBeTypeOf('function')

    const watchCalls: Array<{ ignore: string[] | undefined; patterns: string | string[] }> = []
    const runOptions = {
      abortSignal: new AbortController().signal,
      globAsync: async (): Promise<string[]> => [],
      requestRun: (): void => undefined,
      watchFs: {},
      watchGlobAsync: async (patterns: string | string[], options?: { ignore?: string[] }) => {
        watchCalls.push({ ignore: options?.ignore, patterns })
        return new Map()
      },
    } as unknown as IHeftTaskRunIncrementalHookOptions

    await incrementalCallback!(runOptions)
    await incrementalCallback!(runOptions)

    expect(watchCalls).toHaveLength(2)
    expect(watchCalls[0]?.patterns).toEqual([
      'src/**/*.{ts,tsx,js,jsx,html}',
      'src/global.tailwind.css',
    ])
    expect(watchCalls[0]?.ignore).toEqual(['src/global.css'])
    await expect(fs.readFile(path.join(root, 'src', 'global.css'), 'utf8')).resolves.toContain(
      '.flex',
    )
    expect(logLines).toEqual(['Wrote src/global.css'])
  })
})
