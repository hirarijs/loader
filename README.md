# @hirarijs/loader (monorepo)

Pluggable runtime loader for HirariJS. Supports both ESM and CJS entry points, resolves plugins from `hirari.json`, and can be preloaded via `--loader`, `-r`, or `--import` (Node 20+).

## Packages

- `@hirarijs/loader`: core runtime, config loader, plugin resolver, and Node hooks.
- `@hirarijs/loader-ts`: TypeScript transformer.
- `@hirarijs/loader-tsx`: TSX/JSX transformer.
- `@hirarijs/loader-vue`: Vue SFC transformer.

## hirari.json (per project)

```json
{
  "loader": {
    "format": "cjs",
    "plugins": [
      "@hirarijs/loader-ts",
      "@hirarijs/loader-tsx",
      "@hirarijs/loader-vue"
    ],
    "pluginOptions": {
      "@hirarijs/loader-ts": {},
      "@hirarijs/loader-tsx": {},
      "@hirarijs/loader-vue": {}
    },
    "autoInstall": true,
    "hookIgnoreNodeModules": true
  }
}
```

- `format`: output module format when compiling on the fly (`cjs` or `esm`).
- `plugins`: ordered list of loader plugins to register.
- `pluginOptions`: optional per-plugin config; passed through the `LoaderPluginContext`.
- `autoInstall`: when `true`, missing plugins will be installed with the detected package manager.

## Usage

- ESM loader (standard):  
  `node --loader @hirarijs/loader/loader your-app.ts`

- CJS preload (require hook):  
  `node -r @hirarijs/loader/register-auto your-app.ts`

- ESM preload via Node 20+ `--import` + `node:module.register`:  
  `node --import @hirarijs/loader/import your-app.mjs`

## Development

- Root uses npm workspaces (`packages/*`).
- Build all packages: `yarn build`
- Run tests for all workspaces: `yarn test`
- Each package uses `tsup` to emit dual CJS/ESM bundles with dts.
