import fs from 'node:fs/promises'
import path from 'node:path'
import tailwindcss from '@tailwindcss/postcss'
import postcss, { type AtRule, type Plugin, type Root } from 'postcss'
import type { IResolvedTailwindOptions } from './options'

export interface ICompileResult {
  css: string
  written: boolean
}

const TAILWIND_IMPORT_PATTERN: RegExp = /^(?:url\()?['"]tailwindcss(?:\/[^'"]+)?['"]\)?(?:\s|$)/
const BUILD_MARKER: string = 'heft-tailwind-build:'
let buildSequence: number = 0

const removeBuildMarker: Plugin = {
  postcssPlugin: 'heft-tailwind-remove-build-marker',
  Once(root: Root): void {
    root.walkComments((comment): void => {
      if (comment.text.startsWith(BUILD_MARKER)) {
        comment.remove()
      }
    })
  },
}

function importRule(
  source: string,
  layer: string,
  prefix: string,
  modifier: string = '',
): AtRule {
  const prefixModifier: string = prefix ? ` prefix(${prefix})` : ''
  return postcss.atRule({
    name: 'import',
    params: `"tailwindcss/${source}.css" layer(${layer})${prefixModifier}${modifier}`,
  })
}

function sourceRule(
  sourceGlob: string,
  options: Pick<IResolvedTailwindOptions, 'inputPath' | 'projectBase'>,
): AtRule {
  const absoluteGlob: string = path.resolve(options.projectBase, sourceGlob)
  let relativeGlob: string = path
    .relative(path.dirname(options.inputPath), absoluteGlob)
    .replace(/\\/g, '/')
  if (!relativeGlob.startsWith('.')) {
    relativeGlob = `./${relativeGlob}`
  }
  return postcss.atRule({ name: 'source', params: JSON.stringify(relativeGlob) })
}

export function prepareTailwindInput(
  input: string,
  options: Pick<
    IResolvedTailwindOptions,
    'inputPath' | 'preflight' | 'prefix' | 'projectBase' | 'sourceGlobs'
  >,
  from: string,
): string {
  const root: Root = postcss.parse(input, { from })
  let firstTailwindImport: AtRule | undefined

  root.walkAtRules('import', (rule: AtRule) => {
    if (!TAILWIND_IMPORT_PATTERN.test(rule.params.trim())) {
      return
    }

    if (!firstTailwindImport) {
      firstTailwindImport = rule
      return
    }

    rule.remove()
  })

  if (!firstTailwindImport) {
    return root.toString()
  }

  const imports: AtRule[] = [
    postcss.atRule({ name: 'layer', params: 'theme, base, components, utilities' }),
    importRule('theme', 'theme', options.prefix),
  ]

  if (options.preflight) {
    imports.push(importRule('preflight', 'base', ''))
  }

  imports.push(importRule('utilities', 'utilities', options.prefix, ' source(none)'))
  imports.push(...options.sourceGlobs.map((sourceGlob: string) => sourceRule(sourceGlob, options)))
  firstTailwindImport.replaceWith(...imports)
  return root.toString()
}

async function readIfPresent(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

export async function compileTailwind(
  options: IResolvedTailwindOptions,
  abortSignal: AbortSignal,
): Promise<ICompileResult> {
  abortSignal.throwIfAborted()

  const input: string = await fs.readFile(options.inputPath, 'utf8')
  const preparedInput: string = prepareTailwindInput(input, options, options.inputPath)
  const cacheBustedInput: string = `${preparedInput}\n/* ${BUILD_MARKER}${(buildSequence += 1)} */`
  const result = await postcss([
    tailwindcss({
      base: options.projectBase,
      optimize: options.optimize ? { minify: true } : false,
    }),
    removeBuildMarker,
  ]).process(cacheBustedInput, {
    from: options.inputPath,
    map: false,
    to: options.outputPath,
  })

  abortSignal.throwIfAborted()

  const previous: string | undefined = await readIfPresent(options.outputPath)
  if (previous === result.css) {
    return { css: result.css, written: false }
  }

  await fs.mkdir(path.dirname(options.outputPath), { recursive: true })
  abortSignal.throwIfAborted()
  await fs.writeFile(options.outputPath, result.css, 'utf8')
  return { css: result.css, written: true }
}
