import path from 'node:path'
import type {
  HeftConfiguration,
  IHeftTaskPlugin,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions,
  IHeftTaskSession,
} from '@rushstack/heft'
import { compileTailwind } from './compiler'
import {
  type IResolvedTailwindOptions,
  type ITailwindPluginOptions,
  resolveOptions,
} from './options'

const PLUGIN_NAME: string = 'tailwind-plugin'

function slash(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

function relativePath(projectBase: string, filePath: string): string {
  return slash(path.relative(projectBase, filePath))
}

export default class TailwindPlugin implements IHeftTaskPlugin<ITailwindPluginOptions> {
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: ITailwindPluginOptions = {},
  ): void {
    const options: IResolvedTailwindOptions = resolveOptions(
      heftConfiguration.buildFolderPath,
      taskSession.parameters.production,
      pluginOptions,
    )
    let hasRunIncremental: boolean = false

    const runAsync = async ({ abortSignal }: IHeftTaskRunHookOptions): Promise<void> => {
      const result = await compileTailwind(options, abortSignal)
      const output: string = relativePath(options.projectBase, options.outputPath)
      taskSession.logger.terminal.writeLine(
        result.written ? `Wrote ${output}` : `Unchanged ${output}`,
      )
    }

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, runAsync)
    taskSession.hooks.runIncremental.tapPromise(
      PLUGIN_NAME,
      async (runOptions: IHeftTaskRunIncrementalHookOptions): Promise<void> => {
        const output: string = relativePath(options.projectBase, options.outputPath)
        const input: string = relativePath(options.projectBase, options.inputPath)
        const changedFiles = await runOptions.watchGlobAsync(
          [...options.sourceGlobs, input],
          {
            absolute: true,
            cwd: options.projectBase,
            ignore: [output],
          },
        )

        if (hasRunIncremental && changedFiles.size === 0) {
          return
        }

        await runAsync(runOptions)
        hasRunIncremental = true
      },
    )
  }
}

export type { ITailwindPluginOptions } from './options'
