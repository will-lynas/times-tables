import { parsePreserved } from './preservedJson'
import { lockedWrite, object, type StorageAccess, type StoragePort } from './storage'

// Immutable write-ahead intents bridge the gap between a synchronous UI event
// and asynchronous Web Lock acquisition. Neither intents nor receipts are pruned.
export type JournalStorage = StoragePort & Pick<Storage, 'length' | 'key'>
type Apply = (storage: JournalStorage, payload: unknown) => void
const receipt = '{"version":1}'
function journalStorage(getStorage: StorageAccess): JournalStorage {
  const storage = getStorage() as JournalStorage
  if (!Number.isInteger(storage.length) || typeof storage.key !== 'function') throw new Error('Storage enumeration unavailable')
  return storage
}
function entries(storage: JournalStorage, target: string) {
  const prefix = `${target}.intent.`
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => key !== null && key.startsWith(prefix)).sort()
  return keys.map(key => {
    if (!/^\d{16}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key.slice(prefix.length))) throw new Error('Unsupported intent identity')
    const raw = storage.getItem(key)
    if (raw === null) throw new Error('Intent disappeared')
    const value: unknown = parsePreserved(raw)
    if (!object(value) || value.version !== 1 || !Object.hasOwn(value, 'payload')) throw new Error('Unsupported intent')
    const ack = storage.getItem(`${target}.receipt.${key.slice(prefix.length)}`)
    if (ack !== null && ack !== receipt) throw new Error('Unsupported receipt')
    return { key, payload: value.payload, done: ack !== null, ack: `${target}.receipt.${key.slice(prefix.length)}` }
  })
}
function preview(storage: JournalStorage, payload: unknown, apply: Apply) {
  const writes = new Map<string, string>()
  const keys = () => [...new Set([...Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => key !== null), ...writes.keys()])]
  apply({ get length() { return keys().length }, key: index => keys()[index] ?? null,
    getItem: key => writes.get(key) ?? storage.getItem(key), setItem: (key, value) => { writes.set(key, value) } }, payload)
  return [...writes].some(([key, value]) => storage.getItem(key) !== value)
}
export function recoverWrites(target: string, apply: Apply, getStorage: StorageAccess): Promise<string | null> {
  try {
    const storage = journalStorage(getStorage)
    if (!entries(storage, target).some(entry => !entry.done)) return Promise.resolve(null)
    return lockedWrite(target, () => {
      // Enumerate again under the origin-wide lock; other tabs may have queued.
      for (const entry of entries(storage, target)) {
        if (entry.done) continue
        // Validate the complete operation before any primary/backup mutation.
        preview(storage, entry.payload, apply)
        const verifying: JournalStorage = {
          get length() { return storage.length }, key: index => storage.key(index),
          getItem: key => storage.getItem(key),
          setItem: (key, value) => {
            storage.setItem(key, value)
            if (storage.getItem(key) !== value) throw new Error('Write verification failed')
          },
        }
        apply(verifying, entry.payload)
        verifying.setItem(entry.ack, receipt)
      }
    })
  } catch { return Promise.resolve('Queued changes could not be recovered. Original data and pending intents have been kept.') }
}
export function durableWrite(target: string, payload: unknown, apply: Apply, getStorage: StorageAccess): Promise<string | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.locks?.request) throw new Error('Web Locks unavailable')
    const storage = journalStorage(getStorage)
    const pending = entries(storage, target)
    const changed = preview(storage, payload, apply)
    if (!changed && !pending.some(entry => !entry.done)) return Promise.resolve(null)
    // Lexical order preserves this origin's observed enqueue order. Truly
    // simultaneous tabs may tie; UUID breaks ties without merging identities.
    const previous = pending.reduce((max, entry) => Math.max(max, Number(entry.key.slice(`${target}.intent.`.length).split('-')[0])), 0)
    const sequence = Math.max(Date.now(), previous + 1)
    if (!Number.isSafeInteger(sequence)) throw new Error('Invalid intent sequence')
    const id = `${String(sequence).padStart(16, '0')}-${crypto.randomUUID()}`
    const key = `${target}.intent.${id}`
    if (storage.getItem(key) !== null || storage.getItem(`${target}.receipt.${id}`) !== null) throw new Error('Intent identity collision')
    const raw = JSON.stringify({ version: 1, payload })
    storage.setItem(key, raw)
    if (storage.getItem(key) !== raw) throw new Error('Intent could not be verified')
    // All durable bytes above are written before the first asynchronous yield.
    return recoverWrites(target, apply, getStorage)
  } catch { return Promise.resolve('Changes not saved: browser storage is unavailable or saved data is unsupported. Original data has been kept.') }
}
