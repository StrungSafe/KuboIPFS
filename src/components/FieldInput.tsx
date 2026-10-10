import type { FieldDef, FieldValue } from '../ops/types.ts'
import { formatBytes } from '../lib/values.ts'

interface Props {
  field: FieldDef
  value: FieldValue
  onChange: (value: FieldValue) => void
}

export function FieldInput({ field, value, onChange }: Props) {
  const id = `field-${field.name}`
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-baseline gap-2 text-xs font-medium text-slate-300">
        <span className="font-mono">{field.label}</span>
        {field.required && <span className="text-rose-400">*</span>}
        {field.help && <span className="font-normal text-slate-500">{field.help}</span>}
      </label>
      <Control id={id} field={field} value={value} onChange={onChange} />
    </div>
  )
}

function Control({ id, field, value, onChange }: Props & { id: string }) {
  const str = typeof value === 'string' ? value : ''
  switch (field.type) {
    case 'textarea':
    case 'list':
    case 'json':
      return (
        <textarea
          id={id}
          className="input min-h-24 font-mono"
          rows={field.type === 'json' ? 8 : 4}
          placeholder={field.placeholder}
          value={str}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'number':
      return (
        <input
          id={id}
          type="number"
          className="input font-mono"
          placeholder={field.placeholder}
          value={str}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'select':
      return (
        <select id={id} className="input" value={str} onChange={(e) => onChange(e.target.value)}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label ?? o.value}
            </option>
          ))}
        </select>
      )
    case 'boolean':
      return <TriState id={id} label={field.label} value={typeof value === 'boolean' ? value : undefined} onChange={onChange} />
    case 'file': {
      const list = Array.isArray(value) ? value : []
      return (
        <div className="space-y-1">
          <input
            id={id}
            type="file"
            multiple={field.multiple || field.directory}
            {...(field.directory ? { webkitdirectory: '', directory: '' } : {})}
            className="block w-full text-xs text-slate-400 file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-slate-100 hover:file:bg-slate-600"
            onChange={(e) => onChange(e.target.files ? [...e.target.files] : [])}
          />
          {list.length > 0 && (
            <p className="text-xs text-slate-500">
              {list.length} file{list.length === 1 ? '' : 's'} · {formatBytes(list.reduce((n, f) => n + f.size, 0))}
            </p>
          )}
        </div>
      )
    }
    default:
      return (
        <input
          id={id}
          type="text"
          className="input font-mono"
          placeholder={field.placeholder}
          value={str}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

/** unset / true / false — unset omits the option so the node default applies. */
function TriState({ id, label, value, onChange }: { id: string; label: string; value?: boolean; onChange: (v: FieldValue) => void }) {
  const opts: Array<[boolean | undefined, string]> = [
    [undefined, 'unset'],
    [true, 'true'],
    [false, 'false'],
  ]
  return (
    <div id={id} role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-slate-700 text-xs">
      {opts.map(([v, text]) => (
        <button
          key={text}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`cursor-pointer px-3 py-1 font-mono ${
            value === v
              ? v === undefined
                ? 'bg-slate-700 text-slate-100'
                : v
                  ? 'bg-teal-700 text-white'
                  : 'bg-rose-800 text-white'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
