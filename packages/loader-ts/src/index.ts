import { transformSync } from 'esbuild'
import {
  IMPORT_META_URL_VARIABLE,
  type LoaderPlugin,
  type LoaderPluginContext,
  type TransformResult,
} from '@hirarijs/loader'

const extensions = ['.ts', '.mts', '.cts']

function runTransform(
  code: string,
  filename: string,
  ctx: LoaderPluginContext,
): TransformResult {
  const banner =
    ctx.format === 'cjs'
      ? `const ${IMPORT_META_URL_VARIABLE} = require('url').pathToFileURL(__filename).href;`
      : undefined
  const result = transformSync(code, {
    loader: 'ts',
    format: ctx.format,
    sourcemap: 'both',
    sourcefile: filename,
    define:
      ctx.format === 'cjs'
        ? {
            'import.meta.url': IMPORT_META_URL_VARIABLE,
          }
        : undefined,
    banner,
  })
  return {
    code: result.code,
    map: result.map,
    format: ctx.format,
  }
}

const plugin: LoaderPlugin = {
  name: '@hirarijs/loader-ts',
  extensions,
  match: (filename) => extensions.some((ext) => filename.endsWith(ext)),
  transform: runTransform,
}

export default plugin
