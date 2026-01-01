import fs from 'fs'
import path from 'path'
import { HirariConfig, LoaderConfig, ModuleFormat } from './types.js'

const DEFAULT_CONFIG: Required<Pick<LoaderConfig, 'format' | 'plugins'>> = {
  format: 'cjs',
  plugins: [
    '@hirarijs/loader-ts',
    '@hirarijs/loader-tsx',
    '@hirarijs/loader-vue',
    '@hirarijs/loader-cjs-interop',
  ],
}

export function loadHirariConfig(cwd: string = process.cwd()): LoaderConfig {
  const configPath = path.join(cwd, 'hirari.json')
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG }
  }

  const raw = fs.readFileSync(configPath, 'utf8')
  let parsed: HirariConfig
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Failed to parse hirari.json: ${(error as Error).message}`)
  }

  const loaderConfig: LoaderConfig = parsed.loader || {}
  return {
    ...DEFAULT_CONFIG,
    ...loaderConfig,
    plugins: loaderConfig.plugins?.length
      ? loaderConfig.plugins
      : DEFAULT_CONFIG.plugins,
  }
}

export function getFormat(config: LoaderConfig): ModuleFormat {
  return config.format === 'esm' ? 'esm' : 'cjs'
}
