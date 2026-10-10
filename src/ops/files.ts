import type { Operation } from './types.ts'
import { contentFields, contentOf, mfsFields, mfsOptions } from './common.ts'
import { bool, int, list, mode, mtime, required, text } from '../lib/parse.ts'

const parentsField = { name: 'parents', label: 'parents', type: 'boolean', advanced: true } as const

export const filesOps: Operation[] = [
  {
    id: 'files.ls',
    group: 'files',
    signature: 'files.ls(path, options?) → AsyncIterable<MFSEntry>',
    description: 'List an MFS directory (or any /ipfs/ path).',
    rpc: ['files/ls'],
    fields: [
      { name: 'path', label: 'path', type: 'text', default: '/', required: true },
      { name: 'long', label: 'long', type: 'boolean', advanced: true },
    ],
    run: (client, v, ctx) => client.files.ls(required(v.path, 'Path'), { long: bool(v.long), ...ctx.opts }),
  },
  {
    id: 'files.stat',
    group: 'files',
    signature: 'files.stat(path, options?) → Promise<FilesStatResult>',
    description: 'Stat an MFS path or /ipfs/ path: CID, size, cumulative size, type, blocks, locality.',
    rpc: ['files/stat'],
    fields: [
      { name: 'path', label: 'path', type: 'text', default: '/', required: true },
      { name: 'hash', label: 'hash', type: 'boolean', advanced: true },
      { name: 'size', label: 'size', type: 'boolean', advanced: true },
      { name: 'withLocal', label: 'withLocal', type: 'boolean', advanced: true },
    ],
    run: (client, v, ctx) =>
      client.files.stat(required(v.path, 'Path'), {
        hash: bool(v.hash),
        size: bool(v.size),
        withLocal: bool(v.withLocal),
        ...ctx.opts,
      }),
  },
  {
    id: 'files.mkdir',
    group: 'files',
    signature: 'files.mkdir(path, options?) → Promise<void>',
    description: 'Create an MFS directory.',
    rpc: ['files/mkdir'],
    fields: [
      { name: 'path', label: 'path', type: 'text', required: true, placeholder: '/explorer-test' },
      { ...parentsField, advanced: false },
      { name: 'mode', label: 'mode (octal)', type: 'text', placeholder: '0755', advanced: true },
      { name: 'mtime', label: 'mtime (unix seconds)', type: 'number', advanced: true },
      ...mfsFields,
    ],
    run: (client, v, ctx) =>
      client.files.mkdir(required(v.path, 'Path'), {
        parents: bool(v.parents),
        mode: mode(v.mode),
        mtime: mtime(v.mtime),
        ...mfsOptions(v),
        ...ctx.opts,
      }),
  },
  {
    id: 'files.write',
    group: 'files',
    signature: 'files.write(path, content, options?) → Promise<void>',
    description: 'Write text or a file to an MFS path.',
    rpc: ['files/write'],
    fields: [
      { name: 'path', label: 'path', type: 'text', required: true, placeholder: '/explorer-test/hello.txt' },
      ...contentFields,
      { name: 'create', label: 'create', type: 'boolean', default: true },
      { name: 'parents', label: 'parents', type: 'boolean', default: true },
      { name: 'truncate', label: 'truncate', type: 'boolean', default: true },
      { name: 'offset', label: 'offset', type: 'number', advanced: true },
      { name: 'length', label: 'length', type: 'number', advanced: true },
      { name: 'rawLeaves', label: 'rawLeaves', type: 'boolean', advanced: true },
      { name: 'reduceSingleLeafToSelf', label: 'reduceSingleLeafToSelf', type: 'boolean', advanced: true },
      {
        name: 'strategy',
        label: 'strategy',
        type: 'select',
        advanced: true,
        options: [{ value: '', label: '(default)' }, { value: 'balanced' }, { value: 'trickle' }],
      },
      { name: 'mode', label: 'mode (octal)', type: 'text', placeholder: '0644', advanced: true },
      { name: 'mtime', label: 'mtime (unix seconds)', type: 'number', advanced: true },
      ...mfsFields,
    ],
    run: (client, v, ctx) =>
      client.files.write(required(v.path, 'Path'), contentOf(v), {
        create: bool(v.create),
        parents: bool(v.parents),
        truncate: bool(v.truncate),
        offset: int(v.offset),
        length: int(v.length),
        rawLeaves: bool(v.rawLeaves),
        reduceSingleLeafToSelf: bool(v.reduceSingleLeafToSelf),
        strategy: (text(v.strategy) as 'balanced' | 'trickle' | undefined) ?? undefined,
        mode: mode(v.mode),
        mtime: mtime(v.mtime),
        progress: (bytes) => ctx.log(`progress: ${bytes} bytes`),
        ...mfsOptions(v),
        ...ctx.opts,
      }),
  },
  {
    id: 'files.read',
    group: 'files',
    signature: 'files.read(path, options?) → AsyncIterable<Uint8Array>',
    description: 'Read a file from MFS (or an /ipfs/ path).',
    rpc: ['files/read'],
    output: 'bytes',
    filename: (v) => String(v.path ?? 'file').split('/').filter(Boolean).pop() || 'file',
    fields: [
      { name: 'path', label: 'path', type: 'text', required: true, placeholder: '/explorer-test/hello.txt' },
      { name: 'offset', label: 'offset', type: 'number', advanced: true },
      { name: 'length', label: 'length', type: 'number', advanced: true },
    ],
    run: (client, v, ctx) =>
      client.files.read(required(v.path, 'Path'), { offset: int(v.offset), length: int(v.length), ...ctx.opts }),
  },
  {
    id: 'files.cp',
    group: 'files',
    signature: 'files.cp(from | from[], to, options?) → Promise<void>',
    description: 'Copy MFS entries or /ipfs/ paths into MFS. Multiple sources copy into a directory.',
    rpc: ['files/cp'],
    fields: [
      { name: 'from', label: 'from (one per line)', type: 'list', required: true, placeholder: '/ipfs/bafy…' },
      { name: 'to', label: 'to', type: 'text', required: true, placeholder: '/explorer-test/copy' },
      parentsField,
      ...mfsFields,
    ],
    run: (client, v, ctx) => {
      const from = list(v.from)
      if (from.length === 0) throw new Error('from is required')
      return client.files.cp(from.length === 1 ? from[0] : from, required(v.to, 'to'), {
        parents: bool(v.parents),
        ...mfsOptions(v),
        ...ctx.opts,
      })
    },
  },
  {
    id: 'files.mv',
    group: 'files',
    signature: 'files.mv(from | from[], to, options?) → Promise<void>',
    description: 'Move / rename MFS entries.',
    rpc: ['files/mv'],
    fields: [
      { name: 'from', label: 'from (one per line)', type: 'list', required: true },
      { name: 'to', label: 'to', type: 'text', required: true },
      parentsField,
      { name: 'recursive', label: 'recursive', type: 'boolean', advanced: true },
      ...mfsFields,
    ],
    run: (client, v, ctx) => {
      const from = list(v.from)
      if (from.length === 0) throw new Error('from is required')
      return client.files.mv(from.length === 1 ? from[0] : from, required(v.to, 'to'), {
        parents: bool(v.parents),
        recursive: bool(v.recursive),
        ...mfsOptions(v),
        ...ctx.opts,
      })
    },
  },
  {
    id: 'files.rm',
    group: 'files',
    signature: 'files.rm(path | path[], options?) → Promise<void>',
    description: 'Remove MFS entries.',
    rpc: ['files/rm'],
    danger: 'Remove the given MFS path(s)?',
    fields: [
      { name: 'paths', label: 'paths (one per line)', type: 'list', required: true },
      { name: 'recursive', label: 'recursive', type: 'boolean' },
      ...mfsFields,
    ],
    run: (client, v, ctx) => {
      const paths = list(v.paths)
      if (paths.length === 0) throw new Error('paths is required')
      return client.files.rm(paths.length === 1 ? paths[0] : paths, {
        recursive: bool(v.recursive),
        ...mfsOptions(v),
        ...ctx.opts,
      })
    },
  },
  {
    id: 'files.flush',
    group: 'files',
    signature: 'files.flush(path, options?) → Promise<CID>',
    description: 'Flush a path to disk and return its CID.',
    rpc: ['files/flush'],
    fields: [{ name: 'path', label: 'path', type: 'text', default: '/', required: true }],
    run: (client, v, ctx) => client.files.flush(required(v.path, 'Path'), ctx.opts),
  },
]
