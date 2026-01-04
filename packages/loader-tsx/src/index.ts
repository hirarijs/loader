import path, { extname } from 'path'
import { pathToFileURL } from 'url'
import { transformSync } from 'esbuild'
import {
  IMPORT_META_URL_VARIABLE,
  type LoaderPlugin,
  type LoaderPluginContext,
  type TransformResult,
} from '@hirarijs/loader'
import ts from 'typescript'

const extensions = ['.tsx', '.jsx']

type ResolveFn = (specifier: string, importer: string) => string | null
const resolverCache = new Map<string, ResolveFn>()
const nearestConfigCache = new Map<string, string | null>()
let rootConfigPath: string | null = null

function findRootTsconfig(): string | null {
  if (rootConfigPath !== null) return rootConfigPath
  const candidates = [
    path.join(process.cwd(), 'tsconfig.json'),
    path.join(process.cwd(), 'tsconfig.base.json'),
  ]
  rootConfigPath = candidates.find((c) => ts.sys.fileExists(c)) || null
  return rootConfigPath
}

function findNearestTsconfig(start: string): string | null {
  if (nearestConfigCache.has(start)) return nearestConfigCache.get(start)!
  let dir = start
  while (true) {
    const candidate = path.join(dir, 'tsconfig.json')
    if (ts.sys.fileExists(candidate)) {
      nearestConfigCache.set(start, candidate)
      return candidate
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  nearestConfigCache.set(start, null)
  return null
}

function createTsResolveForConfig(tsconfigPath: string, debug = false): ResolveFn | null {
  if (resolverCache.has(tsconfigPath)) return resolverCache.get(tsconfigPath)!
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  if (configFile.error) {
    return null
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(tsconfigPath),
  )
  const options = parsed.options
  const host: ts.ModuleResolutionHost = {
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    directoryExists: ts.sys.directoryExists,
    realpath: ts.sys.realpath,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getDirectories: ts.sys.getDirectories,
  }

  const resolver: ResolveFn = (specifier: string, importer: string) => {
    const result = ts.resolveModuleName(specifier, importer, options, host)
    let resolved = result.resolvedModule?.resolvedFileName
    if (!resolved) return null
    if (resolved.includes('node_modules')) return null
    return resolved
  }

  if (debug) {
    console.log('[loader-tsx] tsconfig:', tsconfigPath)
  }

  resolverCache.set(tsconfigPath, resolver)
  return resolver
}

function createTsResolve(importer: string, debug = false): ResolveFn | null {
  const root = findRootTsconfig()
  const tsconfigPath = root ?? findNearestTsconfig(path.dirname(importer))
  if (!tsconfigPath) return null
  return createTsResolveForConfig(tsconfigPath, debug)
}

function hasTsconfigFor(importer: string): boolean {
  const root = findRootTsconfig()
  if (root) return true
  return Boolean(findNearestTsconfig(path.dirname(importer)))
}

function runTransform(
  code: string,
  filename: string,
  ctx: LoaderPluginContext,
): TransformResult {
  const opts =
    (ctx.loaderConfig.pluginOptions?.['@hirarijs/loader-tsx'] as {
      ignoreNodeModules?: boolean
      allowNodeModules?: boolean
      format?: 'esm' | 'cjs'
      jsx?: 'transform' | 'preserve' | 'automatic'
      jsxFactory?: string
      jsxFragment?: string
      jsxImportSource?: string
      jsxDev?: boolean
      continue?: boolean
    }) || {}
  const ignoreNm = opts.ignoreNodeModules !== false && opts.allowNodeModules !== true
  if (ignoreNm && filename.includes('node_modules')) {
    return { code, continue: true }
  }

  const ext = extname(filename)
  const loader = ext === '.jsx' ? 'jsx' : 'tsx'
  const outFormat = opts.format || 'esm'
  const jsxMode = opts.jsx || 'transform'
  const banner =
    outFormat === 'cjs'
      ? `const ${IMPORT_META_URL_VARIABLE} = require('url').pathToFileURL(__filename).href;`
      : undefined
  const result = transformSync(code, {
    loader,
    format: outFormat,
    jsx: jsxMode,
    jsxFactory: opts.jsxFactory,
    jsxFragment: opts.jsxFragment,
    jsxImportSource: opts.jsxImportSource,
    jsxDev: opts.jsxDev,
    sourcemap: 'both',
    sourcefile: filename,
    define:
      outFormat === 'cjs'
        ? {
            'import.meta.url': IMPORT_META_URL_VARIABLE,
          }
        : undefined,
    banner,
  })
  return {
    code: result.code,
    map: result.map,
    format: outFormat,
    continue: opts.continue === true,
  }
}

const plugin: LoaderPlugin = {
  name: '@hirarijs/loader-tsx',
  extensions,
  match: (filename) => {
    const ext = path.extname(filename)
    return extensions.includes(ext) && hasTsconfigFor(filename)
  },
  resolve: (specifier, importer, ctx) => {
    if (!importer) return null
    if (specifier.startsWith('node:')) return null
    const resolver = createTsResolve(importer, ctx.loaderConfig.debug)
    if (!resolver) return null
    const resolved = resolver(specifier, importer)
    if (!resolved) return null
    if (resolved.includes('node_modules')) return null
    return { url: pathToFileURL(resolved).href, shortCircuit: true }
  },
  transform: runTransform,
}

export default plugin
