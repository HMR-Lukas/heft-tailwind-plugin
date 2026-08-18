import path from 'node:path'

export interface ITailwindPluginOptions {
  input?: string
  optimize?: boolean
  output?: string
  preflight?: boolean
  prefix?: string
  projectBase?: string
  sourceGlobs?: string[]
}

export interface IResolvedTailwindOptions {
  inputPath: string
  optimize: boolean
  outputPath: string
  preflight: boolean
  prefix: string
  projectBase: string
  sourceGlobs: string[]
}

export const DEFAULT_INPUT: string = 'src/global.tailwind.css'
export const DEFAULT_OUTPUT: string = 'src/global.css'
export const DEFAULT_SOURCE_GLOBS: string[] = ['src/**/*.{ts,tsx,js,jsx,html}']

export function resolveOptions(
  buildFolderPath: string,
  production: boolean,
  options: ITailwindPluginOptions = {},
): IResolvedTailwindOptions {
  const projectBase: string = options.projectBase
    ? path.resolve(buildFolderPath, options.projectBase)
    : buildFolderPath
  const inputPath: string = path.resolve(projectBase, options.input ?? DEFAULT_INPUT)
  const outputPath: string = path.resolve(projectBase, options.output ?? DEFAULT_OUTPUT)
  const prefix: string = options.prefix?.trim() ?? ''

  if (inputPath === outputPath) {
    throw new Error('Tailwind input and output must be different files.')
  }

  if (!/^[a-z]*$/.test(prefix)) {
    throw new Error('Tailwind prefix must contain lowercase ASCII letters only.')
  }

  return {
    inputPath,
    optimize: options.optimize ?? production,
    outputPath,
    preflight: options.preflight ?? false,
    prefix,
    projectBase,
    sourceGlobs: [...(options.sourceGlobs ?? DEFAULT_SOURCE_GLOBS)],
  }
}
