import { expect, test } from 'vitest'
import { summarizeRuns, loadRunStarts, recordRunStart, RUN_META_KEY, RUN_START_PREFIX } from './statistics'

function memoryStorage() {
  const data = new Map<string, string>()
  return { get length() { return data.size }, key: (index: number) => [...data.keys()][index] ?? null, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}

test('persists real start identity idempotently across reloads and stale tabs without counting its score again', async () => {
  const storage = memoryStorage()
  const run = { id: 'first', mode: 'ordered' as const, factors: [2, 7] }
  expect((await recordRunStart(run, [], () => storage)).warning).toBeNull()
  await recordRunStart(run, [], () => storage)
  await recordRunStart({ ...run, id: 'second' }, [], () => storage)
  const tracking = loadRunStarts([], () => storage)
  expect(tracking.starts).toHaveLength(2)
  expect(tracking.incomplete).toBe(false)
  expect(summarizeRuns([score('first')], tracking, 'all', 'all').started).toBe(2)
})
import type { Score } from './scores'

test.each(['{broken', JSON.stringify({ version: 2, incomplete: false, future: { keep: true } }), JSON.stringify({ version: 1, incomplete: 'no' })])('never overwrites malformed or future tracking metadata: %s', async raw => {
  const storage = memoryStorage()
  storage.setItem(RUN_META_KEY, raw)
  expect((await recordRunStart({ id: 'new', mode: 'ordered', factors: [2, 7] }, [], () => storage)).warning).toMatch(/could not be read/)
  expect(storage.getItem(RUN_META_KEY)).toBe(raw)
  expect(storage.length).toBe(1)
})

test.each(['{broken', JSON.stringify({ version: 2, mode: 'ordered', factors: [2, 7], future: true })])('preserves malformed and future start records: %s', async raw => {
  const storage = memoryStorage()
  storage.setItem(RUN_META_KEY, JSON.stringify({ version: 1, incomplete: false }))
  storage.setItem(RUN_START_PREFIX + 'old', raw)
  expect((await recordRunStart({ id: 'new', mode: 'ordered', factors: [2, 7] }, [], () => storage)).warning).toMatch(/could not be read/)
  expect(storage.getItem(RUN_START_PREFIX + 'old')).toBe(raw)
  expect(storage.length).toBe(2)
})

test('keeps unknown metadata byte-for-byte and legacy known starts stay a lower bound without double counting', async () => {
  const storage = memoryStorage()
  const scores = [score('legacy'), score('legacy')]
  const run = { id: 'new', mode: 'ordered' as const, factors: [2, 7] }
  const first = await recordRunStart(run, scores, () => storage)
  expect(summarizeRuns(scores, first, 'ordered', 'set:2,7')).toMatchObject({ started: 2, completed: 1, incomplete: true })
  const raw = JSON.stringify({ version: 1, incomplete: true, future: { untouched: [1, 2] } })
  storage.setItem(RUN_META_KEY, raw)
  const event = JSON.stringify({ version: 1, mode: 'ordered', factors: [2, 7], future: 'untouched' })
  storage.setItem(RUN_START_PREFIX + 'new', event)
  await recordRunStart(run, [...scores, score('new')], () => storage)
  expect(storage.getItem(RUN_META_KEY)).toBe(raw)
  expect(storage.getItem(RUN_START_PREFIX + 'new')).toBe(event)
  expect(summarizeRuns([...scores, score('new')], loadRunStarts(scores, () => storage), 'all', 'all').started).toBe(2)
})

test('filters starts and completions by exact set and order, not cardinality or current practice', async () => {
  const tracking = { starts: [{ id: 'cancel', mode: 'shuffled' as const, factors: [3, 8] }], incomplete: false, warning: null }
  const scores = [score('ordered'), score('shuffled', { mode: 'shuffled', factors: [3, 8], correct: 3 })]
  expect(summarizeRuns(scores, tracking, 'all', 'set:3,8')).toMatchObject({ started: 2, completed: 1, perfect: 0 })
  expect(summarizeRuns(scores, tracking, 'ordered', 'set:3,8')).toMatchObject({ started: 0, completed: 0, perfect: 0 })
})

test('reports denied reads and writes without fabricated totals', async () => {
  const denied = () => { throw new DOMException('Denied', 'SecurityError') }
  expect(loadRunStarts([], denied).warning).toMatch(/could not be read/)
  const storage = memoryStorage()
  storage.setItem = () => { throw new DOMException('Full', 'QuotaExceededError') }
  const state = await recordRunStart({ id: 'new', mode: 'ordered', factors: [2, 7] }, [], () => storage)
  expect(state.warning).toMatch(/not saved/)
  expect(summarizeRuns([], state, 'all', 'all').started).toBeNull()
})


test('rejects conflicting run IDs without overwriting either the event or metadata', async () => {
  const storage = memoryStorage()
  const run = { id: 'collision', mode: 'ordered' as const, factors: [2, 7] }
  await recordRunStart(run, [], () => storage)
  const original = storage.getItem(RUN_START_PREFIX + run.id)
  const meta = storage.getItem(RUN_META_KEY)
  const result = await recordRunStart({ ...run, factors: [3, 8] }, [], () => storage)
  expect(result.warning).toMatch(/not saved/i)
  expect(storage.getItem(RUN_START_PREFIX + run.id)).toBe(original)
  expect(storage.getItem(RUN_META_KEY)).toBe(meta)
})

test.each(['', 7])('invalid run identity does not create any persistent data: %j', async id => {
  const storage = memoryStorage()
  const state = await recordRunStart({ id: id as string, mode: 'ordered', factors: [2, 7] }, [], () => storage)
  expect(state.warning).toMatch(/not saved/i)
  expect(storage.length).toBe(0)
})

const score = (id: string, change: Partial<Score> = {}): Score => ({ id, mode: 'ordered', size: 2, factors: [2, 7], status: 'complete', attempted: 4, correct: 4, total: 4, elapsedMs: 100, completedAt: '2026-01-01T00:00:00Z', ...change })

test('counts complete and perfect from exact counts, deduplicating run identities', async () => {
  const scores = [score('perfect'), score('wrong', { correct: 3 }), score('partial', { status: 'partial', attempted: 1, correct: 1 }), score('perfect'), score('invalid', { attempted: 1 })]
  expect(summarizeRuns(scores, { starts: [{ id: 'perfect', mode: 'ordered', factors: [2, 7] }, { id: 'cancel', mode: 'ordered', factors: [2, 7] }], incomplete: true, warning: null }, 'all', 'all')).toEqual({ started: 5, completed: 2, perfect: 1, incomplete: true })
})
