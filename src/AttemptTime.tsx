import { useSyncExternalStore } from 'react'
import { formatAttemptTime } from './formatAttemptTime'

const listeners = new Set<() => void>()
let now = Date.now()
let interval: ReturnType<typeof setInterval> | undefined

function update() {
  now = Date.now()
  for (const listener of listeners) listener()
}

export function subscribeClock(listener: () => void) {
  if (listeners.size === 0) {
    now = Date.now()
    interval = setInterval(update, 1000)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearInterval(interval)
      interval = undefined
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }
}

function getNow() { return now }

export function AttemptTime({ completedAt }: { completedAt: string }) {
  const now = useSyncExternalStore(subscribeClock, getNow)
  const formatted = formatAttemptTime(completedAt, now)
  if (!formatted) return <span>Unknown date</span>
  return <time dateTime={completedAt} title={formatted.exact} aria-description={formatted.exact}>{formatted.label}</time>
}
