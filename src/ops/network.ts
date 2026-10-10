import type { Operation } from './types.ts'
import { bytesFields, bytesOf } from './common.ts'
import { bool, cid, int, list, ma, maOrPeer, peerId, required, text } from '../lib/parse.ts'
import { PubSubConsole } from '../components/PubSubConsole.tsx'

export const swarmOps: Operation[] = [
  {
    id: 'swarm.peers',
    group: 'swarm',
    signature: 'swarm.peers(options?) → Promise<SwarmPeersResult[]>',
    description: 'Peers this node is currently connected to.',
    rpc: ['swarm/peers'],
    fields: [
      { name: 'verbose', label: 'verbose', type: 'boolean', advanced: true },
      { name: 'direction', label: 'direction', type: 'boolean', advanced: true },
      { name: 'streams', label: 'streams', type: 'boolean', advanced: true },
      { name: 'latency', label: 'latency', type: 'boolean', advanced: true },
      { name: 'identify', label: 'identify', type: 'boolean', advanced: true },
    ],
    run: (client, v, ctx) =>
      client.swarm.peers({
        verbose: bool(v.verbose),
        direction: bool(v.direction),
        streams: bool(v.streams),
        latency: bool(v.latency),
        identify: bool(v.identify),
        ...ctx.opts,
      }),
  },
  {
    id: 'swarm.addrs',
    group: 'swarm',
    signature: 'swarm.addrs(options?) → Promise<AddrsResult[]>',
    description: 'Every known address for every known peer.',
    rpc: ['swarm/addrs'],
    fields: [],
    run: (client, _v, ctx) => client.swarm.addrs(ctx.opts),
  },
  {
    id: 'swarm.localAddrs',
    group: 'swarm',
    signature: 'swarm.localAddrs(options?) → Promise<Multiaddr[]>',
    description: 'Addresses this node is listening on.',
    rpc: ['swarm/addrs/local'],
    fields: [],
    run: (client, _v, ctx) => client.swarm.localAddrs(ctx.opts),
  },
  {
    id: 'swarm.connect',
    group: 'swarm',
    signature: 'swarm.connect(multiaddr | peerId, options?) → Promise<void>',
    description: 'Open a connection to a peer by multiaddr (/ip4/…/p2p/…) or peer ID.',
    rpc: ['swarm/connect'],
    fields: [{ name: 'addr', label: 'multiaddr or peerId', type: 'text', required: true }],
    run: (client, v, ctx) => client.swarm.connect(maOrPeer(required(v.addr, 'address')), ctx.opts),
  },
  {
    id: 'swarm.disconnect',
    group: 'swarm',
    signature: 'swarm.disconnect(multiaddr | peerId, options?) → Promise<void>',
    description: 'Close a connection to a peer.',
    rpc: ['swarm/disconnect'],
    fields: [{ name: 'addr', label: 'multiaddr or peerId', type: 'text', required: true }],
    run: (client, v, ctx) => client.swarm.disconnect(maOrPeer(required(v.addr, 'address')), ctx.opts),
  },
]

export const bootstrapOps: Operation[] = [
  {
    id: 'bootstrap.list',
    group: 'bootstrap',
    signature: 'bootstrap.list(options?) → Promise<{ Peers: Multiaddr[] }>',
    description: 'Configured bootstrap peers.',
    rpc: ['bootstrap/list'],
    fields: [],
    run: (client, _v, ctx) => client.bootstrap.list(ctx.opts),
  },
  {
    id: 'bootstrap.add',
    group: 'bootstrap',
    signature: 'bootstrap.add(multiaddr, options?) → Promise<{ Peers: Multiaddr[] }>',
    description: 'Add a bootstrap peer (must include /p2p/<peerId>).',
    rpc: ['bootstrap/add'],
    fields: [{ name: 'addr', label: 'multiaddr', type: 'text', required: true, placeholder: '/ip4/…/tcp/4001/p2p/12D3Koo…' }],
    run: (client, v, ctx) => client.bootstrap.add(ma(required(v.addr, 'multiaddr')), ctx.opts),
  },
  {
    id: 'bootstrap.rm',
    group: 'bootstrap',
    signature: 'bootstrap.rm(multiaddr, options?) → Promise<{ Peers: Multiaddr[] }>',
    description: 'Remove a bootstrap peer.',
    rpc: ['bootstrap/rm'],
    danger: 'Remove this bootstrap peer from the node config?',
    fields: [{ name: 'addr', label: 'multiaddr', type: 'text', required: true }],
    run: (client, v, ctx) => client.bootstrap.rm(ma(required(v.addr, 'multiaddr')), ctx.opts),
  },
]

export const bitswapOps: Operation[] = [
  {
    id: 'bitswap.stat',
    group: 'bitswap',
    signature: 'bitswap.stat(options?) → Promise<BitswapStats>',
    description: 'Bitswap counters: blocks/data sent and received, wantlist, partners.',
    rpc: ['bitswap/stat'],
    fields: [],
    run: (client, _v, ctx) => client.bitswap.stat(ctx.opts),
  },
  {
    id: 'bitswap.wantlist',
    group: 'bitswap',
    signature: 'bitswap.wantlist(options?) → Promise<CID[]>',
    description: 'Blocks this node is currently looking for.',
    rpc: ['bitswap/wantlist'],
    fields: [],
    run: (client, _v, ctx) => client.bitswap.wantlist(ctx.opts),
  },
  {
    id: 'bitswap.wantlistForPeer',
    group: 'bitswap',
    signature: 'bitswap.wantlistForPeer(peerId, options?) → Promise<CID[]>',
    description: 'Blocks a connected peer has asked us for.',
    rpc: ['bitswap/wantlist'],
    fields: [{ name: 'peerId', label: 'peerId', type: 'text', required: true }],
    run: (client, v, ctx) => client.bitswap.wantlistForPeer(peerId(required(v.peerId, 'peerId')), ctx.opts),
  },
]

export const dhtOps: Operation[] = [
  {
    id: 'dht.query',
    group: 'dht',
    signature: 'dht.query(peerId | cid, options?) → AsyncIterable<RoutingQueryEvent>',
    description: 'Find the closest peers to a key by walking the DHT. Streams query events.',
    rpc: ['dht/query'],
    fields: [
      {
        name: 'kind',
        label: 'key type',
        type: 'select',
        default: 'peer',
        options: [
          { value: 'peer', label: 'PeerId' },
          { value: 'cid', label: 'CID' },
        ],
      },
      { name: 'key', label: 'key', type: 'text', required: true },
    ],
    run: (client, v, ctx) => {
      const key = required(v.key, 'key')
      return client.dht.query(v.kind === 'cid' ? cid(key) : peerId(key), ctx.opts)
    },
  },
]

export const routingOps: Operation[] = [
  {
    id: 'routing.findPeer',
    group: 'routing',
    signature: 'routing.findPeer(peerId, options?) → AsyncIterable<RoutingQueryEvent>',
    description: 'Find the addresses of a peer.',
    rpc: ['routing/findpeer'],
    fields: [{ name: 'peerId', label: 'peerId', type: 'text', required: true }],
    run: (client, v, ctx) => client.routing.findPeer(required(v.peerId, 'peerId'), ctx.opts),
  },
  {
    id: 'routing.findProvs',
    group: 'routing',
    signature: 'routing.findProvs(cid, options?) → AsyncIterable<RoutingQueryEvent>',
    description: 'Find peers that can provide a CID.',
    rpc: ['routing/findprovs'],
    fields: [
      { name: 'cid', label: 'cid', type: 'text', required: true },
      { name: 'numProviders', label: 'numProviders', type: 'number', default: '20' },
    ],
    run: (client, v, ctx) =>
      client.routing.findProvs(cid(required(v.cid, 'cid')), { numProviders: int(v.numProviders), ...ctx.opts }),
  },
  {
    id: 'routing.get',
    group: 'routing',
    signature: 'routing.get(key, options?) → AsyncIterable<RoutingQueryEvent>',
    description: 'Get a value from the routing system, e.g. /ipns/<peerId>.',
    rpc: ['routing/get'],
    fields: [{ name: 'key', label: 'key', type: 'text', required: true, placeholder: '/ipns/k51…' }],
    run: (client, v, ctx) => client.routing.get(required(v.key, 'key'), ctx.opts),
  },
  {
    id: 'routing.put',
    group: 'routing',
    signature: 'routing.put(key, value, options?) → AsyncIterable<RoutingQueryEvent>',
    description: 'Put a (signed) record into the routing system, e.g. an IPNS record file.',
    rpc: ['routing/put'],
    fields: [
      { name: 'key', label: 'key', type: 'text', required: true, placeholder: '/ipns/k51…' },
      ...bytesFields,
      { name: 'allowOffline', label: 'allowOffline', type: 'boolean', advanced: true },
    ],
    run: async function* (client, v, ctx) {
      yield* client.routing.put(required(v.key, 'key'), await bytesOf(v), {
        allowOffline: bool(v.allowOffline),
        ...ctx.opts,
      })
    },
  },
  {
    id: 'routing.provide',
    group: 'routing',
    signature: 'routing.provide(cid | cid[], options?) → AsyncIterable<RoutingQueryEvent>',
    description: 'Announce to the network that this node provides the given CIDs.',
    rpc: ['routing/provide'],
    fields: [
      { name: 'cids', label: 'cids (one per line)', type: 'list', required: true },
      { name: 'recursive', label: 'recursive', type: 'boolean' },
    ],
    run: (client, v, ctx) => {
      const cids = list(v.cids).map(cid)
      if (cids.length === 0) throw new Error('cids is required')
      return client.routing.provide(cids.length === 1 ? cids[0] : cids, { recursive: bool(v.recursive), ...ctx.opts })
    },
  },
]

export const nameOps: Operation[] = [
  {
    id: 'name.publish',
    group: 'name',
    signature: 'name.publish(value, options?) → Promise<NamePublishResult>',
    description: 'Publish an IPNS record pointing at a path, signed with the given key (default: self).',
    rpc: ['name/publish'],
    fields: [
      { name: 'value', label: 'value', type: 'text', required: true, placeholder: '/ipfs/bafy…' },
      { name: 'key', label: 'key', type: 'text', placeholder: 'self' },
      { name: 'lifetime', label: 'lifetime', type: 'text', placeholder: '48h', advanced: true },
      { name: 'ttl', label: 'ttl', type: 'text', placeholder: '1m', advanced: true },
      { name: 'resolve', label: 'resolve', type: 'boolean', advanced: true },
      { name: 'allowOffline', label: 'allowOffline', type: 'boolean', advanced: true },
    ],
    run: (client, v, ctx) =>
      client.name.publish(required(v.value, 'value'), {
        key: text(v.key),
        lifetime: text(v.lifetime),
        ttl: text(v.ttl),
        resolve: bool(v.resolve),
        allowOffline: bool(v.allowOffline),
        ...ctx.opts,
      }),
  },
  {
    id: 'name.resolve',
    group: 'name',
    signature: 'name.resolve(name, options?) → AsyncIterable<string>',
    description: 'Resolve an IPNS name. Streams intermediate results.',
    rpc: ['name/resolve'],
    fields: [
      { name: 'name', label: 'name', type: 'text', required: true, placeholder: '/ipns/k51… or docs.ipfs.tech' },
      { name: 'recursive', label: 'recursive', type: 'boolean', advanced: true },
      { name: 'nocache', label: 'nocache', type: 'boolean', advanced: true },
    ],
    run: (client, v, ctx) =>
      client.name.resolve(required(v.name, 'name'), {
        recursive: bool(v.recursive),
        nocache: bool(v.nocache),
        ...ctx.opts,
      }),
  },
  {
    id: 'name.pubsub.state',
    group: 'name',
    signature: 'name.pubsub.state(options?) → Promise<{ enabled }>',
    description: 'Whether IPNS-over-PubSub is enabled.',
    rpc: ['name/pubsub/state'],
    fields: [],
    run: (client, _v, ctx) => client.name.pubsub.state(ctx.opts),
  },
  {
    id: 'name.pubsub.subs',
    group: 'name',
    signature: 'name.pubsub.subs(options?) → Promise<string[]>',
    description: 'IPNS names currently subscribed to over PubSub.',
    rpc: ['name/pubsub/subs'],
    fields: [],
    run: (client, _v, ctx) => client.name.pubsub.subs(ctx.opts),
  },
  {
    id: 'name.pubsub.cancel',
    group: 'name',
    signature: 'name.pubsub.cancel(name, options?) → Promise<{ canceled }>',
    description: 'Cancel an IPNS-over-PubSub subscription.',
    rpc: ['name/pubsub/cancel'],
    fields: [{ name: 'name', label: 'name', type: 'text', required: true, placeholder: '/ipns/k51…' }],
    run: (client, v, ctx) => client.name.pubsub.cancel(required(v.name, 'name'), ctx.opts),
  },
]

export const pubsubOps: Operation[] = [
  {
    id: 'pubsub.subscribe',
    group: 'pubsub',
    signature: 'pubsub.subscribe(topic, handler, options?) / unsubscribe / publish',
    description:
      'Interactive console: subscribe to topics, watch messages arrive live and publish. Requires Pubsub.Enabled=true in the Kubo config.',
    rpc: ['pubsub/sub', 'pubsub/pub'],
    fields: [],
    component: PubSubConsole,
  },
  {
    id: 'pubsub.publish',
    group: 'pubsub',
    signature: 'pubsub.publish(topic, data, options?) → Promise<void>',
    description: 'Publish a message to a topic.',
    rpc: ['pubsub/pub'],
    fields: [{ name: 'topic', label: 'topic', type: 'text', required: true }, ...bytesFields],
    run: async (client, v, ctx) => client.pubsub.publish(required(v.topic, 'topic'), await bytesOf(v), ctx.opts),
  },
  {
    id: 'pubsub.ls',
    group: 'pubsub',
    signature: 'pubsub.ls(options?) → Promise<string[]>',
    description: 'Topics the node is subscribed to.',
    rpc: ['pubsub/ls'],
    fields: [],
    run: (client, _v, ctx) => client.pubsub.ls(ctx.opts),
  },
  {
    id: 'pubsub.peers',
    group: 'pubsub',
    signature: 'pubsub.peers(topic, options?) → Promise<PeerId[]>',
    description: 'Peers we are exchanging messages with on a topic.',
    rpc: ['pubsub/peers'],
    fields: [{ name: 'topic', label: 'topic', type: 'text', required: true }],
    run: (client, v, ctx) => client.pubsub.peers(required(v.topic, 'topic'), ctx.opts),
  },
  {
    id: 'pubsub.unsubscribe',
    group: 'pubsub',
    signature: 'pubsub.unsubscribe(topic, handler?, options?) → Promise<void>',
    description: 'Unsubscribe every handler registered on this client for a topic.',
    fields: [{ name: 'topic', label: 'topic', type: 'text', required: true }],
    run: (client, v, ctx) => client.pubsub.unsubscribe(required(v.topic, 'topic'), undefined, ctx.opts),
  },
]
