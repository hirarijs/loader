import fs from 'fs'
import module from 'module'
import { fileURLToPath } from 'url'
import { addHook } from 'pirates'
import * as sourceMapSupport from 'source-map-support'
import { LoaderConfig, ModuleFormat, TransformResult } from './types.js'
import { IMPORT_META_URL_VARIABLE } from './constants.js'
import { loadHirariConfig, getFormat } from './config.js'
import { resolvePlugins, ResolvedPlugin } from './plugin-manager.js'

const map: Record<string, string> = {}

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
  if (!match) return { code }
  const ctx = {
    format: runtime.format,
    loaderConfig: runtime.loaderConfig,
    pluginOptions: match.options,
  }
  const result = match.plugin.transform(code, filename, ctx)
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

export async function loaderResolve(specifier: string, context: any, next: any) {
  if (next) return next(specifier, context, next)
  return { url: specifier }
}

export async function loaderLoad(url: string, context: any, next: any, runtime: RuntimeContext) {
  const { format: expectedFormat } = runtime
  if (url.startsWith('file://')) {
    const filename = fileURLToPath(url)
    const match = pickPlugin(filename, runtime.resolvedPlugins)
    if (match) {
      const source = fs.readFileSync(filename, 'utf8')
      const result = applyPlugin(source, filename, runtime)
      return {
        format: result.format || expectedFormat,
        source: result.code,
        shortCircuit: true,
      }
    }
  }
  if (next) {
    return next(url, { ...context, format: expectedFormat }, next)
  }
  throw new Error('No default loader available for ' + url)
}
