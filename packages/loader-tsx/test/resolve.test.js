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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-tsx-'))
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
  const pkgDir = path.join(tmp, 'packages', 'bar', 'src')
  fs.mkdirSync(pkgDir, { recursive: true })
  fs.writeFileSync(path.join(pkgDir, 'index.tsx'), 'export default () => "ok"')
  const importer = path.join(tmp, 'app', 'main.tsx')
  fs.mkdirSync(path.dirname(importer), { recursive: true })
  fs.writeFileSync(importer, "import App from '@pkg/bar'\nconsole.log(App())\n")
  return { tmp, importer }
}

test('tsx plugin resolve respects tsconfig paths and maps to src', () => {
  const { tmp, importer } = setupFixture()
  try {
    const res = plugin.resolve('@pkg/bar', importer, {
      format: 'esm',
      loaderConfig: { debug: false },
      pluginOptions: undefined,
    })
    assert.ok(res && res.url, 'resolve should return a url')
    assert.ok(res.url.endsWith('/packages/bar/src/index.tsx') || res.url.endsWith('\\packages\\bar\\src\\index.tsx'))
    assert.ok(res.shortCircuit !== false)
  } finally {
    process.chdir(originalCwd)
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
