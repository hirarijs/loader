import { createHash } from 'crypto'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import {
  IMPORT_META_URL_VARIABLE,
  type LoaderPlugin,
  type LoaderPluginContext,
  type TransformResult,
} from '@hirarijs/loader'

const extensions = ['.vue']

function normalizeScript(
  code: string,
  fallbackVar: string,
): { code: string; componentVar: string } {
  const defaultExport = /export default\s+([\s\S]*?);?\s*$/
  let componentVar = fallbackVar

  const match = code.match(defaultExport)
  if (match && match.index !== undefined) {
    const expr = match[1].trim()
    const before = code.slice(0, match.index).trimEnd()
    const decl = `const ${componentVar} = ${expr}`
    const pieces = [before, decl].filter(Boolean)
    return { code: pieces.join('\n'), componentVar }
  }

  if (!code.includes(fallbackVar)) {
    code += `\nconst ${componentVar} = {}`
  }
  return { code, componentVar }
}

function compileVue(
  code: string,
  filename: string,
  ctx: LoaderPluginContext,
): TransformResult {
  const opts =
    (ctx.loaderConfig.pluginOptions?.['@hirarijs/loader-vue'] as {
      ignoreNodeModules?: boolean
      allowNodeModules?: boolean
      continue?: boolean
    }) || {}
  const ignoreNm = opts.ignoreNodeModules !== false && opts.allowNodeModules !== true
  if (ignoreNm && filename.includes('node_modules')) {
    return { code, continue: true }
  }

  const { descriptor } = parse(code, { filename })
  const id = createHash('sha256').update(filename).digest('hex').slice(0, 8)

  let output: string
  let componentVar = '_sfc_main'

  if (descriptor.script || descriptor.scriptSetup) {
    const script = compileScript(descriptor, {
      id,
      inlineTemplate: false,
    })
    const normalized = normalizeScript(script.content, componentVar)
    output = normalized.code
    componentVar = normalized.componentVar

    if (descriptor.template) {
      const template = compileTemplate({
        source: descriptor.template.content,
        filename,
        id,
        compilerOptions: {
          bindingMetadata: script.bindings,
        },
      })
      output += `\n${template.code}`
      output += `\n;(${componentVar} as any).render = render`
    }
  } else {
    output = `const ${componentVar} = {}`
    if (descriptor.template) {
      const template = compileTemplate({
        source: descriptor.template.content,
        filename,
        id,
      })
      output += `\n${template.code}`
      output += `\n;(${componentVar} as any).render = render`
    }
  }

  output += `\nexport default ${componentVar}`

  const banner =
    ctx.format === 'cjs'
      ? `const ${IMPORT_META_URL_VARIABLE} = require('url').pathToFileURL(__filename).href;`
      : undefined
  const transformed = transformSync(output, {
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
    code: transformed.code,
    map: transformed.map,
    format: ctx.format,
    continue: opts.continue === true,
  }
}

const plugin: LoaderPlugin = {
  name: '@hirarijs/loader-vue',
  extensions,
  match: (filename) => extensions.some((ext) => filename.endsWith(ext)),
  transform: (code, filename, ctx) => compileVue(code, filename, ctx),
}

export default plugin
