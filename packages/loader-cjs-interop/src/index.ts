import { createRequire } from 'module'
import path from 'path'
import {
  IMPORT_META_URL_VARIABLE,
  BYPASS_FLAG,
  BYPASS_PREFIX,
  type LoaderPlugin,
  type LoaderPluginContext,
  type TransformResult,
} from '@hirarijs/loader'

const extensions = ['.js', '.cjs']

interface PluginOptions {
  allowNodeModules?: boolean
  aliases?: Record<string, string>
  ignoreNodeModules?: boolean
  continue?: boolean
}

const isValidIdent = (name: string) => /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(name)
const WRAP_MARK = '__HIRARI_CJS_INTEROP_WRAPPED__'
const BYPASS_KEY = BYPASS_FLAG || '__hirari_loader_bypass__'

function runTransform(
  code: string,
  filename: string,
  ctx: LoaderPluginContext,
): TransformResult {
  // Already wrapped
  if (code.includes(WRAP_MARK)) {
    return { code, continue: true }
  }
  const opts =
    (ctx.loaderConfig.pluginOptions?.['@hirarijs/loader-cjs-interop'] as PluginOptions) || {}
  const ignoreNm = opts.ignoreNodeModules !== false && opts.allowNodeModules !== true
  if (ignoreNm && filename.includes('node_modules')) {
    return { code, continue: true }
  }

  if (opts.aliases) {
    for (const [key, target] of Object.entries(opts.aliases)) {
      if (filename.includes(`node_modules/${key}`) || filename.includes(`node_modules\\${key}`)) {
        filename = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target)
        break
      }
    }
  }

  let exportKeys: string[] = []
  try {
    const g = globalThis as any
    const prev = typeof g[BYPASS_KEY] === 'number' ? g[BYPASS_KEY] : 0
    g[BYPASS_KEY] = prev + 1
    const req = createRequire(import.meta.url)
    const mod = req(filename)
    if (mod && typeof mod === 'object') {
      exportKeys = Object.keys(mod).filter((k) => k !== 'default' && isValidIdent(k))
    }
    if (ctx.loaderConfig.debug) {
      console.log(`[loader-cjs-interop] required ${filename}`)
    }
  } catch {
    if (ctx.loaderConfig.debug) {
      console.log(`[loader-cjs-interop] imported ${filename}`)
    }
    return { code, continue: true }
  } finally {
    const g = globalThis as any
    const prev = typeof g[BYPASS_KEY] === 'number' ? g[BYPASS_KEY] : 1
    g[BYPASS_KEY] = Math.max(0, prev - 1)
  }

  const lines: string[] = []
  lines.push(`// ${WRAP_MARK}`)
  lines.push(`import { createRequire } from 'module';`)
  lines.push(`const _req = createRequire(${IMPORT_META_URL_VARIABLE});`)
  lines.push(`const __bypassKey = ${JSON.stringify(BYPASS_KEY)};`)
  lines.push(`const __g = globalThis;`)
  lines.push(`const __prev = typeof __g[__bypassKey] === 'number' ? __g[__bypassKey] : 0;`)
  lines.push(`__g[__bypassKey] = __prev + 1;`)
  lines.push(`const _cjs = _req(${JSON.stringify(`${BYPASS_PREFIX}${filename}`)});`)
  lines.push(`__g[__bypassKey] = __prev;`)
  lines.push(
    `const _default = (_cjs && _cjs.__esModule && 'default' in _cjs) ? _cjs.default : _cjs;`,
  )
  lines.push(`export default _default;`)
  lines.push(`export const __esModule = true;`)
  for (const key of exportKeys) {
    lines.push(`export const ${key} = _cjs[${JSON.stringify(key)}];`)
  }

  return {
    code: lines.join('\n'),
    map: undefined,
    format: 'esm',
    continue: opts.continue === true,
  }
}

const plugin: LoaderPlugin = {
  name: '@hirarijs/loader-cjs-interop',
  extensions,
  match(filename: string): boolean {
    return extensions.some((ext) => filename.endsWith(ext))
  },
  transform: runTransform,
}

export default plugin
