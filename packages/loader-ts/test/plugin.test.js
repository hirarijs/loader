import { strict as assert } from 'node:assert'
import plugin from '../dist/index.js'

const ctx = {
  format: 'cjs',
  loaderConfig: {},
  pluginOptions: undefined,
}

{
  const code = 'const x: number = 1 + 2'
  const result = plugin.transform(code, '/tmp/file.ts', ctx)
  assert.ok(result.code.includes('const x = 1 + 2'))
}
