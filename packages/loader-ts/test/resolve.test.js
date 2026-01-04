import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import url from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const plugin = require('../dist/index.cjs').default || require('../dist/index.cjs')

const originalCwd = process.cwd()

function setupFixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-ts-'))
  process.chdir(tmp)
  fs.writeFileSync(
    path.join(tmp, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@pkg/*': ['packages/*/src'],
          },
        },
      },
      null,
      2,
    ),
  )
  const pkgDir = path.join(tmp, 'packages', 'foo', 'src')
  fs.mkdirSync(pkgDir, { recursive: true })
  fs.writeFileSync(path.join(pkgDir, 'index.ts'), 'export const value = 123')
  const importer = path.join(tmp, 'app', 'main.ts')
  fs.mkdirSync(path.dirname(importer), { recursive: true })
  fs.writeFileSync(importer, "import { value } from '@pkg/foo'\nconsole.log(value)\n")
  return { tmp, importer }
}

test('ts plugin resolve respects tsconfig paths and maps to src', () => {
  const { tmp, importer } = setupFixture()
  try {
    const res = plugin.resolve('@pkg/foo', importer, {
      format: 'esm',
      loaderConfig: { debug: false },
      pluginOptions: undefined,
    })
    assert.ok(res && res.url, 'resolve should return a url')
    assert.ok(res.url.endsWith('/packages/foo/src/index.ts') || res.url.endsWith('\\packages\\foo\\src\\index.ts'))
    assert.ok(res.shortCircuit !== false)
  } finally {
    process.chdir(originalCwd)
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
