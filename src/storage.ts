import { parsePreserved } from './preservedJson'
// All cooperating tabs serialize read/modify/write through the same origin lock.
export type StoragePort = Pick<Storage, 'getItem' | 'setItem'>
export type StorageAccess = () => StoragePort
export const browserStorage: StorageAccess = () => localStorage
export const STORAGE_WARNING = 'Changes not saved: saved data could not be read or browser storage is unavailable. Original data has been kept; changes apply only on this page.'

export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function lockedWrite(key: string, write: () => void): Promise<string | null> {
  try {
    // No read/merge/write fallback: it is not atomic across tabs.
    if (typeof navigator === 'undefined' || !navigator.locks?.request) throw new Error('Web Locks unavailable')
    await navigator.locks.request(key, { mode: 'exclusive' }, write)
    return null
  } catch {
    return STORAGE_WARNING
  }
}

// Keep exact bytes once per source version/content, before the atomic setItem.
// This runs only for actual schema migrations, never ordinary control updates.
export function backup(storage: StoragePort, key: string, version: number | 'unversioned', raw: string) {
  const backupKey = `${key}.backup.v${version}`
  const existing = storage.getItem(backupKey)
  const originals: unknown = existing === null ? [] : parsePreserved(existing)
  if (!Array.isArray(originals) || !originals.every(value => typeof value === 'string')) throw new Error('Unreadable backup')
  if (!originals.includes(raw)) {
    const next = JSON.stringify([...originals, raw])
    storage.setItem(backupKey, next)
    if (storage.getItem(backupKey) !== next) throw new Error('Backup could not be verified')
  }
}

// A flat additive version marker keeps legacy preferences separate from scores.
export function readPreferences(storage: StoragePort, key: string) {
  const raw = storage.getItem(key)
  if (raw === null) return { raw, data: {} as Record<string, unknown> }
  const data: unknown = parsePreserved(raw)
  if (!object(data) || ('version' in data && data.version !== 1)) throw new Error('Unsupported preferences')
  return { raw, data }
}

export function preferencePayload(change: Record<string, unknown>, defaults: Record<string, unknown> = {}) {
  return { change: Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined)),
    unset: Object.keys(change).filter(key => change[key] === undefined), defaults }
}
export function preferenceWriter(key: string, validate: (data: Record<string, unknown>) => boolean) {
  return (storage: StoragePort, payload: unknown) => {
    if (!object(payload) || !object(payload.change) || !object(payload.defaults)) throw new Error('Invalid preference intent')
    const { raw, data } = readPreferences(storage, key)
    if (!validate(data)) throw new Error('Invalid original preferences')
    const { warning: _warning, ...patch } = payload.change
    const next: Record<string, unknown> = { ...(raw === null ? payload.defaults : data), ...patch, version: 1 }
    const unset = payload.unset ?? []
    if (!Array.isArray(unset) || !unset.every(key => typeof key === 'string' && key !== 'version')) throw new Error('Invalid unset fields')
    for (const key of unset) delete next[key]
    if (!validate(next)) throw new Error('Invalid preferences')
    if (raw !== null && !('version' in data)) backup(storage, key, 'unversioned', raw)
    storage.setItem(key, JSON.stringify(next))
  }
}

// Merge append-only records without overwriting conflicting values, including
// unknown nested metadata. Arrays are indivisible: never filter their members.
export function mergeRecord(old: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const result = { ...old }
  for (const [key, value] of Object.entries(incoming)) {
    if (!Object.hasOwn(old, key)) Object.defineProperty(result, key, { value, enumerable: true, configurable: true, writable: true })
    else if (object(old[key]) && object(value)) result[key] = mergeRecord(old[key], value)
    else if (JSON.stringify(old[key]) !== JSON.stringify(value)) throw new Error('Conflicting record ID')
  }
  return result
}
