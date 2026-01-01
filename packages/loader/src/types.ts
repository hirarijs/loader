export type ModuleFormat = 'cjs' | 'esm'

export interface LoaderPluginContext {
  format: ModuleFormat
  loaderConfig: LoaderConfig
  pluginOptions?: Record<string, unknown>
}

export interface TransformResult {
  code: string
  map?: string
  format?: ModuleFormat
  /**
   * When true, loader will continue to next plugin instead of short-circuiting.
   */
  continue?: boolean
}

export interface LoaderPlugin {
  name: string
  /**
   * File extensions this plugin is responsible for, including leading dot.
   */
  extensions: string[]
  /**
   * Match is called with the absolute filename. Return true when the plugin should run.
   */
  match: (filename: string) => boolean
  /**
   * Synchronous transform hook. Should return already-transformed JS.
   */
  transform: (
    code: string,
    filename: string,
    ctx: LoaderPluginContext,
  ) => TransformResult
}

export interface LoaderConfig {
  format?: ModuleFormat
  plugins?: string[]
  pluginOptions?: Record<string, Record<string, unknown>>
  autoInstall?: boolean
  /**
   * @deprecated 全局 ignore 已取消，请使用各插件的 ignoreNodeModules/allowNodeModules 配置。
   */
  hookIgnoreNodeModules?: boolean
  debug?: boolean
}

export interface HirariConfig {
  loader?: LoaderConfig
}
