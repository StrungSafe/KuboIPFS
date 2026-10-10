import type { FieldDef, Values } from './types.ts'
import { bool, decode, file, fileBytes, int, raw, text, type Encoding } from '../lib/parse.ts'

/** Content source picker: typed text or an uploaded file. */
export const contentFields: FieldDef[] = [
  {
    name: 'source',
    label: 'Content source',
    type: 'select',
    default: 'text',
    options: [
      { value: 'text', label: 'Text' },
      { value: 'file', label: 'File' },
    ],
  },
  {
    name: 'text',
    label: 'Content',
    type: 'textarea',
    placeholder: 'Hello from the Kubo RPC Explorer!',
    showIf: (v) => v.source !== 'file',
  },
  { name: 'file', label: 'File', type: 'file', showIf: (v) => v.source === 'file' },
]

export function contentOf(values: Values): string | File {
  return values.source === 'file' ? file(values.file, 'File') : raw(values.text)
}

/** Raw bytes picker: text in a chosen encoding, or a file. */
export const bytesFields: FieldDef[] = [
  {
    name: 'source',
    label: 'Bytes source',
    type: 'select',
    default: 'text',
    options: [
      { value: 'text', label: 'Text' },
      { value: 'file', label: 'File' },
    ],
  },
  {
    name: 'encoding',
    label: 'Text encoding',
    type: 'select',
    default: 'utf8',
    options: [{ value: 'utf8', label: 'UTF-8' }, { value: 'hex' }, { value: 'base64' }],
    showIf: (v) => v.source !== 'file',
  },
  { name: 'text', label: 'Data', type: 'textarea', showIf: (v) => v.source !== 'file' },
  { name: 'file', label: 'File', type: 'file', showIf: (v) => v.source === 'file' },
]

export async function bytesOf(values: Values): Promise<Uint8Array> {
  if (values.source === 'file') return fileBytes(file(values.file, 'File'))
  return decode(raw(values.text), (text(values.encoding) ?? 'utf8') as Encoding)
}

export const cidVersionField: FieldDef = {
  name: 'cidVersion',
  label: 'cidVersion',
  type: 'select',
  advanced: true,
  options: [{ value: '', label: '(default)' }, { value: '0' }, { value: '1' }],
}

export const hashAlgField: FieldDef = {
  name: 'hashAlg',
  label: 'hashAlg',
  type: 'text',
  placeholder: 'sha2-256',
  advanced: true,
}

export function cidVersion(values: Values): 0 | 1 | undefined {
  const v = int(values.cidVersion)
  return v === 0 || v === 1 ? v : undefined
}

/** UnixFS import options shared by add / addAll / urlSource. */
export const addOptionFields: FieldDef[] = [
  { name: 'chunker', label: 'chunker', type: 'text', placeholder: 'size-262144', advanced: true },
  cidVersionField,
  hashAlgField,
  { name: 'onlyHash', label: 'onlyHash', type: 'boolean', advanced: true },
  { name: 'pin', label: 'pin', type: 'boolean', advanced: true },
  { name: 'rawLeaves', label: 'rawLeaves', type: 'boolean', advanced: true },
  { name: 'trickle', label: 'trickle', type: 'boolean', advanced: true },
  { name: 'wrapWithDirectory', label: 'wrapWithDirectory', type: 'boolean', advanced: true },
  { name: 'preload', label: 'preload', type: 'boolean', advanced: true },
  { name: 'blockWriteConcurrency', label: 'blockWriteConcurrency', type: 'number', advanced: true },
  { name: 'progress', label: 'Log progress events', type: 'boolean', default: true, advanced: true },
]

export function addOptions(values: Values, log: (line: string) => void) {
  return {
    chunker: text(values.chunker),
    cidVersion: cidVersion(values),
    hashAlg: text(values.hashAlg),
    onlyHash: bool(values.onlyHash),
    pin: bool(values.pin),
    rawLeaves: bool(values.rawLeaves),
    trickle: bool(values.trickle),
    wrapWithDirectory: bool(values.wrapWithDirectory),
    preload: bool(values.preload),
    blockWriteConcurrency: int(values.blockWriteConcurrency),
    progress:
      values.progress === false
        ? undefined
        : (bytes: number, path?: string) => log(`progress: ${bytes} bytes${path ? ` (${path})` : ''}`),
  }
}

/** Options common to MFS mutations. */
export const mfsFields: FieldDef[] = [
  { name: 'flush', label: 'flush', type: 'boolean', advanced: true },
  cidVersionField,
  hashAlgField,
  { name: 'shardSplitThreshold', label: 'shardSplitThreshold', type: 'number', advanced: true },
]

export function mfsOptions(values: Values) {
  return {
    flush: bool(values.flush),
    cidVersion: cidVersion(values),
    hashAlg: text(values.hashAlg),
    shardSplitThreshold: int(values.shardSplitThreshold),
  }
}
