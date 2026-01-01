import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pkgRoot = path.resolve(__dirname, '..')

const fixtures = path.join(__dirname, 'fixtures', 'esm')
const loaderSpec = pathToFileURL(path.join(pkgRoot, 'dist', 'loader.js')).href

let output
let skipped = false
try {
  output = execFileSync(process.execPath, ['--loader', loaderSpec, 'main.ts'], {
    cwd: fixtures,
    encoding: 'utf8',
  })
} catch (error) {
  // Some environments may block spawn with --loader; treat EPERM as a skipped test.
  if (error && error.code === 'EPERM') {
    console.warn('skipping ESM loader test due to EPERM in spawn')
    skipped = true
  } else {
    throw error
  }
}

if (!skipped) {
  assert.equal(output.trim(), '3')
}

let importSkipped = false
try {
  const importOut = execFileSync(
    process.execPath,
    ['--import', '@hirarijs/loader/import', 'main.ts'],
    {
      cwd: fixtures,
      encoding: 'utf8',
    },
  )
  if (!skipped) {
    assert.equal(importOut.trim(), '3')
  }
} catch (error) {
  if (error && error.code === 'EPERM') {
    console.warn('skipping ESM import test due to EPERM in spawn')
    importSkipped = true
  } else {
    throw error
  }
}
