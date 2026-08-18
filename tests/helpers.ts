import fs from 'node:fs/promises'
import path from 'node:path'

export async function createTempDirectory(name: string): Promise<string> {
  const temporaryRoot: string = path.join(process.cwd(), 'temp', 'vitest')
  await fs.mkdir(temporaryRoot, { recursive: true })
  return fs.mkdtemp(path.join(temporaryRoot, `${name}-`))
}

export async function createTailwindProject(
  name: string,
  className: string = 'flex',
): Promise<string> {
  const root: string = await createTempDirectory(name)
  await fs.mkdir(path.join(root, 'src'), { recursive: true })
  await Promise.all([
    fs.writeFile(path.join(root, 'src', 'global.tailwind.css'), '@import "tailwindcss";\n', 'utf8'),
    fs.writeFile(
      path.join(root, 'src', 'component.tsx'),
      `export const className = '${className}'\n`,
      'utf8',
    ),
  ])
  return root
}
