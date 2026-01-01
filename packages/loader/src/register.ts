import { createRuntime, registerRequireHooks } from './runtime.js'

export function register(cwd: string = process.cwd()) {
  const runtime = createRuntime(cwd)
  const unregister = registerRequireHooks(runtime)
  return { unregister }
}
