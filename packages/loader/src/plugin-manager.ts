import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { LoaderConfig, LoaderPlugin } from './types.js'

export interface ResolvedPlugin {
  plugin: LoaderPlugin
  options: Record<string, unknown> | undefined
}

const PACKAGE_MANAGERS = [
  { lock: 'pnpm-lock.yaml', command: 'pnpm', args: ['add'] },
  { lock: 'yarn.lock', command: 'yarn', args: ['add'] },
  { lock: 'package-lock.json', command: 'npm', args: ['install'] },
  { lock: 'npm-shrinkwrap.json', command: 'npm', args: ['install'] },
]

function detectPackageManager(cwd: string) {
  for (const pm of PACKAGE_MANAGERS) {
    if (fs.existsSync(path.join(cwd, pm.lock))) return pm
  }
  return { command: 'npm', args: ['install'] }
}

function tryRequire(moduleId: string, cwd: string) {
  const req = createRequire(path.join(cwd, 'noop.js'))
  const loaded = req(moduleId)
  return (loaded && (loaded.default || loaded)) as LoaderPlugin
}

function install(pkg: string, cwd: string) {
  const pm = detectPackageManager(cwd)
  const result = spawnSync(pm.command, [...pm.args, pkg], {
    cwd,
    stdio: 'inherit',
    env: process.env,
  })

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${pm.command} ${pm.args.join(' ')} ${pkg} failed`)
  }
}

export function resolvePlugins(
  config: LoaderConfig,
  cwd: string,
): ResolvedPlugin[] {
  const plugins: ResolvedPlugin[] = []
  for (const pluginName of config.plugins || []) {
    let loaded: LoaderPlugin | null = null
    try {
      loaded = tryRequire(pluginName, cwd)
    } catch (error) {
      if (config.autoInstall) {
        console.log(`[hirari-loader] installing missing plugin ${pluginName}`)
        install(pluginName, cwd)
        loaded = tryRequire(pluginName, cwd)
      } else {
        throw new Error(
          `Plugin "${pluginName}" not found. Enable autoInstall or install manually.`,
        )
      }
    }

    if (!loaded) continue
    plugins.push({
      plugin: loaded,
      options: config.pluginOptions?.[pluginName],
    })
  }
  return plugins
}
