import { useState, type ReactNode } from 'react'
import { base16 } from 'multiformats/bases/base16'
import { special, type Special } from '../lib/values.ts'
import { CopyButton } from './CopyButton.tsx'

const PAGE = 100

export function ValueView({ value, name, depth = 0 }: { value: unknown; name?: string; depth?: number }) {
  const s = special(value)
  if (s) return <Row name={name}><SpecialValue s={s} /></Row>

  if (value === null || value === undefined) {
    return <Row name={name}><span className="text-slate-500 italic">{String(value)}</span></Row>
  }
  if (typeof value === 'string') {
    return (
      <Row name={name}>
        <span className="break-all whitespace-pre-wrap text-emerald-300">"{value}"</span>
        {value.length > 20 && <CopyButton text={value} className="ml-1 opacity-0 group-hover:opacity-100" />}
      </Row>
    )
  }
  if (typeof value === 'number') return <Row name={name}><span className="text-amber-300">{value}</span></Row>
  if (typeof value === 'boolean') return <Row name={name}><span className="text-fuchsia-300">{String(value)}</span></Row>
  if (typeof value !== 'object') return <Row name={name}><span>{String(value)}</span></Row>

  return <Branch value={value} name={name} depth={depth} />
}

function Branch({ value, name, depth }: { value: object; name?: string; depth: number }) {
  const [open, setOpen] = useState(depth < 2)
  const [limit, setLimit] = useState(PAGE)
  const isArray = Array.isArray(value)
  const entries: Array<[string, unknown]> =
    value instanceof Map
      ? [...value].map(([k, v]) => [String(k), v])
      : isArray
        ? value.map((v, i) => [String(i), v])
        : Object.entries(value)
  const summary = isArray ? `Array(${entries.length})` : entries.length === 0 ? '{}' : `{${entries.length}}`

  return (
    <div className="font-mono text-xs">
      <button
        type="button"
        className="group flex cursor-pointer items-center gap-1 rounded py-0.5 text-left hover:bg-slate-800/60"
        onClick={() => setOpen(!open)}
      >
        <span className="w-3 text-slate-500">{entries.length ? (open ? '▾' : '▸') : ' '}</span>
        {name !== undefined && <span className="text-sky-300">{name}:</span>}
        <span className="text-slate-500">{summary}</span>
      </button>
      {open && entries.length > 0 && (
        <div className="ml-3 border-l border-slate-800 pl-2">
          {entries.slice(0, limit).map(([k, v]) => (
            <ValueView key={k} name={k} value={v} depth={depth + 1} />
          ))}
          {entries.length > limit && (
            <button
              type="button"
              className="cursor-pointer py-1 text-teal-400 hover:underline"
              onClick={() => setLimit(limit + PAGE)}
            >
              Show {Math.min(PAGE, entries.length - limit)} more ({entries.length - limit} hidden)
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ name, children }: { name?: string; children: ReactNode }) {
  return (
    <div className="group flex items-start gap-1 py-0.5 font-mono text-xs">
      <span className="w-3 shrink-0" />
      {name !== undefined && <span className="shrink-0 text-sky-300">{name}:</span>}
      <span className="min-w-0">{children}</span>
    </div>
  )
}

const badge: Record<Special['kind'], string> = {
  cid: 'CID',
  peer: 'PeerId',
  multiaddr: 'Multiaddr',
  bigint: 'bigint',
  bytes: 'Uint8Array',
  date: 'Date',
  url: 'URL',
  error: 'Error',
  function: 'ƒ',
}

const color: Record<Special['kind'], string> = {
  cid: 'text-teal-300',
  peer: 'text-sky-300',
  multiaddr: 'text-indigo-300',
  bigint: 'text-amber-300',
  bytes: 'text-slate-300',
  date: 'text-emerald-300',
  url: 'text-emerald-300',
  error: 'text-rose-300',
  function: 'text-slate-400',
}

function SpecialValue({ s }: { s: Special }) {
  const text =
    s.kind === 'bytes'
      ? `(${s.bytes.byteLength}) ${base16.baseEncode(s.bytes.subarray(0, 32))}${s.bytes.byteLength > 32 ? '…' : ''}`
      : s.kind === 'bigint'
        ? `${s.text}n`
        : s.text
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="rounded bg-slate-800 px-1 text-[10px] tracking-wide text-slate-400 uppercase">{badge[s.kind]}</span>
      <span className={`break-all ${color[s.kind]}`}>{text}</span>
      {(s.kind === 'cid' || s.kind === 'peer' || s.kind === 'multiaddr') && (
        <CopyButton text={s.text} className="opacity-0 group-hover:opacity-100" />
      )}
    </span>
  )
}
