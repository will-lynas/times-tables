const week = 7 * 24 * 60 * 60 * 1000
const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'always' })
const dateTime = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
})

export function formatAttemptTime(completedAt: string, now: number) {
  const timestamp = Date.parse(completedAt)
  if (!Number.isFinite(timestamp)) return null
  const exact = dateTime.format(timestamp)
  const delta = timestamp - now
  const age = Math.abs(delta)
  let label = exact
  if (Number.isFinite(age) && age < week) {
    const [unit, duration] = age >= 86400000 ? ['day', 86400000] as const
      : age >= 3600000 ? ['hour', 3600000] as const
      : age >= 60000 ? ['minute', 60000] as const : ['second', 1000] as const
    const amount = Math.trunc(delta / duration)
    label = age < 1000 ? 'now' : relativeTime.format(amount, unit)
      .replace(/\bseconds?\b/, Math.abs(amount) === 1 ? 'sec' : 'secs')
      .replace(/\bminutes?\b/, Math.abs(amount) === 1 ? 'min' : 'mins')
  }
  return { label, exact }
}
