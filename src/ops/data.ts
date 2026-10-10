import type { PinQueryType } from 'kubo-rpc-client'
import type { FieldDef, Operation, Values } from './types.ts'
import { bytesFields, bytesOf, cidVersion, cidVersionField, hashAlgField } from './common.ts'
import { bool, cid, files, fileBytes, int, json, list, ma, required, text } from '../lib/parse.ts'

type RemotePinStatus = 'queued' | 'pinning' | 'pinned' | 'failed'

const cidField: FieldDef = { name: 'cid', label: 'cid', type: 'text', required: true, placeholder: 'bafy…' }

const serviceField: FieldDef = {
  name: 'service',
  label: 'service',
  type: 'text',
  required: true,
  placeholder: 'Name of a configured remote pinning service',
}

const remoteQueryFields: FieldDef[] = [
  serviceField,
  { name: 'cids', label: 'cid filter (one per line)', type: 'list' },
  { name: 'name', label: 'name filter', type: 'text' },
  {
    name: 'status',
    label: 'status filter (comma separated)',
    type: 'text',
    placeholder: 'queued, pinning, pinned, failed',
  },
]

function remoteQuery(v: Values) {
  const cids = list(v.cids).map(cid)
  const status = list(v.status) as RemotePinStatus[]
  return {
    service: required(v.service, 'service'),
    cid: cids.length ? cids : undefined,
    name: text(v.name),
    status: status.length ? status : undefined,
  }
}

export const blockOps: Operation[] = [
  {
    id: 'block.get',
    group: 'block',
    signature: 'block.get(cid, options?) → Promise<Uint8Array>',
    description: 'Fetch a raw block by CID.',
    rpc: ['block/get'],
    output: 'bytes',
    filename: (v) => `${text(v.cid) ?? 'block'}.bin`,
    fields: [cidField],
    run: (client, v, ctx) => client.block.get(cid(required(v.cid, 'cid')), ctx.opts),
  },
  {
    id: 'block.put',
    group: 'block',
    signature: 'block.put(block, options?) → Promise<CID>',
    description: 'Store raw bytes as a block.',
    rpc: ['block/put'],
    fields: [
      ...bytesFields,
      { name: 'format', label: 'format (codec)', type: 'text', placeholder: 'raw', advanced: true },
      { name: 'mhtype', label: 'mhtype', type: 'text', placeholder: 'sha2-256', advanced: true },
      { ...cidVersionField, name: 'version', label: 'version' },
      { name: 'pin', label: 'pin', type: 'boolean', advanced: true },
      { name: 'allowBigBlock', label: 'allowBigBlock', type: 'boolean', advanced: true },
    ],
    run: async (client, v, ctx) =>
      client.block.put(await bytesOf(v), {
        format: text(v.format),
        mhtype: text(v.mhtype),
        version: cidVersion({ cidVersion: v.version }),
        pin: bool(v.pin),
        allowBigBlock: bool(v.allowBigBlock),
        ...ctx.opts,
      }),
  },
  {
    id: 'block.stat',
    group: 'block',
    signature: 'block.stat(cid, options?) → Promise<BlockStatResult>',
    description: 'Size of a block.',
    rpc: ['block/stat'],
    fields: [cidField],
    run: (client, v, ctx) => client.block.stat(cid(required(v.cid, 'cid')), ctx.opts),
  },
  {
    id: 'block.rm',
    group: 'block',
    signature: 'block.rm(cid | cid[], options?) → AsyncIterable<BlockRmResult>',
    description: 'Remove blocks from the local blockstore.',
    rpc: ['block/rm'],
    danger: 'Remove these blocks from the local blockstore?',
    fields: [
      { name: 'cids', label: 'cids (one per line)', type: 'list', required: true },
      { name: 'force', label: 'force', type: 'boolean', advanced: true },
      { name: 'quiet', label: 'quiet', type: 'boolean', advanced: true },
    ],
    run: (client, v, ctx) => {
      const cids = list(v.cids).map(cid)
      if (cids.length === 0) throw new Error('cids is required')
      return client.block.rm(cids.length === 1 ? cids[0] : cids, {
        force: bool(v.force),
        quiet: bool(v.quiet),
        ...ctx.opts,
      })
    },
  },
]

export const dagOps: Operation[] = [
  {
    id: 'dag.put',
    group: 'dag',
    signature: 'dag.put(node, options?) → Promise<CID>',
    description: 'Store a JSON value as an IPLD node. Use {"/": "bafy…"} to link to other CIDs.',
    rpc: ['dag/put'],
    fields: [
      {
        name: 'node',
        label: 'node (JSON)',
        type: 'json',
        required: true,
        default: '{\n  "hello": "world",\n  "createdBy": "kubo-rpc-explorer"\n}',
      },
      {
        name: 'storeCodec',
        label: 'storeCodec',
        type: 'select',
        options: [{ value: '', label: '(default dag-cbor)' }, { value: 'dag-cbor' }, { value: 'dag-json' }, { value: 'dag-pb' }, { value: 'dag-jose' }, { value: 'raw' }],
      },
      { name: 'inputCodec', label: 'inputCodec', type: 'text', placeholder: 'dag-json', advanced: true },
      hashAlgField,
      { ...cidVersionField, name: 'version', label: 'version' },
      { name: 'pin', label: 'pin', type: 'boolean', advanced: true },
      { name: 'onlyHash', label: 'onlyHash', type: 'boolean', advanced: true },
      {
        name: 'linkify',
        label: 'Convert {"/": "<cid>"} to CID instances',
        type: 'boolean',
        default: true,
        advanced: true,
      },
    ],
    run: (client, v, ctx) => {
      let node = json(v.node, 'node')
      if (v.linkify !== false) node = linkify(node)
      return client.dag.put(node, {
        storeCodec: text(v.storeCodec),
        inputCodec: text(v.inputCodec),
        hashAlg: text(v.hashAlg),
        version: cidVersion({ cidVersion: v.version }),
        pin: bool(v.pin),
        onlyHash: bool(v.onlyHash),
        ...ctx.opts,
      })
    },
  },
  {
    id: 'dag.get',
    group: 'dag',
    signature: 'dag.get(cid, options?) → Promise<DAGGetResult>',
    description: 'Fetch and decode an IPLD node, optionally walking a path inside it.',
    rpc: ['dag/get'],
    fields: [
      cidField,
      { name: 'path', label: 'path', type: 'text', placeholder: '/hello' },
      { name: 'localResolve', label: 'localResolve', type: 'boolean', advanced: true },
    ],
    run: (client, v, ctx) =>
      client.dag.get(cid(required(v.cid, 'cid')), {
        path: text(v.path),
        localResolve: bool(v.localResolve),
        ...ctx.opts,
      }),
  },
  {
    id: 'dag.resolve',
    group: 'dag',
    signature: 'dag.resolve(ipfsPath, options?) → Promise<DAGResolveResult>',
    description: 'Resolve an IPLD path to the CID of the node it lands in plus any remainder path.',
    rpc: ['dag/resolve'],
    fields: [
      { name: 'ipfsPath', label: 'ipfsPath', type: 'text', required: true, placeholder: '/ipfs/bafy…/a/b' },
      { name: 'path', label: 'path', type: 'text', advanced: true },
    ],
    run: (client, v, ctx) =>
      client.dag.resolve(required(v.ipfsPath, 'ipfsPath'), { path: text(v.path), ...ctx.opts }),
  },
  {
    id: 'dag.export',
    group: 'dag',
    signature: 'dag.export(root, options?) → AsyncIterable<Uint8Array>',
    description: 'Export a DAG as a CAR file.',
    rpc: ['dag/export'],
    output: 'bytes',
    filename: (v) => `${text(v.cid) ?? 'dag'}.car`,
    fields: [cidField],
    run: (client, v, ctx) => client.dag.export(cid(required(v.cid, 'cid')), ctx.opts),
  },
  {
    id: 'dag.import',
    group: 'dag',
    signature: 'dag.import(sources, options?) → AsyncIterable<DAGImportResult>',
    description: 'Import one or more CAR files.',
    rpc: ['dag/import'],
    fields: [
      { name: 'cars', label: 'CAR files', type: 'file', multiple: true, required: true },
      { name: 'pinRoots', label: 'pinRoots', type: 'boolean' },
    ],
    run: async function* (client, v, ctx) {
      const cars = files(v.cars)
      if (cars.length === 0) throw new Error('Choose at least one CAR file')
      const sources = await Promise.all(cars.map(fileBytes))
      yield* client.dag.import(
        sources.map((bytes) => (async function* () { yield bytes })()),
        { pinRoots: bool(v.pinRoots), ...ctx.opts },
      )
    },
  },
]

/** Recursively turns `{"/": "<cid>"}` objects into CID instances. */
function linkify(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(linkify)
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    if (keys.length === 1 && keys[0] === '/' && typeof obj['/'] === 'string') {
      try {
        return cid(obj['/'])
      } catch {
        return obj
      }
    }
    return Object.fromEntries(keys.map((k) => [k, linkify(obj[k])]))
  }
  return value
}

export const objectOps: Operation[] = [
  {
    id: 'object.patch.addLink',
    group: 'object',
    signature: 'object.patch.addLink(cid, link, options?) → Promise<CID>',
    description: 'Add a named link to a dag-pb node, returning the new node CID.',
    rpc: ['object/patch/add-link'],
    fields: [
      { ...cidField, label: 'cid (dag-pb node)' },
      { name: 'name', label: 'link Name', type: 'text', required: true },
      { name: 'hash', label: 'link Hash (CID)', type: 'text', required: true },
      { name: 'tsize', label: 'link Tsize', type: 'number', advanced: true },
    ],
    run: (client, v, ctx) =>
      client.object.patch.addLink(
        cid(required(v.cid, 'cid')),
        { Name: required(v.name, 'Name'), Hash: cid(required(v.hash, 'Hash')), Tsize: int(v.tsize) },
        ctx.opts,
      ),
  },
  {
    id: 'object.patch.rmLink',
    group: 'object',
    signature: 'object.patch.rmLink(cid, link | name, options?) → Promise<CID>',
    description: 'Remove a named link from a dag-pb node, returning the new node CID.',
    rpc: ['object/patch/rm-link'],
    fields: [
      { ...cidField, label: 'cid (dag-pb node)' },
      { name: 'name', label: 'link name', type: 'text', required: true },
    ],
    run: (client, v, ctx) =>
      client.object.patch.rmLink(cid(required(v.cid, 'cid')), required(v.name, 'name'), ctx.opts),
  },
]

export const refsOps: Operation[] = [
  {
    id: 'refs',
    group: 'refs',
    signature: 'refs(ipfsPath | ipfsPath[], options?) → AsyncIterable<RefsResult>',
    description: 'List the links (references) from one or more objects.',
    rpc: ['refs'],
    fields: [
      { name: 'paths', label: 'paths (one per line)', type: 'list', required: true, placeholder: '/ipfs/bafy…' },
      { name: 'recursive', label: 'recursive', type: 'boolean' },
      { name: 'unique', label: 'unique', type: 'boolean', advanced: true },
      { name: 'edges', label: 'edges', type: 'boolean', advanced: true },
      { name: 'format', label: 'format', type: 'text', placeholder: '<src> -> <dst> [<linkname>]', advanced: true },
      { name: 'maxDepth', label: 'maxDepth', type: 'number', advanced: true },
    ],
    run: (client, v, ctx) => {
      const paths = list(v.paths)
      if (paths.length === 0) throw new Error('paths is required')
      return client.refs(paths.length === 1 ? paths[0] : paths, {
        recursive: bool(v.recursive),
        unique: bool(v.unique),
        edges: bool(v.edges),
        format: text(v.format),
        maxDepth: int(v.maxDepth),
        ...ctx.opts,
      })
    },
  },
  {
    id: 'refs.local',
    group: 'refs',
    signature: 'refs.local(options?) → AsyncIterable<RefsResult>',
    description: 'List every block in the local repo. Can be large.',
    rpc: ['refs/local'],
    fields: [],
    run: (client, _v, ctx) => client.refs.local(ctx.opts),
  },
]

export const pinOps: Operation[] = [
  {
    id: 'pin.add',
    group: 'pin',
    signature: 'pin.add(cid | path, options?) → Promise<CID>',
    description: 'Pin a CID or path so it is not garbage collected.',
    rpc: ['pin/add'],
    fields: [
      { name: 'path', label: 'cid or path', type: 'text', required: true },
      { name: 'name', label: 'name', type: 'text' },
      { name: 'recursive', label: 'recursive', type: 'boolean', advanced: true },
      { name: 'preload', label: 'preload', type: 'boolean', advanced: true },
      { name: 'lock', label: 'lock', type: 'boolean', advanced: true },
    ],
    run: (client, v, ctx) =>
      client.pin.add(required(v.path, 'cid or path'), {
        name: text(v.name),
        recursive: bool(v.recursive),
        preload: bool(v.preload),
        lock: bool(v.lock),
        ...ctx.opts,
      }),
  },
  {
    id: 'pin.addAll',
    group: 'pin',
    signature: 'pin.addAll(source, options?) → AsyncIterable<CID>',
    description: 'Pin many CIDs / paths. Each line becomes a PinAddInput; lines starting with / are paths.',
    rpc: ['pin/add'],
    fields: [
      { name: 'items', label: 'cids or paths (one per line)', type: 'list', required: true },
      { name: 'recursive', label: 'recursive (per item)', type: 'boolean' },
      { name: 'name', label: 'name', type: 'text', advanced: true },
      { name: 'preload', label: 'preload', type: 'boolean', advanced: true },
      { name: 'lock', label: 'lock', type: 'boolean', advanced: true },
    ],
    run: (client, v, ctx) => {
      const items = list(v.items).map((s) =>
        s.startsWith('/') ? { path: s, recursive: bool(v.recursive) } : { cid: cid(s), recursive: bool(v.recursive) },
      )
      if (items.length === 0) throw new Error('Provide at least one item')
      return client.pin.addAll(items, {
        name: text(v.name),
        preload: bool(v.preload),
        lock: bool(v.lock),
        ...ctx.opts,
      })
    },
  },
  {
    id: 'pin.ls',
    group: 'pin',
    signature: 'pin.ls(options?) → AsyncIterable<PinLsResult>',
    description: 'List pins, optionally filtered by type, path or name.',
    rpc: ['pin/ls'],
    fields: [
      {
        name: 'type',
        label: 'type',
        type: 'select',
        default: 'recursive',
        options: [{ value: '', label: '(default all)' }, { value: 'recursive' }, { value: 'direct' }, { value: 'indirect' }, { value: 'all' }],
      },
      { name: 'paths', label: 'paths (one per line)', type: 'list', advanced: true },
      { name: 'name', label: 'name', type: 'text', advanced: true },
      { name: 'names', label: 'names', type: 'boolean', advanced: true },
    ],
    run: (client, v, ctx) => {
      const paths = list(v.paths)
      return client.pin.ls({
        type: text(v.type) as PinQueryType | undefined,
        paths: paths.length ? paths : undefined,
        name: text(v.name),
        names: bool(v.names),
        ...ctx.opts,
      })
    },
  },
  {
    id: 'pin.rm',
    group: 'pin',
    signature: 'pin.rm(cid | path, options?) → Promise<CID>',
    description: 'Unpin a CID or path.',
    rpc: ['pin/rm'],
    fields: [
      { name: 'path', label: 'cid or path', type: 'text', required: true },
      { name: 'recursive', label: 'recursive', type: 'boolean', advanced: true },
    ],
    run: (client, v, ctx) =>
      client.pin.rm(required(v.path, 'cid or path'), { recursive: bool(v.recursive), ...ctx.opts }),
  },
  {
    id: 'pin.rmAll',
    group: 'pin',
    signature: 'pin.rmAll(source, options?) → AsyncIterable<CID>',
    description: 'Unpin many CIDs / paths.',
    rpc: ['pin/rm'],
    fields: [
      { name: 'items', label: 'cids or paths (one per line)', type: 'list', required: true },
      { name: 'recursive', label: 'recursive (per item)', type: 'boolean' },
    ],
    run: (client, v, ctx) => {
      const items = list(v.items).map((s) =>
        s.startsWith('/') ? { path: s, recursive: bool(v.recursive) } : { cid: cid(s), recursive: bool(v.recursive) },
      )
      if (items.length === 0) throw new Error('Provide at least one item')
      return client.pin.rmAll(items, ctx.opts)
    },
  },
  {
    id: 'pin.update',
    group: 'pin',
    signature: 'pin.update(from, to, options?) → Promise<CID[]>',
    description: 'Efficiently replace one recursive pin with another.',
    rpc: ['pin/update'],
    fields: [
      { name: 'from', label: 'from', type: 'text', required: true },
      { name: 'to', label: 'to', type: 'text', required: true },
      { name: 'unpin', label: 'unpin', type: 'boolean' },
    ],
    run: (client, v, ctx) =>
      client.pin.update(required(v.from, 'from'), required(v.to, 'to'), { unpin: bool(v.unpin), ...ctx.opts }),
  },
  {
    id: 'pin.remote.add',
    group: 'pin.remote',
    signature: 'pin.remote.add(cid, options) → Promise<RemotePin>',
    description: 'Ask a remote pinning service to pin a CID.',
    rpc: ['pin/remote/add'],
    fields: [
      cidField,
      serviceField,
      { name: 'name', label: 'name', type: 'text' },
      { name: 'origins', label: 'origins (multiaddrs, one per line)', type: 'list', advanced: true },
      { name: 'background', label: 'background', type: 'boolean', advanced: true },
    ],
    run: (client, v, ctx) => {
      const origins = list(v.origins).map(ma)
      return client.pin.remote.add(cid(required(v.cid, 'cid')), {
        service: required(v.service, 'service'),
        name: text(v.name),
        origins: origins.length ? origins : undefined,
        background: bool(v.background),
        ...ctx.opts,
      })
    },
  },
  {
    id: 'pin.remote.ls',
    group: 'pin.remote',
    signature: 'pin.remote.ls(query) → AsyncIterable<RemotePin>',
    description: 'List pins on a remote pinning service.',
    rpc: ['pin/remote/ls'],
    fields: remoteQueryFields,
    run: (client, v, ctx) => client.pin.remote.ls({ ...remoteQuery(v), ...ctx.opts }),
  },
  {
    id: 'pin.remote.rm',
    group: 'pin.remote',
    signature: 'pin.remote.rm(query) → Promise<void>',
    description: 'Remove a single matching pin from a remote service (errors if more than one matches).',
    rpc: ['pin/remote/rm'],
    danger: 'Remove the matching pin from the remote service?',
    fields: remoteQueryFields,
    run: (client, v, ctx) => client.pin.remote.rm({ ...remoteQuery(v), ...ctx.opts }),
  },
  {
    id: 'pin.remote.rmAll',
    group: 'pin.remote',
    signature: 'pin.remote.rmAll(query) → Promise<void>',
    description: 'Remove every matching pin from a remote service.',
    rpc: ['pin/remote/rm'],
    danger: 'Remove ALL matching pins from the remote service?',
    fields: remoteQueryFields,
    run: (client, v, ctx) => client.pin.remote.rmAll({ ...remoteQuery(v), ...ctx.opts }),
  },
  {
    id: 'pin.remote.service.add',
    group: 'pin.remote',
    signature: 'pin.remote.service.add(name, credentials) → Promise<void>',
    description: 'Register a remote pinning service (IPFS Pinning Service API).',
    rpc: ['pin/remote/service/add'],
    fields: [
      { name: 'name', label: 'name', type: 'text', required: true },
      { name: 'endpoint', label: 'endpoint', type: 'text', required: true, placeholder: 'https://api.pinata.cloud/psa' },
      { name: 'key', label: 'key (access token)', type: 'text', required: true },
    ],
    run: (client, v, ctx) =>
      client.pin.remote.service.add(required(v.name, 'name'), {
        endpoint: new URL(required(v.endpoint, 'endpoint')),
        key: required(v.key, 'key'),
        ...ctx.opts,
      }),
  },
  {
    id: 'pin.remote.service.ls',
    group: 'pin.remote',
    signature: 'pin.remote.service.ls(options?) → Promise<RemotePinService[]>',
    description: 'List registered remote pinning services, optionally with pin counts.',
    rpc: ['pin/remote/service/ls'],
    fields: [{ name: 'stat', label: 'stat', type: 'boolean' }],
    run: (client, v, ctx) =>
      v.stat === true ? client.pin.remote.service.ls({ stat: true, ...ctx.opts }) : client.pin.remote.service.ls(ctx.opts),
  },
  {
    id: 'pin.remote.service.rm',
    group: 'pin.remote',
    signature: 'pin.remote.service.rm(name, options?) → Promise<void>',
    description: 'Unregister a remote pinning service.',
    rpc: ['pin/remote/service/rm'],
    danger: 'Remove this remote pinning service?',
    fields: [{ name: 'name', label: 'name', type: 'text', required: true }],
    run: (client, v, ctx) => client.pin.remote.service.rm(required(v.name, 'name'), ctx.opts),
  },
]

