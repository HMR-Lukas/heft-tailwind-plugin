import fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
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
const SPFX_123_OUTPUT_PATH: string = 'src/tailwind.global.scss'
const SPFX_123_PREVIEW_OUTPUT_PATH: string = 'src/tailwind.global.css'
const SPFX_RIG_PACKAGE_NAME: string = '@microsoft/spfx-web-build-rig'
const DEFAULT_HEFT_CONFIG: string = `{
  "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft.schema.json",
  "extends": "@microsoft/spfx-web-build-rig/profiles/default/config/heft.json"
}
`

export interface IInitializeOptions {
  confirmUnsupportedVersion?: (version: string) => Promise<boolean>
  cwd: string
  dryRun?: boolean
  log?: (message: string) => void
  preflight?: boolean
  prefix?: string
}

export interface IInitializeResult {
  changedFiles: string[]
}

interface ISpfxVersion {
  major: number
  minor: number
  raw: string
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
  automaticOutputPath: string,
): { content: string; outputPath: string } {
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
  const configuredOutputPath: string | undefined =
    typeof existingOptions.output === 'string' ? existingOptions.output : undefined
  let outputPath: string = configuredOutputPath ?? automaticOutputPath

  if (
    automaticOutputPath !== OUTPUT_PATH &&
    (configuredOutputPath === undefined ||
      configuredOutputPath === OUTPUT_PATH ||
      configuredOutputPath === SPFX_123_PREVIEW_OUTPUT_PATH)
  ) {
    pluginOptions.output = automaticOutputPath
    outputPath = automaticOutputPath
  }

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

  const sassTask = tasks?.sass as Record<string, unknown> | undefined
  const sassDependencies = Array.isArray(sassTask?.taskDependencies)
    ? (sassTask.taskDependencies as unknown[]).filter(
        (dependency: unknown): dependency is string => typeof dependency === 'string',
      )
    : []
  if (!sassDependencies.includes('tailwind')) {
    sassDependencies.push('tailwind')
  }
  result = updateJson(
    result,
    ['phasesByName', 'build', 'tasksByName', 'sass'],
    { ...sassTask, taskDependencies: sassDependencies },
    formattingOptions,
  )

  return {
    content: result.endsWith(formattingOptions.eol!) ? result : `${result}${formattingOptions.eol}`,
    outputPath,
  }
}

function updateGitignore(source: string, outputPath: string): string {
  const eol: string = source.includes('\r\n') ? '\r\n' : '\n'
  const entries: string[] = source.split(/\r?\n/)
  const hasOutput: boolean = entries.some(
    (entry: string) => entry.trim().replace(/^\//, '') === outputPath,
  )

  if (hasOutput) {
    return source
  }

  const separator: string = source.length > 0 && !source.endsWith('\n') ? eol : ''
  return `${source}${separator}${outputPath}${eol}`
}

function parseSpfxVersion(value: unknown): ISpfxVersion | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const match: RegExpMatchArray | null = value.match(/(\d+)\.(\d+)(?:\.\d+)?/)
  if (!match?.[1] || !match[2]) {
    return undefined
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    raw: match[0],
  }
}

function readPackageVersion(source: string): ISpfxVersion | undefined {
  const errors: ParseError[] = []
  const parsed = parse(source, errors, { allowTrailingComma: true, disallowComments: false }) as
    | Record<string, unknown>
    | undefined
  if (errors.length > 0 || !parsed) {
    return undefined
  }

  const dependencies = parsed.dependencies as Record<string, unknown> | undefined
  const devDependencies = parsed.devDependencies as Record<string, unknown> | undefined
  return parseSpfxVersion(
    devDependencies?.[SPFX_RIG_PACKAGE_NAME] ?? dependencies?.[SPFX_RIG_PACKAGE_NAME],
  )
}

async function detectSpfxVersion(cwd: string): Promise<ISpfxVersion | undefined> {
  const installedPackageJson: string | undefined = await readOptional(
    path.join(cwd, 'node_modules', '@microsoft', 'spfx-web-build-rig', 'package.json'),
  )
  if (installedPackageJson !== undefined) {
    const errors: ParseError[] = []
    const parsed = parse(installedPackageJson, errors) as Record<string, unknown> | undefined
    const installedVersion: ISpfxVersion | undefined =
      errors.length === 0 ? parseSpfxVersion(parsed?.version) : undefined
    if (installedVersion) {
      return installedVersion
    }
  }

  const projectPackageJson: string | undefined = await readOptional(path.join(cwd, 'package.json'))
  return projectPackageJson === undefined ? undefined : readPackageVersion(projectPackageJson)
}

function requiresGlobalCssSuffix(version: ISpfxVersion | undefined): boolean {
  return version !== undefined && (version.major > 1 || (version.major === 1 && version.minor >= 23))
}

function isNewerThanSupported(version: ISpfxVersion): boolean {
  return version.major > 1 || (version.major === 1 && version.minor > 23)
}

async function findSourceFiles(directoryPath: string): Promise<string[]> {
  let entries: Dirent<string>[]
  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }

  const files: string[] = []
  for (const entry of entries) {
    const entryPath: string = path.join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await findSourceFiles(entryPath)))
    } else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
      files.push(entryPath)
    }
  }
  return files
}

function migrateOutputImport(
  source: string,
  sourceFilePath: string,
  projectBase: string,
  outputPath: string,
): string {
  const previousOutputPaths: Set<string> = new Set([
    path.resolve(projectBase, OUTPUT_PATH),
    path.resolve(projectBase, SPFX_123_PREVIEW_OUTPUT_PATH),
  ])
  const nextOutputPath: string = path.resolve(projectBase, outputPath)
  const importPattern: RegExp = /(\bimport\s+(?:[^'"\r\n]*?\s+from\s+)?)(['"])([^'"\r\n]+)(['"])/g

  return source.replace(
    importPattern,
    (statement: string, prefix: string, openQuote: string, specifier: string, closeQuote: string) => {
      if (
        openQuote !== closeQuote ||
        !specifier.startsWith('.') ||
        !previousOutputPaths.has(path.resolve(path.dirname(sourceFilePath), specifier))
      ) {
        return statement
      }

      let nextSpecifier: string = path
        .relative(path.dirname(sourceFilePath), nextOutputPath)
        .replace(/\\/g, '/')
      if (!nextSpecifier.startsWith('.')) {
        nextSpecifier = `./${nextSpecifier}`
      }
      return `${prefix}${openQuote}${nextSpecifier}${closeQuote}`
    },
  )
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

  const spfxVersion: ISpfxVersion | undefined = await detectSpfxVersion(options.cwd)
  if (spfxVersion && isNewerThanSupported(spfxVersion)) {
    log(
      `Warning: SPFx ${spfxVersion.raw} is newer than the supported versions 1.22.x and 1.23.x.`,
    )
    const shouldContinue: boolean =
      (await options.confirmUnsupportedVersion?.(spfxVersion.raw)) ?? false
    if (!shouldContinue) {
      log('Initialization cancelled; no files were changed.')
      return { changedFiles: [] }
    }
  }
  const automaticOutputPath: string = requiresGlobalCssSuffix(spfxVersion)
    ? SPFX_123_OUTPUT_PATH
    : OUTPUT_PATH
  const updatedConfig = updateHeftConfig(
    existingConfig ?? DEFAULT_HEFT_CONFIG,
    {
      preflight: options.preflight,
      prefix,
    },
    automaticOutputPath,
  )
  const nextConfig: string = updatedConfig.content
  const outputPath: string = updatedConfig.outputPath
  const existingInput: string | undefined = await readOptional(inputPath)
  const existingGitignore: string = (await readOptional(gitignorePath)) ?? ''
  const nextGitignore: string = updateGitignore(existingGitignore, outputPath)
  const changes: Array<{ content: string; filePath: string }> = []

  if (spfxVersion) {
    log(`Detected SPFx ${spfxVersion.raw}; using ${outputPath}.`)
  }

  if (nextConfig !== existingConfig) {
    changes.push({ content: nextConfig, filePath: configPath })
  }
  if (existingInput === undefined) {
    changes.push({ content: '@import "tailwindcss";\n', filePath: inputPath })
  }
  if (outputPath !== OUTPUT_PATH) {
    const sourceFiles: string[] = await findSourceFiles(path.join(options.cwd, 'src'))
    for (const sourceFilePath of sourceFiles) {
      const existingSource: string = await fs.readFile(sourceFilePath, 'utf8')
      const nextSource: string = migrateOutputImport(
        existingSource,
        sourceFilePath,
        options.cwd,
        outputPath,
      )
      if (nextSource !== existingSource) {
        changes.push({ content: nextSource, filePath: sourceFilePath })
      }
    }
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
