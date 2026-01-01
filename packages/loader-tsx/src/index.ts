import { extname } from 'path'
import { transformSync } from 'esbuild'
import {
  IMPORT_META_URL_VARIABLE,
  type LoaderPlugin,
  type LoaderPluginContext,
  type TransformResult,
} from '@hirarijs/loader'

const extensions = ['.tsx', '.jsx']

function runTransform(
  code: string,
  filename: string,
  ctx: LoaderPluginContext,
): TransformResult {
  const ext = extname(filename)
  const loader = ext === '.jsx' ? 'jsx' : 'tsx'
  const banner =
    ctx.format === 'cjs'
      ? `const ${IMPORT_META_URL_VARIABLE} = require('url').pathToFileURL(__filename).href;`
      : undefined
  const result = transformSync(code, {
    loader,
    format: ctx.format,
    sourcemap: 'both',
    sourcefile: filename,
    jsx: 'transform',
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
  name: '@hirarijs/loader-tsx',
  extensions,
  match: (filename) => extensions.some((ext) => filename.endsWith(ext)),
  transform: runTransform,
}

export default plugin
