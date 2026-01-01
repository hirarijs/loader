import { createRequire } from 'module'
import path from 'path'
import {
  IMPORT_META_URL_VARIABLE,
  type LoaderPlugin,
  type LoaderPluginContext,
  type TransformResult,
} from '@hirarijs/loader'

const extensions = ['.js', '.cjs']

interface PluginOptions {
  allowNodeModules?: boolean
  aliases?: Record<string, string>
}

const isValidIdent = (name: string) => /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(name)

function runTransform(
  code: string,
  filename: string,
  ctx: LoaderPluginContext,
): TransformResult {
  const opts =
    (ctx.loaderConfig.pluginOptions?.['@hirarijs/loader-cjs-interop'] as PluginOptions) || {}
  const ignoreNm = opts.ignoreNodeModules !== false && opts.allowNodeModules !== true
  if (ignoreNm && filename.includes('node_modules')) {
    return { code, continue: true } // skip node_modules unless allowed
  }

  // alias support: rewrite filename if it matches configured aliases
  if (opts.aliases) {
    for (const [key, target] of Object.entries(opts.aliases)) {
      if (filename.includes(`node_modules/${key}`) || filename.includes(`node_modules\\${key}`)) {
        const aliased = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target)
        filename = aliased
        break
      }
    }
  }

  // Only attempt wrapping when require succeeds (i.e., CommonJS)
  let mod: any
  try {
    const req = createRequire(import.meta.url)
    mod = req(filename)
  } catch {
    return { code, continue: true } // leave as-is if ESM or cannot require
  }

  const keys = Object.keys(mod || {}).filter((k) => k !== 'default')
  const lines: string[] = []
  lines.push(`import { createRequire } from 'module';`)
  lines.push(
    `const ${IMPORT_META_URL_VARIABLE} = import.meta.url; const _cjs = createRequire(${IMPORT_META_URL_VARIABLE})(${JSON.stringify(filename)});`,
  )
  lines.push(`export default _cjs;`)
  lines.push(`export const __esModule = true;`)
  for (const key of keys) {
    if (!isValidIdent(key)) {
      continue
    }
    lines.push(`export const ${key} = _cjs[${JSON.stringify(key)}];`)
  }

  return {
    code: lines.join('\n'),
    map: undefined,
    format: ctx.format,
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
