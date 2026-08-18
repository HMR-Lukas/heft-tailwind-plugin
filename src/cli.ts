#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { initializeProject } from './initializer'

const usage: string = `Usage: heft-tailwind init [options]

Options:
  --prefix <prefix>  Use a lowercase Tailwind prefix
  --preflight        Enable Tailwind Preflight
  --dry-run          Show changes without writing files
  --yes, -y          Continue for newer, unsupported SPFx versions
  --version, -v      Show the installed version
  --help             Show this help`

export function getPackageVersion(): string {
  const packageJsonPath: string = path.resolve(__dirname, '..', 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    version?: unknown
  }

  if (typeof packageJson.version !== 'string') {
    throw new Error(`Package version is missing in ${packageJsonPath}.`)
  }

  return packageJson.version
}

async function confirmUnsupportedVersion(version: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `SPFx ${version} requires confirmation. Run interactively or pass --yes to continue.`,
    )
  }

  const readline = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer: string = await readline.question(
      `Install and configure the plugin for SPFx ${version} anyway? [y/N] `,
    )
    return /^(?:y|yes)$/i.test(answer.trim())
  } finally {
    readline.close()
  }
}

export async function runCli(args: string[] = process.argv.slice(2)): Promise<void> {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean' },
      help: { short: 'h', type: 'boolean' },
      preflight: { type: 'boolean' },
      prefix: { type: 'string' },
      version: { short: 'v', type: 'boolean' },
      yes: { short: 'y', type: 'boolean' },
    },
    strict: true,
  })

  if (values.version) {
    process.stdout.write(`${getPackageVersion()}\n`)
    return
  }

  if (values.help) {
    process.stdout.write(`${usage}\n`)
    return
  }

  if (positionals.length !== 1 || positionals[0] !== 'init') {
    throw new Error(usage)
  }

  await initializeProject({
    confirmUnsupportedVersion: values.yes
      ? async (): Promise<boolean> => true
      : confirmUnsupportedVersion,
    cwd: process.cwd(),
    dryRun: values['dry-run'],
    log: (message: string): void => console.log(message),
    preflight: values.preflight,
    prefix: values.prefix,
  })
}

if (require.main === module) {
  void runCli().catch((error: unknown): void => {
    const message: string = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  })
}
