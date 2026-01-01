// ESM-friendly preload entry. Use with:
// node --import @hirarijs/loader/import your-esm-entry.mjs
import { register } from 'node:module'

register('@hirarijs/loader/loader')
