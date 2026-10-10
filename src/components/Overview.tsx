import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { IDResult, KuboRPCClient, RepoStatResult, VersionResult } from 'kubo-rpc-client'
import { selfTestSteps, type TestStep } from '../lib/selftest.ts'
import { formatBytes } from '../lib/values.ts'
import { operations } from '../ops/index.ts'
import type { HistoryEntry } from './OperationView.tsx'
import { CopyButton } from './CopyButton.tsx'

interface NodeInfo {
  id?: IDResult
  version?: VersionResult
  repo?: RepoStatResult
  peers?: number
  error?: string
}

type StepResult = { status: 'pending' | 'running' | 'pass' | 'warn' | 'fail' | 'skip'; detail?: string; ms?: number }

interface Props {
  client: KuboRPCClient
  endpoint: string
  history: HistoryEntry[]
  onNavigate: (route: string) => void
  onOpenConnection: () => void
}

export function Overview({ client, endpoint, history, onNavigate, onOpenConnection }: Props) {
  const [info, setInfo] = useState<NodeInfo>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    // Parent remounts this component (via key) when the connection changes.
    void (async () => {
      try {
        const [id, version] = await Promise.all([client.id({ signal }), client.version({ signal })])
        setInfo({ id, version })
        const [repo, peers] = await Promise.allSettled([client.repo.stat({ signal }), client.swarm.peers({ signal })])
        setInfo({
          id,
          version,
          repo: repo.status === 'fulfilled' ? repo.value : undefined,
          peers: peers.status === 'fulfilled' ? peers.value.length : undefined,
        })
      } catch (err) {
        if (!signal.aborted) setInfo({ error: (err as Error).message })
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [client])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-white">Kubo RPC Explorer</h1>
        <p className="mt-1 text-sm text-slate-400">
          Exercise all {operations.length} methods of <code className="text-teal-300">kubo-rpc-client</code> against your
          node. Pick a method from the sidebar, or run the self-test below for a quick end-to-end check.
        </p>
      </header>

      <section className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold">Node</h2>
          <span className="font-mono text-xs text-slate-500">{endpoint}</span>
          <button type="button" className="ml-auto cursor-pointer text-xs text-teal-400 hover:text-teal-300" onClick={onOpenConnection}>
            Connection settings
          </button>
        </div>
        {loading && !info.id && <p className="text-sm text-slate-400">Connecting…</p>}
        {info.error && (
          <div className="space-y-2 rounded border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">
            <p className="font-mono break-all">{info.error}</p>
            <p className="text-xs text-rose-300/80">
              Check that the node is running and reachable from this machine, then either set <code>KUBO_API_URL</code> and use
              the dev-server proxy, or allow this origin via CORS on the node.
            </p>
          </div>
        )}
        {info.id && (
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Peer ID">
              <span className="font-mono text-xs break-all">{info.id.id.toString()}</span>
              <CopyButton text={info.id.id.toString()} />
            </Stat>
            <Stat label="Version">
              {info.version?.version}
              <span className="ml-1 text-xs text-slate-500">{info.version?.commit?.slice(0, 7)}</span>
            </Stat>
            <Stat label="Agent">{info.id.agentVersion}</Stat>
            <Stat label="System">{info.version?.system}</Stat>
            <Stat label="Repo size">
              {info.repo ? `${formatBytes(info.repo.repoSize)} / ${formatBytes(info.repo.storageMax)}` : '—'}
            </Stat>
            <Stat label="Objects">{info.repo ? info.repo.numObjects.toLocaleString() : '—'}</Stat>
            <Stat label="Connected peers">{info.peers ?? '—'}</Stat>
            <Stat label="Listen addrs">{info.id.addresses.length}</Stat>
          </dl>
        )}
      </section>

      <SelfTest client={client} />

      {history.length > 0 && (
        <section className="card">
          <h2 className="border-b border-slate-800 px-4 py-2 text-sm font-semibold">Recent calls</h2>
          <ul className="divide-y divide-slate-800">
            {history.slice(0, 25).map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(`op/${h.opId}`)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-xs hover:bg-slate-800/50"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${h.status === 'done' ? 'bg-emerald-400' : h.status === 'error' ? 'bg-rose-500' : 'bg-slate-500'}`}
                  />
                  <span className="w-44 shrink-0 truncate font-mono text-slate-200">{h.opId}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-slate-500">{h.summary}</span>
                  <span className="shrink-0 text-slate-500">{h.durationMs.toFixed(0)} ms</span>
                  <span className="shrink-0 text-slate-600">{h.at.toLocaleTimeString()}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-1 text-slate-200">{children}</dd>
    </div>
  )
}

function SelfTest({ client }: { client: KuboRPCClient }) {
  const [steps, setSteps] = useState<TestStep[]>(() => selfTestSteps())
  const [results, setResults] = useState<Record<string, StepResult>>({})
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const run = async () => {
    const fresh = selfTestSteps()
    setSteps(fresh)
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    const res: Record<string, StepResult> = Object.fromEntries(fresh.map((s) => [s.name, { status: 'pending' }]))
    setResults({ ...res })
    const vars: Record<string, unknown> = {}
    for (const step of fresh) {
      if (controller.signal.aborted) break
      if (step.needs?.some((n) => res[n]?.status !== 'pass')) {
        res[step.name] = { status: 'skip', detail: `needs ${step.needs.join(', ')}` }
        setResults({ ...res })
        continue
      }
      res[step.name] = { status: 'running' }
      setResults({ ...res })
      const t0 = performance.now()
      try {
        const detail = await step.run({ client, signal: controller.signal, vars })
        res[step.name] = { status: 'pass', detail, ms: performance.now() - t0 }
      } catch (err) {
        const detail = (err as Error).message
        // Features switched off in the node config are a warning, not a client failure.
        const status = /not enabled|--enable-/i.test(detail) ? 'warn' : 'fail'
        res[step.name] = { status, detail, ms: performance.now() - t0 }
      }
      setResults({ ...res })
    }
    setRunning(false)
  }

  const values = Object.values(results)
  const passed = values.filter((r) => r.status === 'pass').length
  const failed = values.filter((r) => r.status === 'fail').length
  const warned = values.filter((r) => r.status === 'warn').length

  const icon: Record<StepResult['status'], string> = {
    pending: '○',
    running: '◌',
    pass: '✓',
    warn: '!',
    fail: '✗',
    skip: '–',
  }
  const tone: Record<StepResult['status'], string> = {
    pending: 'text-slate-600',
    running: 'text-sky-300 animate-pulse',
    pass: 'text-emerald-400',
    warn: 'text-amber-400',
    fail: 'text-rose-400',
    skip: 'text-slate-500',
  }

  return (
    <section className="card">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-2">
        <h2 className="text-sm font-semibold">Self-test</h2>
        <span className="text-xs text-slate-500">
          {steps.length} checks · adds a few tiny unpinned blocks and a temporary MFS directory (removed afterwards)
        </span>
        {values.length > 0 && !running && (
          <span className="text-xs">
            <span className="text-emerald-400">{passed} passed</span>
            {warned > 0 && <span className="ml-2 text-amber-400">{warned} disabled on node</span>}
            {failed > 0 && <span className="ml-2 text-rose-400">{failed} failed</span>}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {running && (
            <button type="button" className="btn-secondary py-1 text-xs" onClick={() => abortRef.current?.abort()}>
              Abort
            </button>
          )}
          <button type="button" className="btn-primary py-1 text-xs" disabled={running} onClick={() => void run()}>
            {running ? 'Running…' : values.length ? 'Run again' : 'Run self-test'}
          </button>
        </div>
      </div>
      {values.length > 0 && (
        <ul className="grid gap-x-6 p-4 font-mono text-xs md:grid-cols-2">
          {steps.map((s) => {
            const r = results[s.name] ?? { status: 'pending' }
            return (
              <li key={s.name} className="flex items-baseline gap-2 border-b border-slate-800/60 py-1">
                <span className={`w-3 ${tone[r.status]}`}>{icon[r.status]}</span>
                <span className="w-44 shrink-0 text-slate-200">{s.name}</span>
                <span className={`min-w-0 flex-1 ${r.status === 'fail' ? 'break-words text-rose-300' : r.status === 'warn' ? 'break-words text-amber-300' : 'truncate text-slate-500'}`} title={r.detail}>
                  {r.detail}
                </span>
                {r.ms !== undefined && <span className="shrink-0 text-slate-600">{r.ms.toFixed(0)}ms</span>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
