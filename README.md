# @hirarijs/loader

Pluggable runtime loader for HirariJS. Supports both ESM and CJS entry points, resolves plugins from `hirari.json`, and can be preloaded via `--loader`, `-r`, or `--import` (Node 20+).

## Packages

- `@hirarijs/loader`: core runtime, config loader, plugin resolver, and Node hooks.
- `@hirarijs/loader-ts`: TypeScript transformer.
- `@hirarijs/loader-tsx`: TSX/JSX transformer.
- `@hirarijs/loader-vue`: Vue SFC transformer.

## `hirari.json` (project config)

```json
{
  "loader": {
    "plugins": [
      "@hirarijs/loader-ts",
      "@hirarijs/loader-tsx",
      "@hirarijs/loader-vue"
    ],
    "pluginOptions": {
      "@hirarijs/loader-ts": {
        "format": "esm",
        "ignoreNodeModules": true
      },
      "@hirarijs/loader-tsx": {
        "format": "esm",
        "ignoreNodeModules": true,
        "jsx": "transform",
        "jsxFactory": "h"
      },
      "@hirarijs/loader-vue": {
        "ignoreNodeModules": true
      }
    },
    "autoInstall": true,
    "debug": false
  }
}
```

- Files without a matching plugin use format inference (extension + nearest `package.json` `type`) for CJS/ESM.
- TS/TSX output format is set per plugin (`format`, default `esm`); JSX behavior is configurable via `jsx`/`jsxFactory`/`jsxFragment`/`jsxImportSource`/`jsxDev`.
- Plugins may expose an optional `resolve` hook. TS/TSX use tsconfig `baseUrl/paths` to map bare imports to source outside `node_modules`; otherwise resolution falls back to Node defaults.
- `autoInstall` installs missing plugins; `debug` emits verbose logs.

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
