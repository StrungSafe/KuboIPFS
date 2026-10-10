import { useCallback, useEffect, useRef, useState } from 'react'
import type { KuboRPCClient } from 'kubo-rpc-client'
import type { Operation, Values } from '../ops/types.ts'
import { rpcDocsUrl } from '../ops/index.ts'
import { traceClient } from '../lib/trace.ts'
import { toJSON } from '../lib/values.ts'
import { FieldInput } from './FieldInput.tsx'
import { ValueView } from './ValueView.tsx'
import { BytesView } from './BytesView.tsx'
import { CopyButton } from './CopyButton.tsx'
import { downloadBlob } from '../lib/download.ts'

export interface HistoryEntry {
  id: number
  opId: string
  at: Date
  durationMs: number
  status: 'done' | 'error' | 'aborted'
  summary: string
}

type Status = 'idle' | 'running' | 'done' | 'error' | 'aborted'

interface RunState {
  status: Status
  startedAt?: number
  durationMs?: number
  log: string[]
  kind?: 'value' | 'stream' | 'bytes'
  value?: unknown
  items: unknown[]
  itemCount: number
  bytes?: Uint8Array
  byteCount: number
  error?: Error
}

const MAX_ITEMS = 5000
const SHOWN_ITEMS = 500
const MAX_LOG = 1000

const initial: RunState = { status: 'idle', log: [], items: [], itemCount: 0, byteCount: 0 }

function isAsyncIterable(v: unknown): v is AsyncIterable<unknown> {
  return v != null && typeof v === 'object' && Symbol.asyncIterator in v
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.byteLength
  }
  return out
}

interface Props {
  op: Operation
  client: KuboRPCClient
  values: Values
  onValuesChange: (values: Values) => void
  onHistory: (entry: Omit<HistoryEntry, 'id'>) => void
}

export function OperationView({ op, client, values, onValuesChange, onHistory }: Props) {
  const [state, setState] = useState<RunState>(initial)
  const abortRef = useRef<AbortController | null>(null)
  const [view, setView] = useState<'tree' | 'json'>('tree')

  useEffect(() => () => abortRef.current?.abort(), [])

  const visible = op.fields.filter((f) => !f.showIf || f.showIf(values))
  const basic = visible.filter((f) => !f.advanced)
  const advanced = visible.filter((f) => f.advanced)
  const setValue = (name: string, v: Values[string]) => onValuesChange({ ...values, [name]: v })

  const execute = useCallback(async () => {
    if (!op.run) return
    if (op.danger && !(op.id === 'config.profiles.apply' && values.dryRun === true) && !window.confirm(op.danger)) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const startedAt = performance.now()

    // Streaming results accumulate here and are flushed to React on a short timer
    // (not rAF, which stalls while the tab is hidden).
    const acc = { log: [] as string[], items: [] as unknown[], itemCount: 0, chunks: [] as Uint8Array[], byteCount: 0 }
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      timer = undefined
      setState((s) => ({
        ...s,
        log: acc.log.slice(-MAX_LOG),
        items: acc.items.slice(-SHOWN_ITEMS),
        itemCount: acc.itemCount,
        byteCount: acc.byteCount,
      }))
    }
    const schedule = () => {
      timer ??= setTimeout(flush, 80)
    }
    const elapsed = () => `${((performance.now() - startedAt) / 1000).toFixed(3)}s`
    const log = (line: string) => {
      acc.log.push(`[${elapsed()}] ${line}`)
      schedule()
    }

    setState({ ...initial, status: 'running', startedAt })

    const timeout = typeof values.__timeout === 'string' && values.__timeout.trim() ? values.__timeout.trim() : undefined
    const traced = traceClient(client, (line) => log(`→ ${line}`))
    let final: Partial<RunState>
    let summary = ''
    try {
      let result = op.run(traced, values, { opts: { signal: controller.signal, timeout }, log })
      if (result instanceof Promise) result = await result

      if (isAsyncIterable(result)) {
        if (op.output === 'bytes') {
          setState((s) => ({ ...s, kind: 'bytes' }))
          for await (const chunk of result as AsyncIterable<Uint8Array>) {
            acc.chunks.push(chunk)
            acc.byteCount += chunk.byteLength
            schedule()
          }
          final = { kind: 'bytes', bytes: concat(acc.chunks, acc.byteCount) }
          summary = `${acc.byteCount} bytes`
        } else {
          setState((s) => ({ ...s, kind: 'stream' }))
          for await (const item of result) {
            acc.items.push(item)
            if (acc.items.length > MAX_ITEMS) acc.items.shift()
            acc.itemCount++
            schedule()
          }
          final = { kind: 'stream' }
          summary = `${acc.itemCount} item${acc.itemCount === 1 ? '' : 's'}`
        }
      } else if (op.output === 'bytes' && result instanceof Uint8Array) {
        acc.byteCount = result.byteLength
        final = { kind: 'bytes', bytes: result }
        summary = `${result.byteLength} bytes`
      } else {
        final = { kind: 'value', value: result }
        summary = result === undefined ? 'ok' : toJSON(result).replace(/\s+/g, ' ').slice(0, 120)
      }
      log(`✓ completed`)
      final.status = 'done'
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      const aborted = controller.signal.aborted
      log(aborted ? '■ aborted' : `✗ ${error.message}`)
      final = { status: aborted ? 'aborted' : 'error', error, kind: acc.chunks.length ? 'bytes' : acc.itemCount ? 'stream' : undefined }
      if (acc.chunks.length) final.bytes = concat(acc.chunks, acc.byteCount)
      summary = aborted ? 'aborted' : error.message
    }
    clearTimeout(timer)
    const durationMs = performance.now() - startedAt
    setState({
      ...initial,
      ...final,
      startedAt,
      durationMs,
      log: acc.log.slice(-MAX_LOG),
      items: acc.items.slice(-SHOWN_ITEMS),
      itemCount: acc.itemCount,
      byteCount: acc.byteCount,
    })
    if (abortRef.current === controller) abortRef.current = null
    onHistory({ opId: op.id, at: new Date(), durationMs, status: final.status as HistoryEntry['status'], summary })
  }, [client, op, values, onHistory])

  const running = state.status === 'running'

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl font-semibold text-white">{op.id}</h1>
          {op.local && <span className="rounded bg-indigo-900/60 px-2 py-0.5 text-xs text-indigo-200">client-side</span>}
          {op.danger && <span className="rounded bg-rose-900/60 px-2 py-0.5 text-xs text-rose-200">mutating</span>}
        </div>
        <code className="block font-mono text-sm break-all text-teal-300">client.{op.signature}</code>
        <p className="text-sm text-slate-400">{op.description}</p>
        {op.rpc && (
          <div className="flex flex-wrap gap-2 text-xs">
            {op.rpc.map((r) => (
              <a
                key={r}
                href={rpcDocsUrl(r)}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-slate-700 px-2 py-0.5 font-mono text-slate-400 hover:border-teal-600 hover:text-teal-300"
              >
                POST /api/v0/{r} ↗
              </a>
            ))}
          </div>
        )}
      </header>

      <form
        className="card space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          void execute()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            void execute()
          }
        }}
      >
        {basic.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {basic.map((f) => (
              <div key={f.name} className={f.type === 'textarea' || f.type === 'json' || f.type === 'list' ? 'md:col-span-2' : ''}>
                <FieldInput field={f} value={values[f.name]} onChange={(v) => setValue(f.name, v)} />
              </div>
            ))}
          </div>
        )}
        {basic.length === 0 && advanced.length === 0 && <p className="text-sm text-slate-500">This method takes no arguments.</p>}
        {advanced.length > 0 && (
          <details className="rounded-md border border-slate-800 bg-slate-950/40">
            <summary className="cursor-pointer px-3 py-2 text-sm text-slate-300 select-none">
              Options <span className="text-slate-500">({advanced.length})</span>
            </summary>
            <div className="grid gap-4 p-3 md:grid-cols-2 lg:grid-cols-3">
              {advanced.map((f) => (
                <div key={f.name} className={f.type === 'textarea' || f.type === 'json' || f.type === 'list' ? 'md:col-span-2 lg:col-span-3' : ''}>
                  <FieldInput field={f} value={values[f.name]} onChange={(v) => setValue(f.name, v)} />
                </div>
              ))}
            </div>
          </details>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4">
          <button type="submit" className={op.danger ? 'btn-danger' : 'btn-primary'} disabled={running}>
            {running ? 'Running…' : 'Run'}
          </button>
          {running && (
            <button type="button" className="btn-secondary" onClick={() => abortRef.current?.abort()}>
              Abort
            </button>
          )}
          {!op.local && (
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <span className="font-mono">timeout</span>
              <input
                className="input w-24 py-1 font-mono text-xs"
                placeholder="e.g. 30s"
                value={typeof values.__timeout === 'string' ? values.__timeout : ''}
                onChange={(e) => setValue('__timeout', e.target.value)}
              />
            </label>
          )}
          <span className="text-xs text-slate-500">Ctrl+Enter to run</span>
          <StatusBadge state={state} />
        </div>
      </form>

      {state.status !== 'idle' && (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2">
            <h2 className="text-sm font-semibold text-slate-200">Result</h2>
            {state.kind === 'stream' && (
              <span className="text-xs text-slate-400">
                {state.itemCount.toLocaleString()} item{state.itemCount === 1 ? '' : 's'}
                {state.itemCount > SHOWN_ITEMS && ` (showing last ${SHOWN_ITEMS})`}
              </span>
            )}
            {state.kind === 'bytes' && running && (
              <span className="text-xs text-slate-400">{state.byteCount.toLocaleString()} bytes received…</span>
            )}
            {(state.kind === 'value' || state.kind === 'stream') && (
              <div className="ml-auto flex items-center gap-1">
                <div className="flex overflow-hidden rounded border border-slate-700 text-xs">
                  {(['tree', 'json'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      className={`cursor-pointer px-2 py-0.5 ${view === v ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                      {v === 'tree' ? 'Tree' : 'JSON'}
                    </button>
                  ))}
                </div>
                <CopyButton text={toJSON(state.kind === 'stream' ? state.items : state.value)} label="Copy JSON" />
                <button
                  type="button"
                  className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  onClick={() =>
                    downloadBlob(
                      new Blob([toJSON(state.kind === 'stream' ? state.items : state.value)], { type: 'application/json' }),
                      `${op.id}.json`,
                    )
                  }
                >
                  Download
                </button>
              </div>
            )}
          </div>
          <div className="max-h-[60vh] overflow-auto p-4">
            {state.error && (
              <div className={`mb-3 rounded border p-3 text-sm ${state.status === 'aborted' ? 'border-slate-700 text-slate-300' : 'border-rose-800 bg-rose-950/40 text-rose-200'}`}>
                <p className="font-mono break-all">
                  {state.status === 'aborted' ? 'Aborted' : `${state.error.name}: ${state.error.message}`}
                </p>
                {state.status === 'error' && /fetch|network|cors/i.test(state.error.message) && (
                  <p className="mt-2 text-xs text-rose-300/80">
                    Network errors usually mean the node is unreachable or CORS is blocking the browser. See the
                    connection settings for the proxy option.
                  </p>
                )}
              </div>
            )}
            {state.kind === 'value' &&
              (state.value === undefined ? (
                <p className="text-sm text-emerald-300">✓ Completed — the method returned no value.</p>
              ) : view === 'tree' ? (
                <ValueView value={state.value} />
              ) : (
                <pre className="font-mono text-xs whitespace-pre-wrap text-slate-200">{toJSON(state.value)}</pre>
              ))}
            {state.kind === 'stream' &&
              (state.items.length === 0 ? (
                <p className="text-sm text-slate-500">{running ? 'Waiting for items…' : 'The stream yielded no items.'}</p>
              ) : view === 'tree' ? (
                <div className="space-y-1">
                  {state.items.map((item, i) => (
                    <div key={state.itemCount - state.items.length + i} className="border-b border-slate-800/60 pb-1">
                      <ValueView name={`#${state.itemCount - state.items.length + i}`} value={item} depth={1} />
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="font-mono text-xs whitespace-pre-wrap text-slate-200">{toJSON(state.items)}</pre>
              ))}
            {state.kind === 'bytes' && state.bytes && (
              <BytesView data={state.bytes} filename={op.filename?.(values) ?? `${op.id}.bin`} />
            )}
          </div>
        </section>
      )}

      {state.log.length > 0 && (
        <details className="card" open>
          <summary className="cursor-pointer px-4 py-2 text-sm font-semibold text-slate-200 select-none">
            Call log <span className="font-normal text-slate-500">({state.log.length})</span>
          </summary>
          <pre className="max-h-64 overflow-auto border-t border-slate-800 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-400">
            {state.log.join('\n')}
          </pre>
        </details>
      )}
    </div>
  )
}

function StatusBadge({ state }: { state: RunState }) {
  if (state.status === 'idle') return null
  const styles: Record<Status, string> = {
    idle: '',
    running: 'bg-sky-900/60 text-sky-200',
    done: 'bg-emerald-900/60 text-emerald-200',
    error: 'bg-rose-900/60 text-rose-200',
    aborted: 'bg-slate-800 text-slate-300',
  }
  return (
    <span className={`ml-auto rounded px-2 py-0.5 text-xs ${styles[state.status]}`}>
      {state.status}
      {state.durationMs !== undefined && ` · ${state.durationMs.toFixed(0)} ms`}
    </span>
  )
}
