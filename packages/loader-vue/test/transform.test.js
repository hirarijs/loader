import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const plugin = require('../dist/index.cjs').default || require('../dist/index.cjs')

const sampleVue = `<template><div class="hi">hi</div></template>`

test('vue plugin transforms SFC to JS with default export', () => {
  const res = plugin.transform(sampleVue, '/tmp/App.vue', {
    format: 'esm',
    loaderConfig: { debug: false },
    pluginOptions: undefined,
  })
  assert.ok(res.code && res.code.length > 0, 'should produce code')
  assert.ok(res.code.includes('render'), 'should generate render function')
  assert.equal(res.format, 'esm')
})
