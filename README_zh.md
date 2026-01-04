# @hirarijs/loader

可插拔的 HirariJS 运行时加载器，支持 ESM/CJS 入口，从 `hirari.json` 读取插件配置，可通过 `--loader`、`-r`、`--import` 预加载。

## 包含内容

- `@hirarijs/loader`：核心运行时、配置解析、插件加载、Node 钩子。
- `@hirarijs/loader-ts`：TypeScript 转换。
- `@hirarijs/loader-tsx`：TSX/JSX 转换。
- `@hirarijs/loader-vue`：Vue SFC 转换。

## `hirari.json` 示例

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

- 未匹配插件的文件，按扩展名和最近 `package.json` 的 `type` 推断 CJS/ESM。
- TS/TSX 的输出格式由各自插件的 `format` 控制（默认 `esm`）；JSX 行为可通过 `jsx`、`jsxFactory`、`jsxFragment`、`jsxImportSource`、`jsxDev` 配置。
- 插件可实现可选 `resolve` 钩子；TS/TSX 基于 tsconfig `baseUrl/paths` 将裸导入映射到源码（非 `node_modules`），否则交由 Node 默认解析。
- `autoInstall` 可自动安装缺失插件；`debug` 输出调试日志。

## 用法

- ESM 加载器：`node --loader @hirarijs/loader/loader your-app.ts`
- CJS 预加载（require hook）：`node -r @hirarijs/loader/register-auto your-app.ts`
- ESM 预加载（Node 20+ `--import` + `node:module.register`）：`node --import @hirarijs/loader/import your-app.mjs`

## 开发

- 使用 npm/yarn workspaces（`packages/*`）。
- 构建全部包：`yarn build`
- 运行全部测试：`yarn test`
- 各包使用 `tsup` 生成 CJS/ESM 及 dts。 
