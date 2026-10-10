# KuboIPFS — Kubo RPC Explorer

A React + Tailwind web app for exercising the full interface of
[`kubo-rpc-client`](https://github.com/ipfs/js-kubo-rpc-client) against a
[Kubo](https://github.com/ipfs/kubo) IPFS node.

- **Every client method** (108 operations across `add`/`cat`/`get`/`ls`, `files`, `block`, `dag`,
  `object.patch`, `refs`, `pin`, `pin.remote`, `name`, `key`, `pubsub`, `swarm`, `bootstrap`,
  `routing`, `dht`, `bitswap`, `stats`, `provide`, `repo`, `config`, `log`, `diag`, plus the
  client-side `bases`/`codecs`/`hashers` helpers, `urlSource` and `readURLContent`) has a form
  for its arguments and options.
- Boolean options are **tri-state** (unset / true / false), so you can test node defaults as well as
  explicit values.
- Results render with typed values (CID, PeerId, Multiaddr, bigint, Uint8Array). Async iterables
  **stream live** and can be aborted. Byte streams (`cat`, `get`, `files.read`, `dag.export`,
  `block.get`) get a text/hex/image preview and a download button.
- A **call log** shows the exact `client.*(…)` invocation, progress events and timing.
- An interactive **pubsub console** for subscribing, publishing and watching messages.
- A one-click **self-test** that checks about 30 core flows end to end. It cleans up after itself:
  content it adds is unpinned and its MFS scratch directory is removed.

## Requirements

- Node.js 20.19+ or 22.12+ with Corepack (`corepack enable`)
- Yarn 4 (pinned in `package.json` via `packageManager`; Corepack picks it up automatically)
- A reachable Kubo node, i.e. its RPC API (`Addresses.API`, port 5001 by default)

## Getting started

```bash
corepack enable
yarn install
cp .env.example .env.local   # then set KUBO_API_URL to your node, e.g. http://192.168.1.10:5001
yarn dev
```

Open http://localhost:4173.

### Connecting to your node

The browser can reach Kubo in two ways, and you can switch between them in **Connection** in the
header.

1. **Dev-server proxy (recommended).** Set `KUBO_API_URL` in `.env.local`. Vite forwards `/api/v0/*`
   to the node and strips the browser's `Origin`/`Referer`/`User-Agent` headers, so Kubo's
   cross-origin protections don't block the calls. Nothing needs to change on the node.
2. **Direct.** The browser calls the node URL itself. Kubo must allow this origin:

   ```bash
   ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:4173"]'
   ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]'
   # then restart the daemon
   ```

If your node uses `API.Authorizations`, add an `Authorization` header in the Connection dialog.

The dev server listens on all interfaces (`host: true`), so other machines on your network can use it
too. Keep in mind that this exposes your node's RPC API (an admin API) through the proxy.

## Scripts

| Command          | Description                          |
| ---------------- | ------------------------------------ |
| `yarn dev`       | Start the dev server (with proxy)    |
| `yarn build`     | Type-check and build to `dist/`      |
| `yarn preview`   | Serve the production build           |
| `yarn typecheck` | TypeScript only                      |
| `yarn lint`      | oxlint                               |

A production build has no proxy. Serve it behind a reverse proxy that forwards `/api/v0` to Kubo,
or use **Direct** mode with CORS configured.

## Project layout

```
src/
  ops/            Declarative registry: one entry per client method (fields + run)
    core.ts       add, addAll, urlSource, cat, get, ls, id, version, ping, resolve, …
    files.ts      MFS
    data.ts       block, dag, object.patch, refs, pin, pin.remote
    network.ts    swarm, bootstrap, bitswap, dht, routing, name, pubsub
    node.ts       config, key, log, diag, repo, stats, provide
    utils.ts      CID inspector, bases, codecs, hashers
  components/     OperationView (form + runner), ValueView, BytesView, PubSubConsole, …
  lib/            connection, argument parsing, call tracing, self-test
```

To add or adjust an operation, edit its entry in `src/ops/*`. The form, runner, streaming and
result rendering are generic.

## Known client/node mismatches surfaced by the explorer

Tested with `kubo-rpc-client` 7.1.0 against Kubo 0.44.0-dev:

- `bootstrap.list()` throws `String multiaddr must start with "/"` when the node's bootstrap list uses the AutoConf placeholder
  `"auto"`.
- `commands()` is typed as `string[]` but returns Kubo's `{ Name, Subcommands }` tree.
- `repo.version()` is typed as `number` but resolves to a string.
- `diag.net()` returns 404 because Kubo removed the endpoint.
- Some methods merge defaults as `{ default, ...options }`, so passing an option explicitly as
  `undefined` overrides the default (for example `dag.put({…}, { storeCodec: undefined })` fails).
  The explorer leaves unset options out of the call, as hand-written code would.
