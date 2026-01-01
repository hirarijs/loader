import { transformSync } from 'esbuild'
import {
  IMPORT_META_URL_VARIABLE,
  type LoaderPlugin,
  type LoaderPluginContext,
  type TransformResult,
} from '@hirarijs/loader'
import path from 'path'
import ts from 'typescript'

type ResolveFn = (specifier: string, importer: string) => string | null

const resolverCache = new Map<string, ResolveFn>()
const nearestConfigCache = new Map<string, string | null>()
let rootConfigPath: string | null = null

function findRootTsconfig(): string | null {
  if (rootConfigPath !== null) return rootConfigPath
  const candidate = path.join(process.cwd(), 'tsconfig.json')
  rootConfigPath = ts.sys.fileExists(candidate) ? candidate : null
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
    const resolved = result.resolvedModule?.resolvedFileName
    if (resolved && !resolved.endsWith('.d.ts')) {
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

// Also include .js/.mjs/.cjs so we can rewrite aliases in JS that rely on TS paths.
const extensions = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs']

function runTransform(
  code: string,
  filename: string,
  ctx: LoaderPluginContext,
): TransformResult {
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
  const banner =
    ctx.format === 'cjs'
      ? `const ${IMPORT_META_URL_VARIABLE} = require('url').pathToFileURL(__filename).href;`
      : undefined
  const result = transformSync(rewrittenCode, {
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
  match: (filename) => {
    const ext = path.extname(filename)
    if (!ext) return true // fallback: try compiling extension-less files
    return extensions.includes(ext)
  },
  transform: runTransform,
}

export default plugin
