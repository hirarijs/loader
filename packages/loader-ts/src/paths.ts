import fs from 'fs'
import path from 'path'

interface TsConfig {
  compilerOptions?: {
    baseUrl?: string
    paths?: Record<string, string[]>
  }
}

const EXTENSIONS = ['.ts', '.mts', '.cts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

function loadJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function findTsconfig(start: string): string | null {
  let dir = start
  while (true) {
    const candidate = path.join(dir, 'tsconfig.json')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function tryFile(resolved: string): string | null {
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved
  for (const ext of EXTENSIONS) {
    const file = resolved + ext
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file
  }
  return null
}

function matchPath(pattern: string, target: string): string | null {
  if (!pattern.includes('*')) {
    return pattern === target ? '' : null
  }
  const [prefix, suffix] = pattern.split('*')
  if (!target.startsWith(prefix) || !target.endsWith(suffix)) return null
  return target.slice(prefix.length, target.length - suffix.length)
}

export interface PathsResolver {
  resolve: (specifier: string) => string | null
  tsconfigRaw?: any
}

export function createPathsResolver(fromFile: string, debug = false): PathsResolver | null {
  const tsconfigPath = findTsconfig(path.dirname(fromFile))
  if (!tsconfigPath) return null
  const tsconfig = loadJson(tsconfigPath) as TsConfig
  const compilerOptions = tsconfig.compilerOptions || {}
  const baseUrl = compilerOptions.baseUrl
    ? path.resolve(path.dirname(tsconfigPath), compilerOptions.baseUrl)
    : path.dirname(tsconfigPath)
  const paths = compilerOptions.paths || {}
  const hasPaths = Object.keys(paths).length > 0
  if (!hasPaths) return { resolve: () => null, tsconfigRaw: tsconfig }

  if (debug) {
    console.log('[loader-ts] tsconfig paths enabled', {
      tsconfigPath,
      baseUrl,
      paths,
    })
  }

  return {
    resolve(specifier: string) {
      for (const [pattern, replacements] of Object.entries(paths)) {
        const wildcard = matchPath(pattern, specifier)
        if (wildcard === null) continue
        for (const repl of replacements) {
          const replaced = repl.replace('*', wildcard)
          const candidate = path.resolve(baseUrl, replaced)
          const file = tryFile(candidate)
          if (file) {
            if (debug) {
              console.log(`[loader-ts] resolved ${specifier} -> ${file}`)
            }
            return file
          }
        }
      }
      return null
    },
    tsconfigRaw: tsconfig,
  }
}
