import { expect, test } from 'vitest'
import { loadScores, saveScores, rankScores, SCORE_KEY, type Score } from './scores'

function memoryStorage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

test.each([
  '{broken', 'null', '[]', '{}',
  JSON.stringify({ version: 2, scores: [] }),
  JSON.stringify({ version: 1, scores: {} }),
  ...[
    null, { correct: undefined }, { id: '' }, { mode: 'unknown' }, { correct: -1 }, { correct: 145 },
    { correct: 1.5 }, { total: 12 }, { elapsedMs: -1 }, { elapsedMs: '100' },
    { elapsedMs: null }, { completedAt: 'yesterday' },
  ].map(change => JSON.stringify({ version: 1, scores: [change === null ? null : { id: 'x', mode: 'ordered', correct: 144, total: 144, elapsedMs: 10, completedAt: '2026-01-02T12:00:00.000Z', ...change }] })),
])('ignores corrupt or unsupported stored data with a warning (%#)', raw => {
  const storage = memoryStorage()
  storage.setItem(SCORE_KEY, raw)
  const result = loadScores(() => storage)
  expect(result.scores).toEqual([])
  expect(result.warning).toMatch(/could not be read/i)
  expect(storage.getItem(SCORE_KEY)).toBe(raw)
})

test.each(['SecurityError', 'QuotaExceededError'])('reports denied writes rather than claiming scores were saved: %s', name => {
  const storage = { getItem: () => null, setItem: () => { throw new DOMException('Blocked', name) } }
  expect(saveScores([score('one', 144, 1000)], () => storage)).toMatch(/not saved/i)
})

test('catches an unavailable localStorage getter', () => {
  const denied = () => { throw new DOMException('Blocked', 'SecurityError') }
  expect(loadScores(denied).warning).toMatch(/could not be read/i)
  expect(saveScores([], denied)).toMatch(/not saved/i)
})

test('persists scores in a versioned envelope and restores them', () => {
  const storage = memoryStorage()
  expect(loadScores(() => storage)).toEqual({ scores: [], warning: null })
  const scores = [score('one', 144, 12345)]
  expect(saveScores(scores, () => storage)).toBeNull()
  expect(JSON.parse(storage.getItem(SCORE_KEY)!)).toEqual({ version: 1, scores })
  expect(loadScores(() => storage)).toEqual({ scores, warning: null })
})

const score = (id: string, correct: number, elapsedMs: number, mode: Score['mode'] = 'shuffled'): Score => ({
  id, mode, correct, total: 144, elapsedMs, completedAt: '2026-01-02T12:00:00.000Z',
})

test('ranks one mode by accuracy then elapsed time without changing the source', () => {
  const scores = [score('fast-wrong', 143, 100), score('slow-perfect', 144, 2000),
    score('fast-perfect', 144, 1000), score('other-mode', 144, 50, 'ordered')]
  expect(rankScores(scores, 'shuffled').map(item => item.id)).toEqual(['fast-perfect', 'slow-perfect', 'fast-wrong'])
  expect(rankScores(scores, 'ordered').map(item => item.id)).toEqual(['other-mode'])
  expect(scores[0].id).toBe('fast-wrong')
})
