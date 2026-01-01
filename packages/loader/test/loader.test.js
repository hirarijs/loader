import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pkgRoot = path.resolve(__dirname, '..')

const fixtures = path.join(__dirname, 'fixtures', 'basic')
const require = createRequire(import.meta.url)

const { register } = require('../dist/register.cjs')

const { unregister } = register(fixtures)
const moduleUrl = new URL('file://' + path.join(fixtures, 'main.ts')).href
const loaded = await import(moduleUrl)
assert.equal(loaded.default, 3)
unregister()
