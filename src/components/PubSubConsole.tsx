import { useState, useSyncExternalStore } from 'react'
import type { KuboRPCClient, Message } from 'kubo-rpc-client'
import { base16 } from 'multiformats/bases/base16'

interface ReceivedMessage {
  n: number
  at: Date
  topic: string
  type: Message['type']
  from?: string
  seq?: string
  data: Uint8Array
}

interface Snapshot {
  client?: KuboRPCClient
  topics: string[]
  messages: ReceivedMessage[]
  errors: string[]
}

// Module-level store so subscriptions survive navigating between pages.
let snapshot: Snapshot = { topics: [], messages: [], errors: [] }
const handlers = new Map<string, (msg: Message) => void>()
const listeners = new Set<() => void>()
let counter = 0

function update(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch }
  listeners.forEach((l) => l())
}

function subscribeStore(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

async function resetForClient(client: KuboRPCClient) {
  const old = snapshot.client
  if (old && old !== client) {
    await Promise.allSettled([...handlers].map(([t, h]) => old.pubsub.unsubscribe(t, h)))
    handlers.clear()
    update({ topics: [] })
  }
  update({ client })
}

const decoder = new TextDecoder('utf-8', { fatal: true })
function render(data: Uint8Array): { text: string; binary: boolean } {
  try {
    return { text: decoder.decode(data), binary: false }
  } catch {
    return { text: base16.baseEncode(data), binary: true }
  }
}

export function PubSubConsole({ client }: { client: KuboRPCClient }) {
  const state = useSyncExternalStore(subscribeStore, () => snapshot)
  const [topic, setTopic] = useState('kubo-explorer')
  const [pubTopic, setPubTopic] = useState('kubo-explorer')
  const [message, setMessage] = useState('hello from the explorer')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [peers, setPeers] = useState<Record<string, string[] | string>>({})

  const fail = (err: unknown) =>
    update({ errors: [...snapshot.errors, `${new Date().toLocaleTimeString()} ${(err as Error).message}`].slice(-20) })

  const subscribe = async () => {
    const t = topic.trim()
    if (!t || handlers.has(t)) return
    setBusy(true)
    try {
      await resetForClient(client)
      const handler = (msg: Message) => {
        const m: ReceivedMessage = {
          n: ++counter,
          at: new Date(),
          topic: msg.topic,
          type: msg.type,
          data: msg.data,
          ...(msg.type === 'signed' ? { from: msg.from.toString(), seq: msg.sequenceNumber.toString() } : {}),
        }
        update({ messages: [...snapshot.messages, m].slice(-1000) })
      }
      await client.pubsub.subscribe(t, handler, {
        onError: (err) => {
          fail(err)
          handlers.delete(t)
          update({ topics: snapshot.topics.filter((x) => x !== t) })
        },
      })
      handlers.set(t, handler)
      update({ topics: [...snapshot.topics, t] })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const unsubscribe = async (t: string) => {
    try {
      await client.pubsub.unsubscribe(t, handlers.get(t))
    } catch (err) {
      fail(err)
    }
    handlers.delete(t)
    update({ topics: snapshot.topics.filter((x) => x !== t) })
  }

  const publish = async () => {
    setBusy(true)
    try {
      await client.pubsub.publish(pubTopic.trim(), new TextEncoder().encode(message))
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const loadPeers = async (t: string) => {
    try {
      const list = await client.pubsub.peers(t)
      setPeers((p) => ({ ...p, [t]: list.map(String) }))
    } catch (err) {
      setPeers((p) => ({ ...p, [t]: (err as Error).message }))
    }
  }

  const shown = state.messages.filter((m) => !filter || m.topic === filter)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        <section className="card space-y-3 p-4">
          <h2 className="text-sm font-semibold">subscribe(topic, handler)</h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void subscribe()
            }}
          >
            <input className="input font-mono" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="topic" />
            <button className="btn-primary shrink-0" disabled={busy}>
              Subscribe
            </button>
          </form>
          {state.topics.length === 0 ? (
            <p className="text-xs text-slate-500">No active subscriptions.</p>
          ) : (
            <ul className="space-y-2">
              {state.topics.map((t) => (
                <li key={t} className="rounded border border-slate-800 p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="truncate font-mono">{t}</span>
                    <button type="button" className="ml-auto cursor-pointer text-slate-400 hover:text-white" onClick={() => void loadPeers(t)}>
                      peers()
                    </button>
                    <button type="button" className="cursor-pointer text-rose-400 hover:text-rose-300" onClick={() => void unsubscribe(t)}>
                      unsubscribe()
                    </button>
                  </div>
                  {peers[t] !== undefined && (
                    <div className="mt-1 font-mono break-all text-slate-500">
                      {typeof peers[t] === 'string' ? peers[t] : peers[t].length ? peers[t].join('\n') : 'no peers on this topic'}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="text-sm font-semibold">publish(topic, data)</h2>
          <input className="input font-mono" value={pubTopic} onChange={(e) => setPubTopic(e.target.value)} placeholder="topic" />
          <textarea className="input font-mono" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          <button type="button" className="btn-primary" disabled={busy || !pubTopic.trim()} onClick={() => void publish()}>
            Publish
          </button>
        </section>

        {state.errors.length > 0 && (
          <section className="card space-y-1 border-rose-900 p-4 text-xs text-rose-300">
            <div className="flex items-center">
              <h2 className="font-semibold">Errors</h2>
              <button type="button" className="ml-auto cursor-pointer text-slate-400 hover:text-white" onClick={() => update({ errors: [] })}>
                clear
              </button>
            </div>
            {state.errors.map((e, i) => (
              <p key={i} className="font-mono break-all">
                {e}
              </p>
            ))}
            <p className="pt-1 text-slate-400">
              Pubsub must be enabled on the node: <code>ipfs config --json Pubsub.Enabled true</code> then restart.
            </p>
          </section>
        )}
      </div>

      <section className="card flex min-h-[420px] flex-col">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2">
          <h2 className="text-sm font-semibold">Messages</h2>
          <span className="text-xs text-slate-500">{shown.length}</span>
          <select className="input ml-auto w-auto py-0.5 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">all topics</option>
            {[...new Set([...state.topics, ...state.messages.map((m) => m.topic)])].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <button type="button" className="cursor-pointer text-xs text-slate-400 hover:text-white" onClick={() => update({ messages: [] })}>
            clear
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-auto p-4">
          {shown.length === 0 && <p className="text-sm text-slate-500">Messages on subscribed topics appear here in real time.</p>}
          {[...shown].reverse().map((m) => {
            const { text, binary } = render(m.data)
            return (
              <div key={m.n} className="rounded border border-slate-800 bg-slate-950/50 p-2 text-xs">
                <div className="flex flex-wrap gap-x-3 text-slate-500">
                  <span>{m.at.toLocaleTimeString()}</span>
                  <span className="font-mono text-teal-300">{m.topic}</span>
                  <span>{m.type}</span>
                  {m.from && <span className="truncate font-mono" title={m.from}>from {m.from.slice(0, 12)}…{m.from.slice(-6)}</span>}
                  {m.seq && <span>seq {m.seq}</span>}
                  {binary && <span className="text-amber-400">binary (hex)</span>}
                </div>
                <pre className="mt-1 font-mono break-all whitespace-pre-wrap text-slate-200">{text}</pre>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
