import type { KeyType } from 'kubo-rpc-client'
import type { Operation } from './types.ts'
import { bool, int, json, peerId, raw, required, text } from '../lib/parse.ts'

export const configOps: Operation[] = [
  {
    id: 'config.getAll',
    group: 'config',
    signature: 'config.getAll(options?) → Promise<Config>',
    description: 'The full node configuration (private key is redacted by Kubo).',
    rpc: ['config/show'],
    fields: [],
    run: (client, _v, ctx) => client.config.getAll(ctx.opts),
  },
  {
    id: 'config.get',
    group: 'config',
    signature: 'config.get(key, options?) → Promise<string | object>',
    description: 'Read a single config key.',
    rpc: ['config'],
    fields: [{ name: 'key', label: 'key', type: 'text', required: true, placeholder: 'Addresses.API' }],
    run: (client, v, ctx) => client.config.get(required(v.key, 'key'), ctx.opts),
  },
  {
    id: 'config.set',
    group: 'config',
    signature: 'config.set(key, value, options?) → Promise<void>',
    description: 'Set a config key. Value is sent as a string, boolean or JSON depending on the type you pick.',
    rpc: ['config'],
    danger: 'Modify the node configuration?',
    fields: [
      { name: 'key', label: 'key', type: 'text', required: true, placeholder: 'Pubsub.Enabled' },
      {
        name: 'valueType',
        label: 'value type',
        type: 'select',
        default: 'string',
        options: [
          { value: 'string' },
          { value: 'boolean' },
          { value: 'json', label: 'JSON (number / array / object)' },
        ],
      },
      { name: 'value', label: 'value', type: 'textarea', placeholder: 'true / "text" / ["a","b"] / {"k":1}' },
    ],
    run: (client, v, ctx) => {
      const key = required(v.key, 'key')
      const value =
        v.valueType === 'boolean'
          ? raw(v.value).trim() === 'true'
          : v.valueType === 'json'
            ? json(v.value, 'value')
            : raw(v.value)
      return client.config.set(key, value, ctx.opts)
    },
  },
  {
    id: 'config.replace',
    group: 'config',
    signature: 'config.replace(config, options?) → Promise<void>',
    description: 'Replace the entire config. Tip: run config.getAll first, copy its JSON, edit, then paste here.',
    rpc: ['config/replace'],
    danger: 'Replace the ENTIRE node configuration? A bad config can stop the node from starting.',
    fields: [{ name: 'config', label: 'config (JSON)', type: 'json', required: true }],
    run: (client, v, ctx) => client.config.replace(json(v.config, 'config') as never, ctx.opts),
  },
  {
    id: 'config.profiles.apply',
    group: 'config',
    signature: 'config.profiles.apply(name, options?) → Promise<ProfilesApplyResult>',
    description: 'Apply a config profile (server, local-discovery, lowpower, randomports, …). Use dryRun to preview.',
    rpc: ['config/profile/apply'],
    danger: 'Apply this profile to the node configuration? (Skip the warning by enabling dryRun.)',
    fields: [
      {
        name: 'name',
        label: 'name',
        type: 'select',
        default: 'lowpower',
        options: [
          'server',
          'local-discovery',
          'randomports',
          'default-datastore',
          'pebbleds',
          'flatfs',
          'flatfs-measure',
          'badgerds',
          'lowpower',
          'announce-off',
          'announce-on',
          'legacy-cid-v0',
          'test-cid-v1',
          'test-cid-v1-wide',
          'unixfs-v0-2015',
          'unixfs-v1-2025',
          'test',
          'default-networking',
        ].map((value) => ({ value })),
      },
      { name: 'dryRun', label: 'dryRun', type: 'boolean', default: true },
    ],
    run: (client, v, ctx) =>
      client.config.profiles.apply(required(v.name, 'name'), { dryRun: bool(v.dryRun), ...ctx.opts }),
  },
]

export const keyOps: Operation[] = [
  {
    id: 'key.list',
    group: 'key',
    signature: 'key.list(options?) → Promise<Key[]>',
    description: 'Keys in the node keystore.',
    rpc: ['key/list'],
    fields: [],
    run: (client, _v, ctx) => client.key.list(ctx.opts),
  },
  {
    id: 'key.gen',
    group: 'key',
    signature: 'key.gen(name, options?) → Promise<Key>',
    description: 'Generate a new keypair (usable for IPNS publishing).',
    rpc: ['key/gen'],
    fields: [
      { name: 'name', label: 'name', type: 'text', required: true, placeholder: 'explorer-test' },
      {
        name: 'type',
        label: 'type',
        type: 'select',
        options: [{ value: '', label: '(default ed25519)' }, { value: 'ed25519' }, { value: 'rsa' }],
      },
      { name: 'size', label: 'size (rsa bits)', type: 'number', advanced: true },
      { name: 'ipnsBase', label: 'ipns-base', type: 'text', placeholder: 'base36', advanced: true },
    ],
    run: (client, v, ctx) =>
      client.key.gen(required(v.name, 'name'), {
        type: text(v.type) as KeyType | undefined,
        size: int(v.size),
        'ipns-base': text(v.ipnsBase),
        ...ctx.opts,
      }),
  },
  {
    id: 'key.rename',
    group: 'key',
    signature: 'key.rename(oldName, newName, options?) → Promise<KeyRenameResult>',
    description: 'Rename a key.',
    rpc: ['key/rename'],
    fields: [
      { name: 'oldName', label: 'oldName', type: 'text', required: true },
      { name: 'newName', label: 'newName', type: 'text', required: true },
    ],
    run: (client, v, ctx) => client.key.rename(required(v.oldName, 'oldName'), required(v.newName, 'newName'), ctx.opts),
  },
  {
    id: 'key.rm',
    group: 'key',
    signature: 'key.rm(name, options?) → Promise<Key>',
    description: 'Delete a key from the keystore.',
    rpc: ['key/rm'],
    danger: 'Permanently delete this key from the node keystore? IPNS names signed with it become unpublishable.',
    fields: [{ name: 'name', label: 'name', type: 'text', required: true }],
    run: (client, v, ctx) => client.key.rm(required(v.name, 'name'), ctx.opts),
  },
  {
    id: 'key.import',
    group: 'key',
    signature: 'key.import(name, pem, password, options?) → Promise<Key>',
    description: 'Import a PEM-encoded private key.',
    rpc: ['key/import'],
    fields: [
      { name: 'name', label: 'name', type: 'text', required: true },
      { name: 'pem', label: 'pem', type: 'textarea', required: true, placeholder: '-----BEGIN PRIVATE KEY-----' },
      { name: 'password', label: 'password', type: 'text' },
    ],
    run: (client, v, ctx) =>
      client.key.import(required(v.name, 'name'), required(v.pem, 'pem'), raw(v.password), ctx.opts),
  },
]

export const logOps: Operation[] = [
  {
    id: 'log.ls',
    group: 'log',
    signature: 'log.ls(options?) → Promise<any>',
    description: 'Logging subsystems.',
    rpc: ['log/ls'],
    fields: [],
    run: (client, _v, ctx) => client.log.ls(ctx.opts),
  },
  {
    id: 'log.level',
    group: 'log',
    signature: 'log.level(subsystem, level, options?) → Promise<any>',
    description: 'Change the log level of a subsystem (or "all"). Kubo defaults to error; this resets on daemon restart.',
    rpc: ['log/level'],
    danger: 'Change the runtime log level on the node?',
    fields: [
      { name: 'subsystem', label: 'subsystem', type: 'text', required: true, default: 'all' },
      {
        name: 'level',
        label: 'level',
        type: 'select',
        default: 'info',
        options: ['debug', 'info', 'warn', 'error', 'dpanic', 'panic', 'fatal'].map((value) => ({ value })),
      },
    ],
    run: (client, v, ctx) => client.log.level(required(v.subsystem, 'subsystem'), required(v.level, 'level'), ctx.opts),
  },
  {
    id: 'log.tail',
    group: 'log',
    signature: 'log.tail(options?) → AsyncIterable<any>',
    description: 'Stream the node event log live. Press Abort to stop.',
    rpc: ['log/tail'],
    fields: [],
    run: (client, _v, ctx) => client.log.tail(ctx.opts),
  },
]

export const diagOps: Operation[] = [
  {
    id: 'diag.cmds',
    group: 'diag',
    signature: 'diag.cmds(options?) → Promise<DiagCmdsResult[]>',
    description: 'Commands recently run on the node (active and finished).',
    rpc: ['diag/cmds'],
    fields: [],
    run: (client, _v, ctx) => client.diag.cmds(ctx.opts),
  },
  {
    id: 'diag.net',
    group: 'diag',
    signature: 'diag.net(options?) → Promise<any>',
    description: 'Network diagnostics (removed in recent Kubo releases; expect an error).',
    rpc: ['diag/net'],
    fields: [],
    run: (client, _v, ctx) => client.diag.net(ctx.opts),
  },
  {
    id: 'diag.sys',
    group: 'diag',
    signature: 'diag.sys(options?) → Promise<any>',
    description: 'System diagnostics: OS, memory, disk, Go runtime, network.',
    rpc: ['diag/sys'],
    fields: [],
    run: (client, _v, ctx) => client.diag.sys(ctx.opts),
  },
]

export const repoOps: Operation[] = [
  {
    id: 'repo.stat',
    group: 'repo',
    signature: 'repo.stat(options?) → Promise<RepoStatResult>',
    description: 'Repo size, object count, path and storage limit.',
    rpc: ['repo/stat'],
    fields: [],
    run: (client, _v, ctx) => client.repo.stat(ctx.opts),
  },
  {
    id: 'repo.version',
    group: 'repo',
    signature: 'repo.version(options?) → Promise<number>',
    description: 'On-disk repo format version.',
    rpc: ['repo/version'],
    fields: [],
    run: (client, _v, ctx) => client.repo.version(ctx.opts),
  },
  {
    id: 'repo.gc',
    group: 'repo',
    signature: 'repo.gc(options?) → AsyncIterable<RepoGCResult>',
    description: 'Garbage collect every unpinned block. Streams the removed CIDs.',
    rpc: ['repo/gc'],
    danger: 'Run garbage collection? All unpinned, non-MFS blocks will be deleted from the node.',
    fields: [{ name: 'quiet', label: 'quiet', type: 'boolean', advanced: true }],
    run: (client, v, ctx) => client.repo.gc({ quiet: bool(v.quiet), ...ctx.opts }),
  },
]

export const statsOps: Operation[] = [
  {
    id: 'stats.bw',
    group: 'stats',
    signature: 'stats.bw(options?) → AsyncIterable<StatsBWResult>',
    description: 'Bandwidth totals and rates. Enable poll to stream updates every interval.',
    rpc: ['stats/bw'],
    fields: [
      { name: 'poll', label: 'poll', type: 'boolean' },
      { name: 'interval', label: 'interval', type: 'text', placeholder: '1s' },
      { name: 'peer', label: 'peer', type: 'text', advanced: true },
      { name: 'proto', label: 'proto', type: 'text', placeholder: '/ipfs/bitswap/1.2.0', advanced: true },
    ],
    run: (client, v, ctx) => {
      const peer = text(v.peer)
      return client.stats.bw({
        poll: bool(v.poll),
        interval: text(v.interval),
        peer: peer ? peerId(peer) : undefined,
        proto: text(v.proto),
        ...ctx.opts,
      })
    },
  },
  {
    id: 'stats.bitswap',
    group: 'stats',
    signature: 'stats.bitswap(options?) → Promise<BitswapStats>',
    description: 'Alias of bitswap.stat.',
    rpc: ['stats/bitswap'],
    fields: [],
    run: (client, _v, ctx) => client.stats.bitswap(ctx.opts),
  },
  {
    id: 'stats.repo',
    group: 'stats',
    signature: 'stats.repo(options?) → Promise<RepoStatResult>',
    description: 'Alias of repo.stat.',
    rpc: ['stats/repo'],
    fields: [],
    run: (client, _v, ctx) => client.stats.repo(ctx.opts),
  },
  {
    id: 'provide.stat',
    group: 'stats',
    signature: 'provide.stat(options?) → Promise<ProvideStats>',
    description: 'Provider / reprovider system statistics.',
    rpc: ['provide/stat'],
    fields: [
      { name: 'all', label: 'all', type: 'boolean' },
      { name: 'lan', label: 'lan', type: 'boolean', advanced: true },
    ],
    run: (client, v, ctx) => client.provide.stat({ all: bool(v.all), lan: bool(v.lan), ...ctx.opts }),
  },
]
