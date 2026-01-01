// ESM-friendly preload entry. Use with:
// node --import @hirarijs/loader/import your-esm-entry.mjs
import { register } from 'node:module'

// Resolve to a file URL to avoid base-url issues (e.g. data: URLs)
const loaderUrl = new URL('./loader.js', import.meta.url).href
register(loaderUrl)
