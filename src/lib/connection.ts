import { create, type KuboRPCClient } from 'kubo-rpc-client'

export type ConnectionMode = 'proxy' | 'direct'

export interface HeaderEntry {
  key: string
  value: string
}

export interface ConnectionSettings {
  /** `proxy` talks to /api/v0 on this origin, `direct` talks to `url`. */
  mode: ConnectionMode
  url: string
  headers: HeaderEntry[]
  /** Default request timeout passed to `create()`, e.g. `30s`. Empty = none. */
  timeout: string
}

const STORAGE_KEY = 'kubo-explorer:connection'

/** KUBO_API_URL from the dev server's env, empty when no proxy is configured. */
export const proxyTarget: string = __KUBO_PROXY_TARGET__

export function defaultSettings(): ConnectionSettings {
  return {
    mode: proxyTarget ? 'proxy' : 'direct',
    url: 'http://127.0.0.1:5001',
    headers: [],
    timeout: '',
  }
}

export function loadSettings(): ConnectionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaultSettings(), ...(JSON.parse(raw) as Partial<ConnectionSettings>) }
  } catch {
    // ignore unreadable storage
  }
  return defaultSettings()
}

export function saveSettings(settings: ConnectionSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore unavailable storage
  }
}

export function endpointUrl(settings: ConnectionSettings): string {
  return settings.mode === 'proxy' ? window.location.origin : settings.url.trim()
}

export function describeEndpoint(settings: ConnectionSettings): string {
  return settings.mode === 'proxy'
    ? `${window.location.origin}/api/v0 → ${proxyTarget || '(no KUBO_API_URL set)'}`
    : `${settings.url.trim()}/api/v0`
}

export function createClient(settings: ConnectionSettings): KuboRPCClient {
  const headers: Record<string, string> = {}
  for (const { key, value } of settings.headers) {
    if (key.trim()) headers[key.trim()] = value
  }
  return create({
    url: endpointUrl(settings),
    headers,
    timeout: settings.timeout.trim() || undefined,
  })
}
