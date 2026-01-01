import fs from 'fs'
import module from 'module'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { addHook } from 'pirates'
import * as sourceMapSupport from 'source-map-support'
import { LoaderConfig, ModuleFormat, TransformResult } from './types.js'
import { IMPORT_META_URL_VARIABLE } from './constants.js'
import { loadHirariConfig, getFormat } from './config.js'
import { resolvePlugins, ResolvedPlugin } from './plugin-manager.js'

const map: Record<string, string> = {}
const EXTENSION_CANDIDATES = [
  '.ts',
  '.mts',
  '.cts',
  '.tsx',
  '.jsx',
  '.vue',
  '.js',
  '.mjs',
  '.cjs',
]

function installSourceMaps() {
  sourceMapSupport.install({
    handleUncaughtExceptions: false,
    environment: 'node',
    retrieveSourceMap(file: string) {
      if (map[file]) {
        return { url: file, map: map[file] }
      }
      return null
    },
  })
}

export interface RuntimeContext {
  cwd: string
  loaderConfig: LoaderConfig
  resolvedPlugins: ResolvedPlugin[]
  format: ModuleFormat
}

const toNodeLoaderFormat = (format: ModuleFormat): 'module' | 'commonjs' =>
  format === 'esm' ? 'module' : 'commonjs'

export function createRuntime(cwd: string = process.cwd()): RuntimeContext {
  const loaderConfig = loadHirariConfig(cwd)
  const resolvedPlugins = resolvePlugins(loaderConfig, cwd)
  installSourceMaps()
  return {
    cwd,
    loaderConfig,
    resolvedPlugins,
    format: getFormat(loaderConfig),
  }
}

function pickPlugin(filename: string, plugins: ResolvedPlugin[]): ResolvedPlugin | undefined {
  return plugins.find(({ plugin }) => plugin.match(filename))
}

function applyPlugin(
  code: string,
  filename: string,
  runtime: RuntimeContext,
): TransformResult {
  const match = pickPlugin(filename, runtime.resolvedPlugins)
  if (!match) {
    if (runtime.loaderConfig.debug) {
      console.log(`[hirari-loader] no plugin matched ${filename}`)
    }
    return { code }
  }
  const ctx = {
    format: runtime.format,
    loaderConfig: runtime.loaderConfig,
    pluginOptions: match.options,
  }
  const result = match.plugin.transform(code, filename, ctx)
  if (runtime.loaderConfig.debug) {
    console.log(`[hirari-loader][${match.plugin.name}] compiled ${filename}`)
  }
  if (result.map) {
    map[filename] = result.map
  }
  return result
}

function collectExtensions(plugins: ResolvedPlugin[]): string[] {
  const set = new Set<string>()
  for (const { plugin } of plugins) {
    plugin.extensions.forEach((ext) => set.add(ext))
  }
  return Array.from(set)
}

export function registerRequireHooks(runtime: RuntimeContext) {
  const extensions = collectExtensions(runtime.resolvedPlugins)
  const compile = (code: string, filename: string) => {
    const result = applyPlugin(code, filename, runtime)
    const banner = `const ${IMPORT_META_URL_VARIABLE} = require('url').pathToFileURL(__filename).href;`
    // avoid double compilation
    if (!result.code.includes(IMPORT_META_URL_VARIABLE)) {
      return `${banner}${result.code}`
    }
    return result.code
  }

  const revert = addHook(compile, {
    exts: extensions,
    ignoreNodeModules: runtime.loaderConfig.hookIgnoreNodeModules ?? true,
  })

  // Ensure CJS can fallback when encountering ESM
  const extensionsObj = (module as any).Module._extensions
  const jsHandler = extensionsObj['.js']

  extensionsObj['.js'] = function (mod: any, filename: string) {
    try {
      return jsHandler.call(this, mod, filename)
    } catch (error: any) {
      if (error && error.code === 'ERR_REQUIRE_ESM') {
        const src = fs.readFileSync(filename, 'utf8')
        const result = applyPlugin(src, filename, runtime)
        mod._compile(result.code, filename)
        return
      }
      throw error
    }
  }

  return () => {
    revert()
    extensionsObj['.js'] = jsHandler
  }
}

export async function loaderResolve(
  specifier: string,
  context: any,
  next: any,
  runtime: RuntimeContext,
) {
  const ignoreNodeModules = runtime.loaderConfig.hookIgnoreNodeModules ?? true
  const parentUrl = context && context.parentURL
  const baseDir =
    parentUrl && typeof parentUrl === 'string' && parentUrl.startsWith('file:')
      ? path.dirname(fileURLToPath(parentUrl))
      : process.cwd()

  const tryResolve = (basePath: string, note: string) => {
    for (const ext of EXTENSION_CANDIDATES) {
      const candidate = basePath + ext
      if (ignoreNodeModules && candidate.includes('node_modules')) {
        continue
      }
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        const url = pathToFileURL(candidate).href
        if (runtime.loaderConfig.debug) {
          console.log(`[hirari-loader] resolve ${note} ${specifier} -> ${url}`)
        }
        return { url, shortCircuit: true }
      }
      const indexCandidate = path.join(basePath, 'index' + ext)
      if (ignoreNodeModules && indexCandidate.includes('node_modules')) {
        continue
      }
      if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) {
        const url = pathToFileURL(indexCandidate).href
        if (runtime.loaderConfig.debug) {
          console.log(`[hirari-loader] resolve ${note} ${specifier} -> ${url}`)
        }
        return { url, shortCircuit: true }
      }
    }
    return null
  }

  // Attempt to resolve extension-less relative/absolute specifiers by trying known candidates.
  if (
    (!path.extname(specifier) &&
      (specifier.startsWith('./') ||
        specifier.startsWith('../') ||
        specifier.startsWith('/') ||
        specifier.startsWith('file:'))) &&
    !specifier.startsWith('node:')
  ) {
    const basePath = specifier.startsWith('file:')
      ? fileURLToPath(specifier)
      : specifier.startsWith('/')
        ? specifier
        : path.resolve(baseDir, specifier)
    const res = tryResolve(basePath, 'extless')
    if (res) return res
  }

  // If explicitly importing .js/.mjs/.cjs and file missing, fallback to TS/TSX variants.
  const ext = path.extname(specifier)
  if (
    (ext === '.js' || ext === '.mjs' || ext === '.cjs') &&
    (specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/') || specifier.startsWith('file:'))
  ) {
    const withoutExt = specifier.slice(0, -ext.length)
    const basePath = specifier.startsWith('file:')
      ? fileURLToPath(withoutExt)
      : specifier.startsWith('/')
        ? withoutExt
        : path.resolve(baseDir, withoutExt)
    const res = tryResolve(basePath, 'fallback-js')
    if (res) return res
  }

  if (next) return next(specifier, context)
  // If no downstream resolve, signal completion to avoid ERR_LOADER_CHAIN_INCOMPLETE
  return { url: specifier, shortCircuit: true }
}

export async function loaderLoad(url: string, context: any, next: any, runtime: RuntimeContext) {
  const { format: expectedFormat } = runtime
  if (url.startsWith('file://')) {
    const filename = fileURLToPath(url)
    const match = pickPlugin(filename, runtime.resolvedPlugins)
    if (runtime.loaderConfig.debug) {
      console.log(`[hirari-loader] load hook url=${url} match=${!!match}`)
    }
    if (match) {
      const source = fs.readFileSync(filename, 'utf8')
      const result = applyPlugin(source, filename, runtime)
      return {
        format: toNodeLoaderFormat(result.format || expectedFormat),
        source: result.code,
        shortCircuit: true,
      }
    }
  }
  if (!next) {
    throw new Error('No default loader available for ' + url)
  }
  const forwarded = await next(url, context)
  if (forwarded) return forwarded
  throw new Error('Loader did not return a result for ' + url)
}
