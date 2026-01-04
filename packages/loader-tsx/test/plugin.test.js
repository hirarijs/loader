import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const plugin = require('../dist/index.cjs').default || require('../dist/index.cjs')

const ctx = {
  format: 'cjs',
  loaderConfig: {
    pluginOptions: {
      '@hirarijs/loader-tsx': {
        format: 'esm',
        jsx: 'transform',
        jsxFactory: 'h',
      },
    },
  },
  pluginOptions: undefined,
}

{
  const code = 'const View = () => <div>Hello</div>; export default View'
  const result = plugin.transform(code, '/tmp/file.tsx', ctx)
  assert.ok(result.code.includes('h('), 'should emit custom jsx factory')
}
