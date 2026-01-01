import { strict as assert } from 'node:assert'
import plugin from '../dist/index.js'

const ctx = {
  format: 'cjs',
  loaderConfig: {},
  pluginOptions: undefined,
}

{
  const code = 'const View = () => <div>Hello</div>; export default View'
  const result = plugin.transform(code, '/tmp/file.tsx', ctx)
  assert.ok(result.code.includes('React.createElement'), 'should emit React.createElement')
}
