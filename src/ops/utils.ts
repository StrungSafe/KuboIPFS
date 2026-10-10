import { base16 } from 'multiformats/bases/base16'
import { base32 } from 'multiformats/bases/base32'
import type { Operation } from './types.ts'
import { cid, raw, required } from '../lib/parse.ts'

export const utilOps: Operation[] = [
  {
    id: 'cid.inspect',
    group: 'ipld',
    signature: 'CID.parse(string) — inspect a CID',
    description:
      'Decode a CID locally using the CID class re-exported by kubo-rpc-client: version, codec, multihash and alternate encodings.',
    local: true,
    fields: [{ name: 'cid', label: 'cid', type: 'text', required: true, placeholder: 'Qm… or bafy…' }],
    run: async (client, v) => {
      const c = cid(required(v.cid, 'cid'))
      const codecs = client.codecs.listCodecs()
      const hashers = client.hashers.listHashers()
      return {
        version: c.version,
        codec: { code: `0x${c.code.toString(16)}`, name: codecs.find((x) => x.code === c.code)?.name ?? 'unknown' },
        multihash: {
          code: `0x${c.multihash.code.toString(16)}`,
          name: hashers.find((h) => h.code === c.multihash.code)?.name ?? 'unknown',
          size: c.multihash.size,
          digest: base16.baseEncode(c.multihash.digest),
        },
        v0: c.version === 0 ? c.toString() : (() => {
          try {
            return c.toV0().toString()
          } catch {
            return '(not representable as v0)'
          }
        })(),
        v1base32: c.toV1().toString(base32),
        bytes: c.bytes,
      }
    },
  },
  {
    id: 'bases.listBases',
    group: 'ipld',
    signature: 'bases.listBases() → MultibaseCodec[]',
    description: 'Multibase encodings the client has loaded.',
    local: true,
    fields: [],
    run: (client) => client.bases.listBases().map((b) => ({ name: b.name, prefix: b.prefix })),
  },
  {
    id: 'bases.getBase',
    group: 'ipld',
    signature: 'bases.getBase(code) → Promise<MultibaseCodec>',
    description: 'Look up a multibase by name or prefix and use it to encode some text.',
    local: true,
    fields: [
      { name: 'code', label: 'name or prefix', type: 'text', required: true, default: 'base58btc' },
      { name: 'sample', label: 'sample text to encode', type: 'text', default: 'hello ipfs' },
    ],
    run: async (client, v) => {
      const base = await client.bases.getBase(required(v.code, 'code'))
      return {
        name: base.name,
        prefix: base.prefix,
        encoded: base.encoder.encode(new TextEncoder().encode(raw(v.sample))),
      }
    },
  },
  {
    id: 'codecs.listCodecs',
    group: 'ipld',
    signature: 'codecs.listCodecs() → BlockCodec[]',
    description: 'IPLD block codecs the client has loaded.',
    local: true,
    fields: [],
    run: (client) => client.codecs.listCodecs().map((c) => ({ name: c.name, code: `0x${c.code.toString(16)}` })),
  },
  {
    id: 'codecs.getCodec',
    group: 'ipld',
    signature: 'codecs.getCodec(code) → Promise<BlockCodec>',
    description: 'Look up a codec by name or numeric code and round-trip some JSON through it.',
    local: true,
    fields: [
      { name: 'code', label: 'name or code', type: 'text', required: true, default: 'dag-cbor' },
      { name: 'sample', label: 'sample JSON', type: 'textarea', default: '{"hello":"world"}' },
    ],
    run: async (client, v) => {
      const code = required(v.code, 'code')
      const codec = await client.codecs.getCodec(/^(0x)?[0-9a-f]+$/i.test(code) ? Number(code) : code)
      const encoded = codec.encode(JSON.parse(raw(v.sample) || 'null'))
      return {
        name: codec.name,
        code: `0x${codec.code.toString(16)}`,
        encoded,
        decoded: codec.decode(encoded),
      }
    },
  },
  {
    id: 'hashers.listHashers',
    group: 'ipld',
    signature: 'hashers.listHashers() → MultihashHasher[]',
    description: 'Multihash hashers the client has loaded.',
    local: true,
    fields: [],
    run: (client) => client.hashers.listHashers().map((h) => ({ name: h.name, code: `0x${h.code.toString(16)}` })),
  },
  {
    id: 'hashers.getHasher',
    group: 'ipld',
    signature: 'hashers.getHasher(code) → Promise<MultihashHasher>',
    description: 'Look up a hasher by name or code and hash some text with it.',
    local: true,
    fields: [
      { name: 'code', label: 'name or code', type: 'text', required: true, default: 'sha2-256' },
      { name: 'sample', label: 'sample text', type: 'text', default: 'hello ipfs' },
    ],
    run: async (client, v) => {
      const code = required(v.code, 'code')
      const hasher = await client.hashers.getHasher(/^(0x)?[0-9a-f]+$/i.test(code) ? Number(code) : code)
      const digest = await hasher.digest(new TextEncoder().encode(raw(v.sample)))
      return {
        name: hasher.name,
        code: `0x${hasher.code.toString(16)}`,
        digest: base16.baseEncode(digest.digest),
        multihash: base16.baseEncode(digest.bytes),
      }
    },
  },
]
