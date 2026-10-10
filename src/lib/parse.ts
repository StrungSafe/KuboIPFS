import { peerIdFromString } from '@libp2p/peer-id'
import type { PeerId } from '@libp2p/interface'
import { multiaddr, type Multiaddr } from '@multiformats/multiaddr'
import { CID } from 'multiformats/cid'
import { base16 } from 'multiformats/bases/base16'
import { base64 } from 'multiformats/bases/base64'
import type { FieldValue } from '../ops/types.ts'

export function text(value: FieldValue): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

export function required(value: FieldValue, label: string): string {
  const v = text(value)
  if (v === undefined) throw new Error(`${label} is required`)
  return v
}

/** Raw (untrimmed) string value, for content fields where whitespace matters. */
export function raw(value: FieldValue): string {
  return typeof value === 'string' ? value : ''
}

export function int(value: FieldValue): number | undefined {
  const v = text(value)
  if (v === undefined) return undefined
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`"${v}" is not a number`)
  return n
}

export function bool(value: FieldValue): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

export function files(value: FieldValue): File[] {
  return Array.isArray(value) ? value : []
}

export function file(value: FieldValue, label: string): File {
  const f = files(value)[0]
  if (f === undefined) throw new Error(`${label}: choose a file`)
  return f
}

/** Splits on newlines and commas, dropping blanks. */
export function list(value: FieldValue): string[] {
  return raw(value)
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Parses a CID, accepting `/ipfs/<cid>` and `ipfs://<cid>` forms. */
export function cid(value: string): CID {
  const s = value
    .trim()
    .replace(/^ipfs:\/\//, '')
    .replace(/^\/ipfs\//, '')
    .split('/')[0]
  try {
    return CID.parse(s)
  } catch (err) {
    throw new Error(`Invalid CID "${value}": ${(err as Error).message}`)
  }
}

export function peerId(value: string): PeerId {
  try {
    return peerIdFromString(value.trim().replace(/^\/p2p\//, ''))
  } catch (err) {
    throw new Error(`Invalid peer ID "${value}": ${(err as Error).message}`)
  }
}

export function ma(value: string): Multiaddr {
  try {
    return multiaddr(value.trim())
  } catch (err) {
    throw new Error(`Invalid multiaddr "${value}": ${(err as Error).message}`)
  }
}

/** A multiaddr if it starts with `/`, otherwise a peer ID. */
export function maOrPeer(value: string): Multiaddr | PeerId {
  return value.trim().startsWith('/') ? ma(value) : peerId(value)
}

export function json(value: FieldValue, label: string): unknown {
  const v = required(value, label)
  try {
    return JSON.parse(v)
  } catch (err) {
    throw new Error(`${label} is not valid JSON: ${(err as Error).message}`)
  }
}

export type Encoding = 'utf8' | 'hex' | 'base64'

export function decode(value: string, encoding: Encoding): Uint8Array {
  switch (encoding) {
    case 'hex':
      return base16.baseDecode(value.replace(/\s+/g, '').replace(/^0x/, '').toLowerCase())
    case 'base64':
      return base64.baseDecode(value.replace(/\s+/g, '').replace(/=+$/, ''))
    default:
      return new TextEncoder().encode(value)
  }
}

export async function fileBytes(f: File): Promise<Uint8Array> {
  return new Uint8Array(await f.arrayBuffer())
}

/** Seconds since epoch (fractions allowed) → Date for mtime options. */
export function mtime(value: FieldValue): Date | undefined {
  const n = int(value)
  return n === undefined ? undefined : new Date(n * 1000)
}

/** Octal string like `0644` → number. */
export function mode(value: FieldValue): number | undefined {
  const v = text(value)
  if (v === undefined) return undefined
  const n = parseInt(v, 8)
  if (Number.isNaN(n)) throw new Error(`"${v}" is not an octal mode`)
  return n
}
