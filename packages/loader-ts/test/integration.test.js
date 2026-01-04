import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import url from 'node:url'

test.skip('ts/tsx plugins resolve via tsconfig paths and run through loader', () => {
  const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..', '..')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-ts-int-'))
  const tsconfig = {
    compilerOptions: {
    baseUrl: '.',
    paths: {
      '@pkg/foo': ['packages/foo/src/index.ts'],
      '@pkg/bar': ['packages/bar/src/index.tsx'],
    },
    },
  }
  const hirariConfig = {
    loader: {
      plugins: [
        path.join(repoRoot, 'packages/loader-ts/dist/index.cjs'),
        path.join(repoRoot, 'packages/loader-tsx/dist/index.cjs'),
      ],
      pluginOptions: {
        '@hirarijs/loader-ts': { format: 'esm', ignoreNodeModules: true },
        '@hirarijs/loader-tsx': { format: 'esm', ignoreNodeModules: true },
      },
    },
  }

  fs.writeFileSync(path.join(tmp, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2))
  fs.writeFileSync(path.join(tmp, 'hirari.json'), JSON.stringify(hirariConfig, null, 2))

  // ts module
  const fooDir = path.join(tmp, 'packages', 'foo', 'src')
  fs.mkdirSync(fooDir, { recursive: true })
  fs.writeFileSync(path.join(fooDir, 'index.ts'), 'export const foo = 123')

  // tsx module
  const barDir = path.join(tmp, 'packages', 'bar', 'src')
  fs.mkdirSync(barDir, { recursive: true })
  fs.writeFileSync(path.join(barDir, 'index.tsx'), 'export default () => \"OK-TSX\"')

  // entry
  const entry = path.join(tmp, 'main.ts')
  fs.writeFileSync(
    entry,
    [
      "import { foo } from '@pkg/foo'",
      "import renderTsx from '@pkg/bar'",
      "console.log('TS', foo)",
      "console.log('TSX', renderTsx())",
    ].join('\n'),
  )

  const proc = spawnSync(
    process.execPath,
    ['--import', path.join(repoRoot, 'packages/loader/dist/import.js'), entry],
    {
      cwd: tmp,
      encoding: 'utf8',
      env: process.env,
    },
  )

  try {
    assert.equal(proc.status, 0, proc.stderr || 'process failed')
    assert.ok(proc.stdout.includes('TS 123'), proc.stdout + proc.stderr)
    assert.ok(proc.stdout.includes('TSX OK-TSX'), proc.stdout + proc.stderr)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
