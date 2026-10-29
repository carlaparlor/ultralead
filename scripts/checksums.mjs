import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const directory = path.resolve(process.argv[2] || 'release')
const files = (await readdir(directory)).filter(name => name.endsWith('.exe')).sort()
if (files.length === 0) throw new Error(`No Windows executables found in ${directory}`)
const sums = []
for (const file of files) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path.join(directory, file))) hash.update(chunk)
  sums.push(`${hash.digest('hex')}  ${file}`)
}
await writeFile(path.join(directory, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`)
console.log(`Wrote SHA256SUMS.txt for ${files.length} Windows executables.`)
