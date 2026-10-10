import { useState } from 'react'

export function CopyButton({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title="Copy to clipboard"
      className={`cursor-pointer rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100 ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

