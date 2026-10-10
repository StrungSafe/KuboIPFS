import { useState } from 'react'
import { proxyTarget, type ConnectionSettings } from '../lib/connection.ts'
import { CopyButton } from './CopyButton.tsx'

interface Props {
  settings: ConnectionSettings
  onSave: (settings: ConnectionSettings) => void
  onClose: () => void
}

export function ConnectionDialog({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(settings)
  const origin = window.location.origin
  const corsCommands = [
    `ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["${origin}"]'`,
    `ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]'`,
  ].join('\n')

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-16" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="conn-title"
        className="card w-full max-w-xl space-y-5 bg-slate-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="conn-title" className="text-lg font-semibold text-white">
          Connection
        </h2>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-medium text-slate-300">How should the browser reach Kubo?</legend>
          <label className="flex cursor-pointer gap-3 rounded-md border border-slate-700 p-3 has-checked:border-teal-600">
            <input
              type="radio"
              name="mode"
              className="mt-1 accent-teal-500"
              checked={draft.mode === 'proxy'}
              onChange={() => setDraft({ ...draft, mode: 'proxy' })}
            />
            <div className="space-y-1 text-sm">
              <div className="font-medium">Dev-server proxy (recommended)</div>
              <p className="text-xs text-slate-400">
                Requests go to <code>{origin}/api/v0</code> and Vite forwards them to{' '}
                <code className="text-teal-300">{proxyTarget || 'KUBO_API_URL'}</code>. No CORS setup on the node.
              </p>
              {!proxyTarget && (
                <p className="text-xs text-amber-400">
                  KUBO_API_URL is not set. Create <code>.env.local</code> with{' '}
                  <code>KUBO_API_URL=http://&lt;node-ip&gt;:5001</code> and restart <code>yarn dev</code>.
                </p>
              )}
            </div>
          </label>
          <label className="flex cursor-pointer gap-3 rounded-md border border-slate-700 p-3 has-checked:border-teal-600">
            <input
              type="radio"
              name="mode"
              className="mt-1 accent-teal-500"
              checked={draft.mode === 'direct'}
              onChange={() => setDraft({ ...draft, mode: 'direct' })}
            />
            <div className="w-full space-y-2 text-sm">
              <div className="font-medium">Direct</div>
              <input
                className="input font-mono"
                value={draft.url}
                placeholder="http://192.168.1.10:5001"
                onChange={(e) => setDraft({ ...draft, url: e.target.value, mode: 'direct' })}
              />
              <p className="text-xs text-slate-400">The node must allow this page's origin via CORS:</p>
              <div className="relative">
                <pre className="overflow-x-auto rounded bg-slate-950 p-2 pr-14 font-mono text-[11px] text-slate-300">{corsCommands}</pre>
                <CopyButton text={corsCommands} className="absolute top-1 right-1" />
              </div>
              <p className="text-xs text-slate-500">Restart the daemon after changing API.HTTPHeaders.</p>
            </div>
          </label>
        </fieldset>

        <div className="space-y-2">
          <div className="flex items-center text-xs font-medium text-slate-300">
            Extra request headers
            <span className="ml-2 font-normal text-slate-500">e.g. Authorization for API.Authorizations</span>
            <button
              type="button"
              className="ml-auto cursor-pointer text-teal-400 hover:text-teal-300"
              onClick={() => setDraft({ ...draft, headers: [...draft.headers, { key: '', value: '' }] })}
            >
              + Add
            </button>
          </div>
          {draft.headers.map((h, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="input w-40 font-mono"
                placeholder="Header"
                value={h.key}
                onChange={(e) =>
                  setDraft({ ...draft, headers: draft.headers.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })
                }
              />
              <input
                className="input font-mono"
                placeholder="Value"
                value={h.value}
                onChange={(e) =>
                  setDraft({ ...draft, headers: draft.headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })
                }
              />
              <button
                type="button"
                aria-label="Remove header"
                className="cursor-pointer px-2 text-slate-500 hover:text-rose-400"
                onClick={() => setDraft({ ...draft, headers: draft.headers.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-300">Default timeout for every request</span>
          <input
            className="input w-40 font-mono"
            placeholder="e.g. 2m (blank = none)"
            value={draft.timeout}
            onChange={(e) => setDraft({ ...draft, timeout: e.target.value })}
          />
        </label>

        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={() => onSave(draft)}>
            Save & reconnect
          </button>
        </div>
      </div>
    </div>
  )
}
