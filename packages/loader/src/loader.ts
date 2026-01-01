import { createRuntime, loaderLoad, loaderResolve } from './runtime.js'

const runtime = createRuntime()

export async function resolve(specifier: string, context: any, next: any) {
  return loaderResolve(specifier, context, next, runtime)
}

export async function load(url: string, context: any, next: any) {
  return loaderLoad(url, context, next, runtime)
}
