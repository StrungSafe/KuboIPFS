import { isPeerId } from '@libp2p/interface'
import { isMultiaddr } from '@multiformats/multiaddr'
import { CID } from 'multiformats/cid'
import { base64 } from 'multiformats/bases/base64'

export function isCID(value: unknown): value is CID {
  return value != null && typeof value === 'object' && CID.asCID(value) != null
}

/** Values the tree viewer renders as a single "atom" with its own styling. */
export type Special =
  | { kind: 'cid'; text: string }
  | { kind: 'peer'; text: string }
  | { kind: 'multiaddr'; text: string }
  | { kind: 'bigint'; text: string }
  | { kind: 'bytes'; bytes: Uint8Array }
  | { kind: 'date'; text: string }
  | { kind: 'url'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'function'; text: string }

export function special(value: unknown): Special | undefined {
  if (typeof value === 'bigint') return { kind: 'bigint', text: value.toString() }
  if (typeof value === 'function') return { kind: 'function', text: value.name || 'anonymous' }
  if (value == null || typeof value !== 'object') return undefined
  if (isCID(value)) return { kind: 'cid', text: value.toString() }
  if (isPeerId(value)) return { kind: 'peer', text: value.toString() }
  if (isMultiaddr(value)) return { kind: 'multiaddr', text: value.toString() }
  if (value instanceof Uint8Array) return { kind: 'bytes', bytes: value }
  if (value instanceof Date) return { kind: 'date', text: value.toISOString() }
  if (value instanceof URL) return { kind: 'url', text: value.href }
  if (value instanceof Error) return { kind: 'error', text: `${value.name}: ${value.message}` }
  return undefined
}

/** Converts library results to plain JSON (for copy / download). */
export function toPlain(value: unknown, seen = new WeakSet<object>()): unknown {
  const s = special(value)
  if (s) {
    if (s.kind === 'bytes') return { '/': { bytes: base64.baseEncode(s.bytes) } }
    if (s.kind === 'cid') return { '/': s.text }
    return s.text
  }
  if (value === undefined) return null
  if (value == null || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((v) => toPlain(v, seen))
  if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [String(k), toPlain(v, seen)]))
  if (value instanceof Set) return [...value].map((v) => toPlain(v, seen))
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlain(v, seen)]))
}

export function toJSON(value: unknown): string {
  return JSON.stringify(toPlain(value), null, 2)
}

export function formatBytes(n: number | bigint): string {
  const v = Number(n)
  if (!Number.isFinite(v)) return String(n)
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let i = 0
  let x = v
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024
    i++
  }
  return `${i === 0 ? x : x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2)} ${units[i]}`
}

/** Short, single-line rendering of an argument for the call trace. */
export function preview(value: unknown, depth = 0): string {
  const s = special(value)
  if (s) {
    switch (s.kind) {
      case 'cid':
        return `CID(${s.text})`
      case 'peer':
        return `PeerId(${s.text})`
      case 'multiaddr':
        return `multiaddr(${s.text})`
      case 'bigint':
        return `${s.text}n`
      case 'bytes':
        return `Uint8Array(${s.bytes.byteLength})`
      case 'function':
        return 'ƒ'
      case 'url':
        return `URL(${s.text})`
      default:
        return s.text
    }
  }
  if (typeof value === 'string') return JSON.stringify(value.length > 80 ? `${value.slice(0, 77)}…` : value)
  if (value == null || typeof value !== 'object') return String(value)
  if (value instanceof File) return `File(${JSON.stringify(value.name)}, ${formatBytes(value.size)})`
  if (value instanceof Blob) return `Blob(${formatBytes(value.size)})`
  if (value instanceof AbortSignal) return 'AbortSignal'
  if (depth > 2) return '…'
  if (Array.isArray(value)) {
    const items = value.slice(0, 5).map((v) => preview(v, depth + 1))
    return `[${items.join(', ')}${value.length > 5 ? `, …+${value.length - 5}` : ''}]`
  }
  if (Symbol.asyncIterator in value || Symbol.iterator in value) return 'Iterable'
  const entries = Object.entries(value).filter(([k, v]) => v !== undefined && k !== 'signal')
  if (entries.length === 0) return '{}'
  return `{ ${entries.map(([k, v]) => `${k}: ${preview(v, depth + 1)}`).join(', ')} }`
}
