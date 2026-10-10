import type { Group, Operation } from './types.ts'
import { coreOps } from './core.ts'
import { filesOps } from './files.ts'
import { blockOps, dagOps, objectOps, pinOps, refsOps } from './data.ts'
import { bitswapOps, bootstrapOps, dhtOps, nameOps, pubsubOps, routingOps, swarmOps } from './network.ts'
import { configOps, diagOps, keyOps, logOps, repoOps, statsOps } from './node.ts'
import { utilOps } from './utils.ts'

export const groups: Group[] = [
  { id: 'core', label: 'Core', description: 'Top-level client methods: add, cat, get, ls, id, version…' },
  { id: 'files', label: 'files (MFS)', description: 'Mutable File System: a POSIX-like view over IPFS.' },
  { id: 'block', label: 'block', description: 'Raw blocks in the blockstore.' },
  { id: 'dag', label: 'dag', description: 'IPLD DAG nodes and CAR import/export.' },
  { id: 'object', label: 'object', description: 'dag-pb node patching.' },
  { id: 'refs', label: 'refs', description: 'Walk links between objects.' },
  { id: 'pin', label: 'pin', description: 'Protect content from garbage collection.' },
  { id: 'pin.remote', label: 'pin.remote', description: 'Remote pinning services.' },
  { id: 'name', label: 'name (IPNS)', description: 'Publish and resolve IPNS names.' },
  { id: 'key', label: 'key', description: 'Keystore management.' },
  { id: 'pubsub', label: 'pubsub', description: 'Publish/subscribe messaging.' },
  { id: 'swarm', label: 'swarm', description: 'Peer connections.' },
  { id: 'bootstrap', label: 'bootstrap', description: 'Bootstrap peer list.' },
  { id: 'routing', label: 'routing', description: 'Content and peer routing.' },
  { id: 'dht', label: 'dht', description: 'Kademlia DHT queries.' },
  { id: 'bitswap', label: 'bitswap', description: 'Block exchange.' },
  { id: 'stats', label: 'stats / provide', description: 'Bandwidth, bitswap, repo and provider stats.' },
  { id: 'repo', label: 'repo', description: 'Repository stats and garbage collection.' },
  { id: 'config', label: 'config', description: 'Node configuration.' },
  { id: 'log', label: 'log', description: 'Logging subsystems and live event log.' },
  { id: 'diag', label: 'diag', description: 'Diagnostics.' },
  { id: 'ipld', label: 'IPLD utilities', description: 'Client-side bases, codecs, hashers and CID tools.' },
]

export const operations: Operation[] = [
  ...coreOps,
  ...filesOps,
  ...blockOps,
  ...dagOps,
  ...objectOps,
  ...refsOps,
  ...pinOps,
  ...nameOps,
  ...keyOps,
  ...pubsubOps,
  ...swarmOps,
  ...bootstrapOps,
  ...routingOps,
  ...dhtOps,
  ...bitswapOps,
  ...statsOps,
  ...repoOps,
  ...configOps,
  ...logOps,
  ...diagOps,
  ...utilOps,
]

export const operationsById = new Map(operations.map((op) => [op.id, op]))

export function rpcDocsUrl(endpoint: string): string {
  return `https://docs.ipfs.tech/reference/kubo/rpc/#api-v0-${endpoint.replaceAll('/', '-')}`
}

export type { Group, Operation }
