#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { initializeProject } from './initializer'

const usage: string = `Usage: heft-tailwind init [options]

Options:
  --prefix <prefix>  Use a lowercase Tailwind prefix
  --preflight        Enable Tailwind Preflight
  --dry-run          Show changes without writing files
  --help             Show this help`

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean' },
      help: { short: 'h', type: 'boolean' },
      preflight: { type: 'boolean' },
      prefix: { type: 'string' },
    },
    strict: true,
  })

  if (values.help) {
    process.stdout.write(`${usage}\n`)
    return
  }

  if (positionals.length !== 1 || positionals[0] !== 'init') {
    throw new Error(usage)
  }

  await initializeProject({
    cwd: process.cwd(),
    dryRun: values['dry-run'],
    log: (message: string): void => console.log(message),
    preflight: values.preflight,
    prefix: values.prefix,
  })
}

void main().catch((error: unknown): void => {
  const message: string = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
