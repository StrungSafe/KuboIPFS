import type { ComponentType } from 'react'
import type { KuboRPCClient } from 'kubo-rpc-client'

export type FieldValue = string | boolean | File[] | undefined
export type Values = Record<string, FieldValue>

export type FieldType =
  /** Single-line text. */
  | 'text'
  /** Multi-line text. */
  | 'textarea'
  /** Multi-line, one item per line (or comma separated). */
  | 'list'
  | 'number'
  /** Tri-state: unset / true / false. Unset leaves the option out of the call. */
  | 'boolean'
  | 'select'
  | 'file'
  | 'json'

export interface FieldDef {
  name: string
  label: string
  type: FieldType
  placeholder?: string
  help?: string
  required?: boolean
  default?: FieldValue
  options?: Array<{ value: string; label?: string }>
  /** File fields: allow multiple files. */
  multiple?: boolean
  /** File fields: pick a whole directory. */
  directory?: boolean
  /** Rendered in the collapsible "Options" section. */
  advanced?: boolean
  showIf?: (values: Values) => boolean
}

export interface RunContext {
  /** Spread into every call's options: abort signal + per-call timeout. */
  opts: { signal: AbortSignal; timeout?: string }
  /** Append a line to the call's activity log (progress events etc). */
  log: (line: string) => void
}

export type OperationResult = unknown | Promise<unknown> | AsyncIterable<unknown>

export interface Operation {
  /** Dotted path on the client, e.g. `files.write`. */
  id: string
  group: string
  signature: string
  description: string
  /** Kubo RPC endpoint(s) the method hits, e.g. `files/write`. */
  rpc?: string[]
  fields: FieldDef[]
  /**
   * How to present the result. `bytes` concatenates streamed Uint8Array chunks
   * into a byte viewer; anything else is shown as a value tree, with async
   * iterables streamed item by item.
   */
  output?: 'value' | 'bytes'
  /** Suggested download filename for `bytes` output. */
  filename?: (values: Values) => string
  /** If set, a confirmation prompt shown before running. */
  danger?: string
  /** Runs locally without contacting the node. */
  local?: boolean
  run?: (client: KuboRPCClient, values: Values, ctx: RunContext) => OperationResult
  /** Custom page instead of the generic form + runner. */
  component?: ComponentType<{ client: KuboRPCClient }>
}

export interface Group {
  id: string
  label: string
  description: string
}
