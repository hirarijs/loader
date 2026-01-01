# @hirarijs/loader (monorepo)

Draft of a pluggable runtime loader for HirariJS. It can be used both as a Node `--loader` (ESM) and `-r` (CJS) hook, and resolves plugins from a shared `hirari.json` config at the app root.

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

### CJS `-r`

```
node -r @hirarijs/loader/register your-app.ts
```

### ESM `--loader`

```
node --loader @hirarijs/loader/loader your-app.ts
```

## Development

- Root uses npm workspaces (`packages/*`).
- Build all packages: `npm run build`
- Each package uses `tsup` to emit dual CJS/ESM bundles with dts.
