import { useCallback, useMemo, useState } from 'react'
import { formatBytes } from '../lib/values.ts'
import { CopyButton } from './CopyButton.tsx'
import { downloadBlob } from '../lib/download.ts'

const PREVIEW_LIMIT = 256 * 1024

function sniffMime(b: Uint8Array): string | undefined {
  const starts = (...sig: number[]) => sig.every((x, i) => b[i] === x)
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png'
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif'
  if (starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45) return 'image/webp'
  if (starts(0x25, 0x50, 0x44, 0x46)) return 'application/pdf'
  const head = new TextDecoder().decode(b.subarray(0, 512)).trimStart()
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml'
  return undefined
}

function looksBinary(b: Uint8Array): boolean {
  const sample = b.subarray(0, 4096)
  let control = 0
  for (const x of sample) if (x === 0 || (x < 9 && x !== 0) || (x > 13 && x < 32)) control++
  return sample.length > 0 && control / sample.length > 0.05
}

function hexDump(b: Uint8Array): string {
  const lines: string[] = []
  for (let off = 0; off < b.length; off += 16) {
    const row = b.subarray(off, off + 16)
    const hex = [...row].map((x) => x.toString(16).padStart(2, '0')).join(' ')
    const ascii = [...row].map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('')
    lines.push(`${off.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${ascii}`)
  }
  return lines.join('\n')
}

export function BytesView({ data, filename }: { data: Uint8Array; filename: string }) {
  const mime = useMemo(() => sniffMime(data), [data])
  const binary = useMemo(() => looksBinary(data), [data])
  const [tab, setTab] = useState<'text' | 'hex' | 'preview'>(mime ? 'preview' : binary ? 'hex' : 'text')
  const head = data.subarray(0, PREVIEW_LIMIT)
  const text = useMemo(() => new TextDecoder().decode(head), [head])
  // Ref callback (React 19 cleanup) so each element owns and revokes its blob URL.
  const attachBlob = useCallback(
    (el: HTMLImageElement | HTMLIFrameElement | null) => {
      if (!el || !mime) return
      const u = URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: mime }))
      el.src = u
      return () => URL.revokeObjectURL(u)
    },
    [data, mime],
  )

  const tabs: Array<['text' | 'hex' | 'preview', string]> = [
    ['text', 'Text'],
    ['hex', 'Hex'],
  ]
  if (mime) tabs.unshift(['preview', `Preview (${mime})`])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
          {formatBytes(data.byteLength)} ({data.byteLength.toLocaleString()} bytes)
        </span>
        <div className="flex overflow-hidden rounded border border-slate-700">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`cursor-pointer px-2 py-0.5 ${tab === id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'text' && <CopyButton text={text} label="Copy text" />}
        <button
          type="button"
          className="btn-secondary ml-auto py-0.5 text-xs"
          onClick={() => downloadBlob(new Blob([data as Uint8Array<ArrayBuffer>], { type: mime ?? 'application/octet-stream' }), filename)}
        >
          Download {filename}
        </button>
      </div>
      {data.byteLength > PREVIEW_LIMIT && tab !== 'preview' && (
        <p className="text-xs text-amber-400">Showing the first {formatBytes(PREVIEW_LIMIT)}. Download for the full content.</p>
      )}
      {tab === 'preview' && mime && (
        <div className="rounded border border-slate-800 bg-slate-950 p-2">
          {mime === 'application/pdf' ? (
            <iframe ref={attachBlob} title="PDF preview" className="h-[480px] w-full" />
          ) : (
            <img ref={attachBlob} alt="Content preview" className="max-h-[480px] max-w-full" />
          )}
        </div>
      )}
      {tab !== 'preview' && (
        <pre className="max-h-[480px] overflow-auto rounded border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-200">
          {tab === 'hex' ? hexDump(head) : text}
        </pre>
      )}
    </div>
  )
}
