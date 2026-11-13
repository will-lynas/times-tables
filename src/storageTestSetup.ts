import { beforeEach, vi } from 'vitest'
// Deterministic FIFO Web Locks stand-in. Real multi-page locking is browser-tested.
beforeEach(() => {
  const queues = new Map<string, Promise<unknown>>()
  vi.stubGlobal('navigator', { locks: { request: (name: string, _options: unknown, callback: () => unknown) => {
    const next = (queues.get(name) ?? Promise.resolve()).then(callback)
    queues.set(name, next.catch(() => {}))
    return next
  } } })
})
