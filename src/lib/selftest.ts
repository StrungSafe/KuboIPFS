import type { KuboRPCClient } from 'kubo-rpc-client'
import type { CID } from 'multiformats/cid'

export interface TestStep {
  name: string
  /** Returns a short detail string on success; throws on failure. */
  run: (ctx: TestContext) => Promise<string>
  /** Names of earlier steps that must pass first. */
  needs?: string[]
}

export interface TestContext {
  client: KuboRPCClient
  signal: AbortSignal
  vars: Record<string, unknown>
}

async function collect<T>(it: AsyncIterable<T>, limit = Infinity): Promise<T[]> {
  const out: T[] = []
  for await (const x of it) {
    out.push(x)
    if (out.length >= limit) break
  }
  return out
}

function bytesToText(chunks: Uint8Array[]): string {
  const dec = new TextDecoder()
  return chunks.map((c) => dec.decode(c, { stream: true })).join('') + dec.decode()
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

const short = (s: string) => (s.length > 24 ? `${s.slice(0, 12)}…${s.slice(-8)}` : s)

/**
 * A non-destructive tour of the client: content added here is unpinned (so the
 * next GC removes it) and the MFS scratch directory is deleted at the end.
 */
export function selfTestSteps(): TestStep[] {
  const payload = `kubo-rpc-explorer self-test ${new Date().toISOString()}`
  const dir = `/kubo-explorer-selftest-${Date.now()}`

  return [
    { name: 'version', run: async ({ client, signal }) => `Kubo ${(await client.version({ signal })).version}` },
    { name: 'id', run: async ({ client, signal }) => short((await client.id({ signal })).id.toString()) },
    { name: 'isOnline', run: async ({ client }) => String(await client.isOnline()) },
    {
      name: 'commands',
      run: async ({ client, signal }) => {
        // Typed as string[], but Kubo returns a nested { Name, Subcommands } tree.
        const res: unknown = await client.commands({ signal })
        if (Array.isArray(res)) return `${res.length} entries`
        type Node = { Subcommands?: Node[] }
        const count = (node: Node): number => (node.Subcommands ?? []).reduce((n, c) => n + 1 + count(c), 0)
        return `${count(res as Node)} commands (a tree, not string[] as typed)`
      },
    },
    {
      name: 'add',
      run: async ({ client, signal, vars }) => {
        const res = await client.add(payload, { pin: false, cidVersion: 1, signal })
        vars.cid = res.cid
        return short(res.cid.toString())
      },
    },
    {
      name: 'cat',
      needs: ['add'],
      run: async ({ client, signal, vars }) => {
        const text = bytesToText(await collect(client.cat(vars.cid as CID, { signal })))
        assert(text === payload, 'content mismatch')
        return `${text.length} bytes round-tripped`
      },
    },
    {
      name: 'addAll + ls',
      run: async ({ client, signal, vars }) => {
        const results = await collect(
          client.addAll(
            [
              { path: 'a.txt', content: 'A' },
              { path: 'b.txt', content: 'B' },
            ],
            { wrapWithDirectory: true, pin: false, cidVersion: 1, signal },
          ),
        )
        const root = results[results.length - 1]
        vars.dir = root.cid
        const entries = await collect(client.ls(root.cid, { signal }))
        assert(entries.length === 2, `expected 2 entries, got ${entries.length}`)
        return `${entries.map((e) => e.name).join(', ')} in ${short(root.cid.toString())}`
      },
    },
    {
      name: 'refs',
      needs: ['addAll + ls'],
      run: async ({ client, signal, vars }) => `${(await collect(client.refs(vars.dir as CID, { signal }))).length} refs`,
    },
    {
      name: 'get',
      needs: ['add'],
      run: async ({ client, signal, vars }) => {
        const chunks = await collect(client.get(vars.cid as CID, { signal }))
        return `${chunks.reduce((n, c) => n + c.byteLength, 0)} byte tar`
      },
    },
    {
      name: 'block.put / get / stat',
      run: async ({ client, signal }) => {
        const data = new TextEncoder().encode(payload)
        const cid = await client.block.put(data, { signal })
        const back = await client.block.get(cid, { signal })
        assert(new TextDecoder().decode(back) === payload, 'block content mismatch')
        const stat = await client.block.stat(cid, { signal })
        return `${short(cid.toString())} · ${stat.size} B`
      },
    },
    {
      name: 'dag.put / get / resolve',
      run: async ({ client, signal }) => {
        const cid = await client.dag.put({ hello: 'world', nested: { n: 1 } }, { signal })
        const { value } = await client.dag.get(cid, { path: '/nested/n', signal })
        assert(value === 1, `expected 1, got ${JSON.stringify(value)}`)
        const res = await client.dag.resolve(`/ipfs/${cid}/nested`, { signal })
        return `${short(cid.toString())} → remainder "${res.remainderPath ?? ''}"`
      },
    },
    {
      name: 'dag.export',
      needs: ['add'],
      run: async ({ client, signal, vars }) => {
        const chunks = await collect(client.dag.export(vars.cid as CID, { signal }))
        return `${chunks.reduce((n, c) => n + c.byteLength, 0)} byte CAR`
      },
    },
    {
      name: 'files.mkdir / write / read',
      run: async ({ client, signal }) => {
        await client.files.mkdir(dir, { parents: true, signal })
        await client.files.write(`${dir}/hello.txt`, payload, { create: true, signal })
        const text = bytesToText(await collect(client.files.read(`${dir}/hello.txt`, { signal })))
        assert(text === payload, 'MFS content mismatch')
        return dir
      },
    },
    {
      name: 'files.cp / mv / stat / ls',
      needs: ['files.mkdir / write / read'],
      run: async ({ client, signal }) => {
        await client.files.cp(`${dir}/hello.txt`, `${dir}/copy.txt`, { signal })
        await client.files.mv(`${dir}/copy.txt`, `${dir}/moved.txt`, { signal })
        const stat = await client.files.stat(dir, { signal })
        const names = (await collect(client.files.ls(dir, { signal }))).map((e) => e.name).sort()
        assert(names.join() === 'hello.txt,moved.txt', `unexpected entries ${names.join()}`)
        return `${stat.type}, ${names.length} entries`
      },
    },
    {
      name: 'files.flush / rm',
      needs: ['files.mkdir / write / read'],
      run: async ({ client, signal }) => {
        const cid = await client.files.flush(dir, { signal })
        await client.files.rm(dir, { recursive: true, signal })
        return `flushed ${short(cid.toString())}, removed`
      },
    },
    {
      name: 'pin.add / ls / rm',
      needs: ['add'],
      run: async ({ client, signal, vars }) => {
        const cid = vars.cid as CID
        await client.pin.add(cid, { signal })
        const pins = await collect(client.pin.ls({ paths: cid, signal }))
        assert(pins.length === 1, 'pin not listed')
        await client.pin.rm(cid, { signal })
        return `${pins[0].type} pin added and removed`
      },
    },
    { name: 'key.list', run: async ({ client, signal }) => `${(await client.key.list({ signal })).length} keys` },
    { name: 'config.get', run: async ({ client, signal }) => `Addresses.API = ${JSON.stringify(await client.config.get('Addresses.API', { signal }))}` },
    {
      name: 'repo.stat / version',
      run: async ({ client, signal }) => {
        const s = await client.repo.stat({ signal })
        return `${s.numObjects} objects, repo v${await client.repo.version({ signal })}`
      },
    },
    {
      name: 'stats.bw',
      run: async ({ client, signal }) => {
        const [bw] = await collect(client.stats.bw({ signal }), 1)
        return `in ${bw.totalIn} B / out ${bw.totalOut} B`
      },
    },
    { name: 'bitswap.stat', run: async ({ client, signal }) => `${(await client.bitswap.stat({ signal })).peers.length} partners` },
    { name: 'bitswap.wantlist', run: async ({ client, signal }) => `${(await client.bitswap.wantlist({ signal })).length} wanted` },
    { name: 'swarm.peers', run: async ({ client, signal }) => `${(await client.swarm.peers({ signal })).length} connected` },
    { name: 'swarm.localAddrs', run: async ({ client, signal }) => `${(await client.swarm.localAddrs({ signal })).length} addrs` },
    { name: 'bootstrap.list', run: async ({ client, signal }) => `${(await client.bootstrap.list({ signal })).Peers.length} peers` },
    { name: 'name.pubsub.state', run: async ({ client, signal }) => `enabled: ${(await client.name.pubsub.state({ signal })).enabled}` },
    { name: 'pubsub.ls', run: async ({ client, signal }) => `${(await client.pubsub.ls({ signal })).length} topics` },
    { name: 'log.ls', run: async ({ client, signal }) => `${Object.keys((await client.log.ls({ signal })) ?? {}).length} fields` },
    { name: 'diag.cmds', run: async ({ client, signal }) => `${(await client.diag.cmds({ signal })).length} commands` },
    { name: 'provide.stat', run: async ({ client, signal }) => Object.keys(await client.provide.stat({ signal })).join(', ') || 'ok' },
  ]
}

