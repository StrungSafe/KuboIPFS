import { readURLContent, urlSource } from 'kubo-rpc-client'
import type { FieldDef, Operation } from './types.ts'
import { addOptionFields, addOptions, contentFields, contentOf } from './common.ts'
import { bool, files, int, mode, mtime, peerId, required, text } from '../lib/parse.ts'

const pathField: FieldDef = {
  name: 'path',
  label: 'IPFS path or CID',
  type: 'text',
  required: true,
  placeholder: '/ipfs/bafy… or bafy…',
}

const lastSegment = (value: unknown, fallback: string) =>
  String(value ?? '').split('/').filter(Boolean).pop() || fallback

export const coreOps: Operation[] = [
  {
    id: 'add',
    group: 'core',
    signature: 'add(entry, options?) → Promise<AddResult>',
    description: 'Import a single file (or text) into the node as UnixFS and return its CID.',
    rpc: ['add'],
    fields: [
      ...contentFields,
      { name: 'path', label: 'path', type: 'text', placeholder: 'hello.txt (optional ToFile path)' },
      { name: 'mode', label: 'mode (octal)', type: 'text', placeholder: '0644', advanced: true },
      { name: 'mtime', label: 'mtime (unix seconds)', type: 'number', advanced: true },
      ...addOptionFields,
    ],
    run: (client, v, ctx) => {
      const content = contentOf(v)
      const path = text(v.path)
      const m = mode(v.mode)
      const t = mtime(v.mtime)
      const entry = path || m !== undefined || t ? { path, content, mode: m, mtime: t } : content
      return client.add(entry, { ...addOptions(v, ctx.log), ...ctx.opts })
    },
  },
  {
    id: 'addAll',
    group: 'core',
    signature: 'addAll(source, options?) → AsyncIterable<AddResult>',
    description:
      'Import many files at once. Pick individual files and/or a folder; folder structure is preserved via webkitRelativePath.',
    rpc: ['add'],
    fields: [
      { name: 'files', label: 'Files', type: 'file', multiple: true },
      { name: 'folder', label: 'Folder', type: 'file', directory: true },
      ...addOptionFields,
      { name: 'enableShardingExperiment', label: 'enableShardingExperiment', type: 'boolean', advanced: true },
      { name: 'shardSplitThreshold', label: 'shardSplitThreshold', type: 'number', advanced: true },
      { name: 'fileImportConcurrency', label: 'fileImportConcurrency', type: 'number', advanced: true },
    ],
    run: (client, v, ctx) => {
      const all = [...files(v.files), ...files(v.folder)]
      if (all.length === 0) throw new Error('Choose at least one file or a folder')
      const source = all.map((f) => ({ path: f.webkitRelativePath || f.name, content: f }))
      return client.addAll(source, {
        ...addOptions(v, ctx.log),
        enableShardingExperiment: bool(v.enableShardingExperiment),
        shardSplitThreshold: int(v.shardSplitThreshold),
        fileImportConcurrency: int(v.fileImportConcurrency),
        ...ctx.opts,
      })
    },
  },
  {
    id: 'urlSource',
    group: 'core',
    signature: 'add(urlSource(url, options?), options?) → Promise<AddResult>',
    description:
      'Fetch a URL in the browser with urlSource() and stream it into add(). The URL must allow CORS from this page.',
    rpc: ['add'],
    fields: [
      { name: 'url', label: 'URL', type: 'text', required: true, placeholder: 'https://example.com/file.txt' },
      ...addOptionFields,
    ],
    run: (client, v, ctx) =>
      client.add(urlSource(required(v.url, 'URL'), { signal: ctx.opts.signal }), {
        ...addOptions(v, ctx.log),
        ...ctx.opts,
      }),
  },
  {
    id: 'readURLContent',
    group: 'core',
    signature: 'readURLContent(url, options?) → AsyncIterable<Uint8Array>',
    description: 'Helper exported by the client: stream the body of any URL (browser fetch, subject to CORS).',
    local: true,
    output: 'bytes',
    fields: [{ name: 'url', label: 'URL', type: 'text', required: true, placeholder: 'https://…' }],
    filename: (v) => lastSegment(v.url, 'download'),
    run: (_client, v, ctx) => readURLContent(required(v.url, 'URL'), { signal: ctx.opts.signal }),
  },
  {
    id: 'cat',
    group: 'core',
    signature: 'cat(ipfsPath, options?) → AsyncIterable<Uint8Array>',
    description: 'Stream the contents of a UnixFS file.',
    rpc: ['cat'],
    output: 'bytes',
    filename: (v) => lastSegment(v.path, 'file'),
    fields: [
      pathField,
      { name: 'offset', label: 'offset', type: 'number', advanced: true },
      { name: 'length', label: 'length', type: 'number', advanced: true },
    ],
    run: (client, v, ctx) =>
      client.cat(required(v.path, 'Path'), { offset: int(v.offset), length: int(v.length), ...ctx.opts }),
  },
  {
    id: 'get',
    group: 'core',
    signature: 'get(ipfsPath, options?) → AsyncIterable<Uint8Array>',
    description: 'Download a file or directory as a TAR stream (optionally gzip compressed).',
    rpc: ['get'],
    output: 'bytes',
    filename: (v) => `${lastSegment(v.path, 'download')}.tar${v.compress === true ? '.gz' : ''}`,
    fields: [
      pathField,
      { name: 'archive', label: 'archive', type: 'boolean', advanced: true },
      { name: 'compress', label: 'compress', type: 'boolean', advanced: true },
      {
        name: 'compressionLevel',
        label: 'compressionLevel',
        type: 'select',
        advanced: true,
        options: [
          { value: '', label: '(default)' },
          ...[-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ value: `${n}` })),
        ],
      },
    ],
    run: (client, v, ctx) =>
      client.get(required(v.path, 'Path'), {
        archive: bool(v.archive),
        compress: bool(v.compress),
        compressionLevel: int(v.compressionLevel) as -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | undefined,
        ...ctx.opts,
      }),
  },
  {
    id: 'ls',
    group: 'core',
    signature: 'ls(ipfsPath, options?) → AsyncIterable<IPFSEntry>',
    description: 'List the links of a UnixFS directory.',
    rpc: ['ls'],
    fields: [pathField],
    run: (client, v, ctx) => client.ls(required(v.path, 'Path'), ctx.opts),
  },
  {
    id: 'id',
    group: 'core',
    signature: 'id(options?) → Promise<IDResult>',
    description: 'Identity of this node, or of another peer when peerId is given.',
    rpc: ['id'],
    fields: [{ name: 'peerId', label: 'peerId', type: 'text', placeholder: '12D3Koo… (optional)' }],
    run: (client, v, ctx) => {
      const p = text(v.peerId)
      return client.id({ peerId: p ? peerId(p) : undefined, ...ctx.opts })
    },
  },
  {
    id: 'version',
    group: 'core',
    signature: 'version(options?) → Promise<VersionResult>',
    description: 'Kubo version, commit, repo version, system and Go version.',
    rpc: ['version'],
    fields: [],
    run: (client, _v, ctx) => client.version(ctx.opts),
  },
  {
    id: 'ping',
    group: 'core',
    signature: 'ping(peerId, options?) → AsyncIterable<PingResult>',
    description: 'Send echo requests to a peer and stream the round-trip times.',
    rpc: ['ping'],
    fields: [
      { name: 'peerId', label: 'peerId', type: 'text', required: true, placeholder: '12D3Koo…' },
      { name: 'count', label: 'count', type: 'number', default: '5' },
    ],
    run: (client, v, ctx) => client.ping(required(v.peerId, 'peerId'), { count: int(v.count), ...ctx.opts }),
  },
  {
    id: 'resolve',
    group: 'core',
    signature: 'resolve(name, options?) → Promise<string>',
    description: 'Resolve an /ipns/, /ipfs/ or DNSLink path to its final /ipfs/ path.',
    rpc: ['resolve'],
    fields: [
      { name: 'name', label: 'name', type: 'text', required: true, placeholder: '/ipns/docs.ipfs.tech' },
      { name: 'recursive', label: 'recursive', type: 'boolean', advanced: true },
      { name: 'cidBase', label: 'cidBase', type: 'text', placeholder: 'base32', advanced: true },
    ],
    run: (client, v, ctx) =>
      client.resolve(required(v.name, 'Name'), {
        recursive: bool(v.recursive),
        cidBase: text(v.cidBase),
        ...ctx.opts,
      }),
  },
  {
    id: 'commands',
    group: 'core',
    signature: 'commands(options?) → Promise<string[]>',
    description: 'List every RPC command the node supports.',
    rpc: ['commands'],
    fields: [],
    run: (client, _v, ctx) => client.commands(ctx.opts),
  },
  {
    id: 'mount',
    group: 'core',
    signature: 'mount(options?) → Promise<MountResult>',
    description: 'Mount /ipfs and /ipns via FUSE on the node host (requires FUSE on the node).',
    rpc: ['mount'],
    fields: [
      { name: 'ipfsPath', label: 'ipfsPath', type: 'text', placeholder: '/ipfs' },
      { name: 'ipnsPath', label: 'ipnsPath', type: 'text', placeholder: '/ipns' },
    ],
    run: (client, v, ctx) => client.mount({ ipfsPath: text(v.ipfsPath), ipnsPath: text(v.ipnsPath), ...ctx.opts }),
  },
  {
    id: 'isOnline',
    group: 'core',
    signature: 'isOnline() → Promise<boolean>',
    description: 'True when id() succeeds and reports at least one listen address.',
    rpc: ['id'],
    fields: [],
    run: (client) => client.isOnline(),
  },
  {
    id: 'getEndpointConfig',
    group: 'core',
    signature: 'getEndpointConfig() → EndpointConfig',
    description: 'The host/port/protocol/path the client is configured to talk to (no network call).',
    local: true,
    fields: [],
    run: (client) => client.getEndpointConfig(),
  },
  {
    id: 'stop',
    group: 'core',
    signature: 'stop(options?) → Promise<void>',
    description: 'Shut down the Kubo daemon. You will need to restart it on the host.',
    rpc: ['shutdown'],
    danger: 'This shuts down your Kubo daemon. Continue?',
    fields: [],
    run: (client, _v, ctx) => client.stop(ctx.opts),
  },
]
