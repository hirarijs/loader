import { transformSync } from 'esbuild'
import {
  IMPORT_META_URL_VARIABLE,
  type LoaderPlugin,
  type LoaderPluginContext,
  type TransformResult,
} from '@hirarijs/loader'
import path from 'path'
import { pathToFileURL } from 'url'
import ts from 'typescript'

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
    // If it didn't hit anything from paths/baseUrl, bail out (avoid rewriting to dist/default)
    if (result.resolvedModule?.isExternalLibraryImport || !result.resolvedModule) {
      return null
    }
    if (resolved && resolved.endsWith('.d.ts')) {
      const candidates = [
        resolved.replace(/\.d\.ts$/, '.ts'),
        resolved.replace(/\.d\.ts$/, '.tsx'),
        resolved.replace(/\.d\.ts$/, '.js'),
        resolved.replace(/\.d\.ts$/, '.mjs'),
        resolved.replace(/\.d\.ts$/, '.cts'),
        resolved.replace(/\.d\.ts$/, '.cjs'),
      ]
      if (resolved.includes(`${path.sep}dist${path.sep}`)) {
        const srcBase = resolved.replace(`${path.sep}dist${path.sep}`, `${path.sep}src${path.sep}`)
        candidates.unshift(
          srcBase.replace(/\.d\.ts$/, '.ts'),
          srcBase.replace(/\.d\.ts$/, '.tsx'),
          srcBase.replace(/\.d\.ts$/, '.js'),
          srcBase.replace(/\.d\.ts$/, '.mjs'),
          srcBase.replace(/\.d\.ts$/, '.cts'),
          srcBase.replace(/\.d\.ts$/, '.cjs'),
        )
      }
      resolved = candidates.find((f) => ts.sys.fileExists(f)) || resolved
    }
    if (resolved) {
      if (debug) {
        console.log(`[loader-ts] resolved ${specifier} -> ${resolved}`)
      }
      return resolved
    }
    return null
  }

  if (debug) {
    console.log('[loader-ts] tsconfig:', tsconfigPath)
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

function rewriteImports(code: string, filename: string, resolve: ResolveFn, debug = false): string {
  const importLike =
    /(import\s+[^'";]+?from\s+['"]([^'"]+)['"])|(import\s+['"]([^'"]+)['"])|(export\s+[^'";]+?from\s+['"]([^'"]+)['"])/g
  return code.replace(importLike, (full, _a, from1, _b, from2, _c, from3) => {
    const spec = from1 || from2 || from3
    if (!spec || spec.startsWith('.') || spec.startsWith('..') || spec.startsWith('node:')) {
      return full
    }
    const resolved = resolve(spec, filename)
    if (!resolved) return full
    if (resolved.includes('node_modules')) return full
    if (debug) {
      console.log(`[loader-ts] rewrite ${spec} -> ${resolved}`)
    }
    const relative = path.isAbsolute(resolved)
      ? path.relative(path.dirname(filename), resolved).replace(/\\/g, '/')
      : resolved
    const normalized = relative.startsWith('.') ? relative : './' + relative
    return full.replace(spec, normalized)
  })
}

const extensions = ['.ts', '.mts', '.cts']

function runTransform(
  code: string,
  filename: string,
  ctx: LoaderPluginContext,
): TransformResult {
  const ext = path.extname(filename)
  if (!extensions.includes(ext)) {
    return { code, continue: true }
  }
  const opts =
    (ctx.loaderConfig.pluginOptions?.['@hirarijs/loader-ts'] as {
      ignoreNodeModules?: boolean
      allowNodeModules?: boolean
      format?: 'esm' | 'cjs'
      continue?: boolean
    }) || {}
  const ignoreNm = opts.ignoreNodeModules !== false && opts.allowNodeModules !== true
  if (ignoreNm && filename.includes('node_modules')) {
    return { code, continue: true }
  }

  const pathResolver = createTsResolve(filename, ctx.loaderConfig.debug)
  const rewrittenCode =
    pathResolver && !filename.includes('node_modules')
      ? rewriteImports(code, filename, pathResolver, ctx.loaderConfig.debug)
      : code

  if (ctx.loaderConfig.debug) {
    console.log(`[loader-ts] transforming ${filename}`)
    if (!pathResolver) {
      console.log('[loader-ts] no tsconfig resolver created for', filename)
    }
  }
  const outFormat = opts.format || 'esm'
  const banner =
    outFormat === 'cjs'
      ? `const ${IMPORT_META_URL_VARIABLE} = require('url').pathToFileURL(__filename).href;`
      : undefined
  const result = transformSync(rewrittenCode, {
    loader: 'ts',
    format: outFormat,
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
  name: '@hirarijs/loader-ts',
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
