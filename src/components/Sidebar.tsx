import { useMemo, useState } from 'react'
import { groups, operations } from '../ops/index.ts'

interface Props {
  current?: string
  onNavigate: (route: string) => void
}

export function Sidebar({ current, onNavigate }: Props) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return operations
    return operations.filter(
      (op) =>
        op.id.toLowerCase().includes(q) ||
        op.description.toLowerCase().includes(q) ||
        op.rpc?.some((r) => r.includes(q)),
    )
  }, [query])

  return (
    <nav className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <button
          type="button"
          onClick={() => onNavigate('')}
          className={`w-full cursor-pointer rounded-md px-3 py-1.5 text-left text-sm ${
            current === undefined ? 'bg-teal-900/50 text-teal-100' : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          Overview & self-test
        </button>
        <input
          className="input"
          placeholder={`Search ${operations.length} methods…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {groups.map((g) => {
          const ops = filtered.filter((op) => op.group === g.id)
          if (ops.length === 0) return null
          const isCollapsed = !query && collapsed[g.id]
          return (
            <div key={g.id} className="mb-2">
              <button
                type="button"
                title={g.description}
                onClick={() => setCollapsed({ ...collapsed, [g.id]: !collapsed[g.id] })}
                className="flex w-full cursor-pointer items-center gap-1 px-1 py-1 text-xs font-semibold tracking-wide text-slate-500 uppercase hover:text-slate-300"
              >
                <span className="w-3">{isCollapsed ? '▸' : '▾'}</span>
                {g.label}
                <span className="ml-auto font-normal">{ops.length}</span>
              </button>
              {!isCollapsed && (
                <ul>
                  {ops.map((op) => (
                    <li key={op.id}>
                      <button
                        type="button"
                        onClick={() => onNavigate(`op/${op.id}`)}
                        className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-left font-mono text-[13px] ${
                          current === op.id ? 'bg-teal-900/50 text-teal-100' : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">{op.id}</span>
                        {op.danger && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" title="mutating" />}
                        {op.local && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" title="client-side" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
}
