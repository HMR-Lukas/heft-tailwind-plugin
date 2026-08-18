import { execFile, spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { createTempDirectory } from './helpers'

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []
const heftStartPath: string = path.join(
  process.cwd(),
  'node_modules',
  '@rushstack',
  'heft',
  'lib',
  'start.js',
)

async function prepareFixture(): Promise<string> {
  const root: string = await createTempDirectory('heft fixture with spaces')
  temporaryDirectories.push(root)
  await fs.cp(path.join(process.cwd(), 'fixtures', 'spfx-heft'), root, { recursive: true })

  const packageRoot: string = path.join(
    root,
    'node_modules',
    '@hmr-lukas',
    'heft-tailwind-plugin',
  )
  await fs.mkdir(packageRoot, { recursive: true })
  await Promise.all([
    fs.cp(path.join(process.cwd(), 'dist'), path.join(packageRoot, 'dist'), { recursive: true }),
    fs.cp(path.join(process.cwd(), 'schemas'), path.join(packageRoot, 'schemas'), {
      recursive: true,
    }),
    fs.copyFile(
      path.join(process.cwd(), 'heft-plugin.json'),
      path.join(packageRoot, 'heft-plugin.json'),
    ),
    fs.copyFile(path.join(process.cwd(), 'package.json'), path.join(packageRoot, 'package.json')),
  ])
  return root
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeout: number = 20_000,
): Promise<void> {
  const deadline: number = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) {
      return
    }
    await new Promise<void>((resolve: () => void) => {
      setTimeout(resolve, 100)
    })
  }
  throw new Error(`Condition was not met within ${timeout}ms.`)
}

async function readOptional(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return ''
    }
    throw error
  }
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return
  }

  await new Promise<void>((resolve: () => void) => {
    const timeout: NodeJS.Timeout = setTimeout(resolve, 5_000)
    child.once('exit', (): void => {
      clearTimeout(timeout)
      resolve()
    })
    child.kill()
  })
}

afterEach(async (): Promise<void> => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory: string) =>
      fs.rm(directory, { force: true, recursive: true }),
    ),
  )
})

describe.sequential('Heft fixture', (): void => {
  it('runs tailwind before the webpack task during heft build', async (): Promise<void> => {
    const root: string = await prepareFixture()
    const result = await execFileAsync(process.execPath, [heftStartPath, 'build', '--clean'], {
      cwd: root,
      maxBuffer: 1024 * 1024,
    })

    expect(result.stdout).toContain('Wrote src/global.css')
    await expect(fs.readFile(path.join(root, 'temp', 'webpack-ran.txt'), 'utf8')).resolves.toBe(
      'ok\n',
    )
  })

  it('rebuilds through Heft watch mode after a source change', async (): Promise<void> => {
    const root: string = await prepareFixture()
    const outputPath: string = path.join(root, 'src', 'global.css')
    let output: string = ''
    const child: ChildProcess = spawn(
      process.execPath,
      [heftStartPath, 'build-watch', '--clean'],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    child.stdout?.on('data', (chunk: Buffer): void => {
      output += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer): void => {
      output += chunk.toString()
    })

    try {
      await waitFor(async (): Promise<boolean> => (await readOptional(outputPath)).includes('.flex'))
      await fs.writeFile(
        path.join(root, 'src', 'index.ts'),
        "export const fixtureClassName: string = 'flex grid'\n",
        'utf8',
      )
      await waitFor(async (): Promise<boolean> => (await readOptional(outputPath)).includes('.grid'))
      expect(output).toContain('Wrote src/global.css')
    } finally {
      await stopChild(child)
    }
  })
})
