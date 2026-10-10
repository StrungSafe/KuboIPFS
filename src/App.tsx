import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KuboRPCClient } from 'kubo-rpc-client'
import { createClient, describeEndpoint, loadSettings, saveSettings, type ConnectionSettings } from './lib/connection.ts'
import { operationsById } from './ops/index.ts'
import type { Operation, Values } from './ops/types.ts'
import { Sidebar } from './components/Sidebar.tsx'
import { OperationView, type HistoryEntry } from './components/OperationView.tsx'
import { Overview } from './components/Overview.tsx'
import { ConnectionDialog } from './components/ConnectionDialog.tsx'

type Health = { status: 'checking' } | { status: 'online'; peer: string; version: string } | { status: 'offline'; error: string }

function readRoute(): string {
  return window.location.hash.replace(/^#\/?/, '')
}

async function probe(client: KuboRPCClient): Promise<Health> {
  try {
    const [id, version] = await Promise.all([client.id({ timeout: '10s' }), client.version({ timeout: '10s' })])
    return { status: 'online', peer: id.id.toString(), version: version.version }
  } catch (err) {
    return { status: 'offline', error: (err as Error).message }
  }
}

function defaults(op: Operation): Values {
  return Object.fromEntries(op.fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default]))
}

export default function App() {
  const [settings, setSettings] = useState<ConnectionSettings>(loadSettings)
  const client = useMemo(() => createClient(settings), [settings])
  // Health is tagged with the client it describes, so a new client reads as "checking".
  const [healthFor, setHealthFor] = useState<{ client: unknown; health: Health }>()
  const health: Health = healthFor?.client === client ? healthFor.health : { status: 'checking' }
  const [route, setRoute] = useState(readRoute)
  const [values, setValues] = useState<Record<string, Values>>({})
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [showConnection, setShowConnection] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    let cancelled = false
    void probe(client).then((h) => {
      if (!cancelled) setHealthFor({ client, health: h })
    })
    return () => {
      cancelled = true
    }
  }, [client])

  const recheckHealth = () => {
    setHealthFor(undefined)
    void probe(client).then((h) => setHealthFor({ client, health: h }))
  }

  const navigate = (r: string) => {
    window.location.hash = r ? `/${r}` : ''
    setNavOpen(false)
  }

  const onHistory = useCallback((entry: Omit<HistoryEntry, 'id'>) => {
    setHistory((h) => [{ ...entry, id: Date.now() + Math.random() }, ...h].slice(0, 200))
  }, [])

  const opId = route.startsWith('op/') ? route.slice(3) : undefined
  const op = opId ? operationsById.get(opId) : undefined
  const opValues = op ? (values[op.id] ?? defaults(op)) : {}

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-slate-800 bg-slate-950/90 px-4 py-2">
        <button
          type="button"
          className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-800 md:hidden"
          aria-label="Toggle navigation"
          onClick={() => setNavOpen(!navOpen)}
        >
          ☰
        </button>
        <button type="button" className="flex cursor-pointer items-center gap-2" onClick={() => navigate('')}>
          <img src="/favicon.svg" alt="" className="h-6 w-6" />
          <span className="font-semibold text-white">Kubo RPC Explorer</span>
        </button>
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={recheckHealth}
            title={health.status === 'offline' ? health.error : 'Click to re-check'}
            className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-slate-800"
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                health.status === 'online' ? 'bg-emerald-400' : health.status === 'offline' ? 'bg-rose-500' : 'animate-pulse bg-amber-400'
              }`}
            />
            <span className="hidden truncate text-slate-300 sm:inline">
              {health.status === 'online'
                ? `Kubo ${health.version} · ${health.peer.slice(0, 8)}…${health.peer.slice(-6)}`
                : health.status === 'offline'
                  ? 'Offline'
                  : 'Connecting…'}
            </span>
          </button>
          <button type="button" className="btn-secondary py-1 text-xs" onClick={() => setShowConnection(true)}>
            Connection
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`${navOpen ? 'fixed inset-x-0 top-[45px] bottom-0 z-40 block' : 'hidden'} w-full shrink-0 border-r border-slate-800 bg-slate-950 md:static md:block md:w-72`}
        >
          <Sidebar current={op?.id} onNavigate={navigate} />
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl p-4 md:p-6">
            {op ? (
              op.component ? (
                <div className="space-y-5">
                  <header className="space-y-2">
                    <h1 className="font-mono text-xl font-semibold text-white">{op.id}</h1>
                    <code className="block font-mono text-sm text-teal-300">client.{op.signature}</code>
                    <p className="text-sm text-slate-400">{op.description}</p>
                  </header>
                  <op.component client={client} />
                </div>
              ) : (
                <OperationView
                  key={`${op.id}:${settings.url}:${settings.mode}`}
                  op={op}
                  client={client}
                  values={opValues}
                  onValuesChange={(v) => setValues((all) => ({ ...all, [op.id]: v }))}
                  onHistory={onHistory}
                />
              )
            ) : opId ? (
              <p className="text-slate-400">
                Unknown method <code>{opId}</code>.
              </p>
            ) : (
              <Overview
                key={JSON.stringify(settings)}
                client={client}
                endpoint={describeEndpoint(settings)}
                history={history}
                onNavigate={navigate}
                onOpenConnection={() => setShowConnection(true)}
              />
            )}
          </div>
        </main>
      </div>

      {showConnection && (
        <ConnectionDialog
          settings={settings}
          onClose={() => setShowConnection(false)}
          onSave={(s) => {
            saveSettings(s)
            setSettings(s)
            setShowConnection(false)
          }}
        />
      )}
    </div>
  )
}
