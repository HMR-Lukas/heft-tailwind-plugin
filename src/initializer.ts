import fs from 'node:fs/promises'
import path from 'node:path'
import {
  applyEdits,
  modify,
  parse,
  printParseErrorCode,
  type FormattingOptions,
  type ParseError,
} from 'jsonc-parser'

const PACKAGE_NAME: string = '@hmr-lukas/heft-tailwind-plugin'
const PLUGIN_NAME: string = 'tailwind-plugin'
const INPUT_PATH: string = 'src/global.tailwind.css'
const OUTPUT_PATH: string = 'src/global.css'
const SPFX_RIG_PACKAGE_NAME: string = '@microsoft/spfx-web-build-rig'
const DEFAULT_HEFT_CONFIG: string = `{
  "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft.schema.json",
  "extends": "@microsoft/spfx-web-build-rig/profiles/default/config/heft.json"
}
`

export interface IInitializeOptions {
  cwd: string
  dryRun?: boolean
  log?: (message: string) => void
  preflight?: boolean
  prefix?: string
}

export interface IInitializeResult {
  changedFiles: string[]
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

function updateJson(
  source: string,
  jsonPath: (string | number)[],
  value: unknown,
  formattingOptions: FormattingOptions,
): string {
  return applyEdits(source, modify(source, jsonPath, value, { formattingOptions }))
}

function updateHeftConfig(
  source: string,
  options: Pick<IInitializeOptions, 'preflight' | 'prefix'>,
): string {
  const errors: ParseError[] = []
  const parsed = parse(source, errors, { allowTrailingComma: true, disallowComments: false }) as
    | Record<string, unknown>
    | undefined

  if (errors.length > 0 || !parsed || Array.isArray(parsed)) {
    const detail: string = errors
      .map((error: ParseError) => `${printParseErrorCode(error.error)} at offset ${error.offset}`)
      .join(', ')
    throw new Error(`Cannot update config/heft.json: ${detail || 'the root must be an object'}.`)
  }

  const formattingOptions: FormattingOptions = {
    eol: source.includes('\r\n') ? '\r\n' : '\n',
    insertSpaces: true,
    tabSize: 2,
  }
  const tasks = (
    (parsed.phasesByName as Record<string, unknown> | undefined)?.build as
      | Record<string, unknown>
      | undefined
  )?.tasksByName as Record<string, unknown> | undefined
  const existingTailwind = tasks?.tailwind as Record<string, unknown> | undefined
  const existingTaskPlugin = existingTailwind?.taskPlugin as Record<string, unknown> | undefined
  const existingOptions = (existingTaskPlugin?.options as Record<string, unknown> | undefined) ?? {}
  const pluginOptions: Record<string, unknown> = { ...existingOptions }

  if (options.prefix !== undefined) {
    pluginOptions.prefix = options.prefix
  }
  if (options.preflight !== undefined) {
    pluginOptions.preflight = options.preflight
  }

  let result: string = source
  result = updateJson(
    result,
    ['phasesByName', 'build', 'tasksByName', 'tailwind'],
    {
      ...existingTailwind,
      taskPlugin: {
        ...existingTaskPlugin,
        pluginPackage: PACKAGE_NAME,
        pluginName: PLUGIN_NAME,
        options: pluginOptions,
      },
    },
    formattingOptions,
  )

  const webpackTask = tasks?.webpack as Record<string, unknown> | undefined
  const dependencies = Array.isArray(webpackTask?.taskDependencies)
    ? (webpackTask.taskDependencies as unknown[]).filter(
        (dependency: unknown): dependency is string => typeof dependency === 'string',
      )
    : []
  if (!dependencies.includes('tailwind')) {
    dependencies.push('tailwind')
  }

  result = updateJson(
    result,
    ['phasesByName', 'build', 'tasksByName', 'webpack'],
    { ...webpackTask, taskDependencies: dependencies },
    formattingOptions,
  )
  return result.endsWith(formattingOptions.eol!) ? result : `${result}${formattingOptions.eol}`
}

function updateGitignore(source: string): string {
  const eol: string = source.includes('\r\n') ? '\r\n' : '\n'
  const entries: string[] = source.split(/\r?\n/)
  const hasOutput: boolean = entries.some(
    (entry: string) => entry.trim().replace(/^\//, '') === OUTPUT_PATH,
  )

  if (hasOutput) {
    return source
  }

  const separator: string = source.length > 0 && !source.endsWith('\n') ? eol : ''
  return `${source}${separator}${OUTPUT_PATH}${eol}`
}

function usesSpfxRig(source: string): boolean {
  const errors: ParseError[] = []
  const parsed = parse(source, errors, { allowTrailingComma: true, disallowComments: false }) as
    | Record<string, unknown>
    | undefined

  return errors.length === 0 && parsed?.rigPackageName === SPFX_RIG_PACKAGE_NAME
}

export async function initializeProject(options: IInitializeOptions): Promise<IInitializeResult> {
  const prefix: string | undefined = options.prefix?.trim()
  if (prefix !== undefined && !/^[a-z]*$/.test(prefix)) {
    throw new Error('Prefix must contain lowercase ASCII letters only.')
  }

  const log: (message: string) => void = options.log ?? (() => undefined)
  const configPath: string = path.join(options.cwd, 'config', 'heft.json')
  const rigPath: string = path.join(options.cwd, 'config', 'rig.json')
  const inputPath: string = path.join(options.cwd, INPUT_PATH)
  const gitignorePath: string = path.join(options.cwd, '.gitignore')
  const existingConfig: string | undefined = await readOptional(configPath)

  if (existingConfig === undefined) {
    const rigConfig: string | undefined = await readOptional(rigPath)
    if (rigConfig === undefined || !usesSpfxRig(rigConfig)) {
      throw new Error(
        'Neither config/heft.json nor an SPFx config/rig.json was found. Run this command from an SPFx project root.',
      )
    }
  }

  const nextConfig: string = updateHeftConfig(existingConfig ?? DEFAULT_HEFT_CONFIG, {
    preflight: options.preflight,
    prefix,
  })
  const existingInput: string | undefined = await readOptional(inputPath)
  const existingGitignore: string = (await readOptional(gitignorePath)) ?? ''
  const nextGitignore: string = updateGitignore(existingGitignore)
  const changes: Array<{ content: string; filePath: string }> = []

  if (nextConfig !== existingConfig) {
    changes.push({ content: nextConfig, filePath: configPath })
  }
  if (existingInput === undefined) {
    changes.push({ content: '@import "tailwindcss";\n', filePath: inputPath })
  }
  if (nextGitignore !== existingGitignore) {
    changes.push({ content: nextGitignore, filePath: gitignorePath })
  }

  for (const change of changes) {
    const relative: string = path.relative(options.cwd, change.filePath).replace(/\\/g, '/')
    log(`${options.dryRun ? 'Would update' : 'Updated'} ${relative}`)
    if (!options.dryRun) {
      await fs.mkdir(path.dirname(change.filePath), { recursive: true })
      await fs.writeFile(change.filePath, change.content, 'utf8')
    }
  }

  if (changes.length === 0) {
    log('Project is already configured.')
  }

  return {
    changedFiles: changes.map((change) =>
      path.relative(options.cwd, change.filePath).replace(/\\/g, '/'),
    ),
  }
}
