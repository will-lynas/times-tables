import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatAttemptTime } from './formatAttemptTime'
import { subscribeClock } from './AttemptTime'

const now = Date.parse('2026-11-06T12:00:00.000Z')
const week = 7 * 86400000
const at = (age: number) => new Date(now - age).toISOString()

describe('attempt timestamps', () => {
  it.each([
    [0, 'now'], [999, 'now'], [1000, '1 sec ago'], [59000, '59 secs ago'],
    [60000, '1 min ago'], [300000, '5 mins ago'], [3600000, '1 hour ago'],
    [10800000, '3 hours ago'], [86400000, '1 day ago'], [week - 1, '6 days ago'],
    [-1000, 'in 1 sec'], [-300000, 'in 5 mins'], [-10800000, 'in 3 hours'],
  ])('formats an elapsed offset of %d ms as %s', (age, expected) => {
    expect(formatAttemptTime(at(age), now)?.label).toBe(expected)
  })

  it.each([week, week + 1, -week])('switches to the exact local timestamp at %d ms', age => {
    const formatted = formatAttemptTime(at(age), now)!
    const expected = new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
    }).format(new Date(at(age)))
    expect(formatted).toEqual({ label: expected, exact: expected })
  })

  it('uses elapsed time across the autumn DST boundary, not local calendar days', () => {
    // Noon UTC spans 08:00 EDT to 07:00 EST in America/New_York.
    const recent = formatAttemptTime('2026-10-30T12:00:01.000Z', now)!
    const old = formatAttemptTime('2026-10-30T12:00:00.000Z', now)!
    expect(recent.label).toBe('6 days ago')
    expect(old.label).toBe(old.exact)
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/New_York') {
      expect(old.exact).toContain('8:00:00 AM EDT')
    }
  })

  it('rejects invalid timestamps safely', () => {
    expect(formatAttemptTime('invalid', now)).toBeNull()
    expect(formatAttemptTime('', now)).toBeNull()
  })
})

describe('shared timestamp clock', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('uses one interval for all subscribers, refreshes on focus, and cleans up the last subscription', () => {
    vi.useFakeTimers()
    const windowTarget = new EventTarget()
    const documentTarget = new EventTarget()
    vi.stubGlobal('window', windowTarget)
    vi.stubGlobal('document', documentTarget)
    const first = vi.fn()
    const second = vi.fn()
    const stopFirst = subscribeClock(first)
    const stopSecond = subscribeClock(second)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(2000)
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledTimes(2)
    stopFirst()
    windowTarget.dispatchEvent(new Event('focus'))
    documentTarget.dispatchEvent(new Event('visibilitychange'))
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledTimes(4)
    expect(vi.getTimerCount()).toBe(1)
    stopSecond()
    expect(vi.getTimerCount()).toBe(0)
    windowTarget.dispatchEvent(new Event('focus'))
    documentTarget.dispatchEvent(new Event('visibilitychange'))
    expect(second).toHaveBeenCalledTimes(4)
  })
})
