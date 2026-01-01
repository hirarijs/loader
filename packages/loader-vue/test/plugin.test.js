import { strict as assert } from 'node:assert'
import plugin from '../dist/index.js'

const ctx = {
  format: 'cjs',
  loaderConfig: {},
  pluginOptions: undefined,
}

{
  const code = `
<template><div>{{ msg }}</div></template>
<script setup lang="ts">
const msg = 'hi'
</script>
`
  const result = plugin.transform(code, '/tmp/file.vue', ctx)
  assert.ok(result.code.includes('render'), 'should generate render function')
  assert.ok(result.code.includes('_sfc_main'), 'should keep component variable')
}
