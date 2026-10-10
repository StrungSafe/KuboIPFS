import type { KuboRPCClient } from 'kubo-rpc-client'
import { preview } from './values.ts'

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype

const isNamespace = (v: unknown): v is object => typeof v === 'function' || isPlainObject(v)

/**
 * Drops `undefined` keys from plain-object arguments, so a call behaves like
 * hand-written code that omits unset options. Some client methods merge
 * defaults as `{ default, ...options }`, where an explicit `undefined` would
 * clobber the default (e.g. dag.put's storeCodec).
 */
const omitUndefined = (arg: unknown): unknown =>
  isPlainObject(arg) ? Object.fromEntries(Object.entries(arg).filter(([, v]) => v !== undefined)) : arg

/**
 * Wraps the client so every method invocation is reported (with a preview of
 * its arguments) before it runs. Namespaces like `client.files` and callable
 * namespaces like `client.refs` are wrapped recursively.
 */
export function traceClient(client: KuboRPCClient, onCall: (line: string) => void): KuboRPCClient {
  const wrap = <T extends object>(target: T, path: string[]): T =>
    new Proxy(target, {
      get(t, prop) {
        const value = Reflect.get(t, prop)
        if (typeof prop === 'symbol' || !isNamespace(value)) return value
        return wrap(value, [...path, prop])
      },
      apply(t, thisArg, rawArgs: unknown[]) {
        const args = rawArgs.map(omitUndefined)
        onCall(`client.${path.join('.')}(${args.map((a) => preview(a)).join(', ')})`)
        return Reflect.apply(t as (...a: unknown[]) => unknown, thisArg, args)
      },
    })
  return wrap(client, [])
}
