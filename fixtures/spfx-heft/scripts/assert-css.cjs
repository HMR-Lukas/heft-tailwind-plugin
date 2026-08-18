const fs = require('node:fs/promises')
const path = require('node:path')

async function runAsync() {
  const cssPath = path.join(process.cwd(), 'src', 'global.css')
  const css = await fs.readFile(cssPath, 'utf8')

  if (!css.includes('.flex')) {
    throw new Error('Tailwind CSS was not generated before the webpack task.')
  }

  await fs.mkdir(path.join(process.cwd(), 'temp'), { recursive: true })
  await fs.writeFile(path.join(process.cwd(), 'temp', 'webpack-ran.txt'), 'ok\n', 'utf8')
}

module.exports = { runAsync }
