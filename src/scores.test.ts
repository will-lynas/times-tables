import { expect, test } from 'vitest'
import { presetFactors } from './factors'
import { loadScores, saveScores, rankScores, SCORE_KEY, type Score } from './scores'

function memoryStorage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

test.each([
  '{broken', 'null', '[]', '{}',
  JSON.stringify({ version: 5, scores: [] }),
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
  const scores = [score('one', 144, 12345), { ...score('partial', 1, 1000), status: 'partial' as const, attempted: 2 }]
  expect(saveScores(scores, () => storage)).toBeNull()
  expect(JSON.parse(storage.getItem(SCORE_KEY)!)).toEqual({ version: 4, scores: scores.map(s => ({ ...s, factors: s.factors ?? presetFactors(s.size) })) })
  expect(loadScores(() => storage)).toEqual({ scores: scores.map(s => ({ ...s, factors: s.factors ?? presetFactors(s.size) })), warning: null })
})

const score = (id: string, correct: number, elapsedMs: number, mode: Score['mode'] = 'shuffled'): Score => ({
  id, mode, status: 'complete', attempted: 144, size: 12, correct, total: 144, elapsedMs, completedAt: '2026-01-02T12:00:00.000Z',
})

test('migrates legacy scores to size 12 without losing them when saving a smaller round', () => {
  const storage = memoryStorage()
  const legacy = { id: 'legacy', mode: 'ordered', correct: 143, total: 144, elapsedMs: 12345, completedAt: '2026-01-02T12:00:00.000Z' }
  const raw = JSON.stringify({ version: 1, scores: [legacy] })
  storage.setItem(SCORE_KEY, raw)
  const restored = loadScores(() => storage)
  expect(restored).toEqual({ scores: [{ ...legacy, size: 12, factors: presetFactors(12), status: 'complete', attempted: 144 }], warning: null })
  expect(storage.getItem(SCORE_KEY)).toBe(raw)
  const scores = [...restored.scores, { ...score('small', 4, 1000), size: 2, total: 4, attempted: 4 }]
  expect(saveScores(scores, () => storage)).toBeNull()
  expect(JSON.parse(storage.getItem(SCORE_KEY)!)).toEqual({ version: 4, scores: scores.map(s => ({ ...s, factors: s.factors ?? presetFactors(s.size) })) })
  expect(loadScores(() => storage)).toEqual({ scores: scores.map(s => ({ ...s, factors: s.factors ?? presetFactors(s.size) })), warning: null })
})

test.each([
  { size: undefined }, { size: 1 }, { size: 13 }, { size: 2.5 }, { size: '2' },
  { total: 144 }, { total: '4' }, { correct: 5 },
])('rejects inconsistent v2 size and score data (%#)', change => {
  const storage = memoryStorage()
  const raw = JSON.stringify({ version: 2, scores: [{ ...score('small', 4, 1000), size: 2, total: 4, attempted: 4, ...change }] })
  storage.setItem(SCORE_KEY, raw)
  expect(loadScores(() => storage).warning).toMatch(/could not be read/i)
  expect(storage.getItem(SCORE_KEY)).toBe(raw)
})

test('ranks scores only against the same size and mode', () => {
  const scores = [
    score('large', 144, 100),
    { ...score('small-wrong', 3, 100), size: 2, total: 4, attempted: 4 },
    { ...score('small-slow', 4, 2000), size: 2, total: 4, attempted: 4 },
    { ...score('small-fast', 4, 1000), size: 2, total: 4, attempted: 4 },
    { ...score('ordered-small', 4, 500, 'ordered'), size: 2, total: 4, attempted: 4 },
  ]
  expect(rankScores(scores, 'shuffled', 2).map(item => item.id)).toEqual(['small-fast', 'small-slow', 'small-wrong'])
  expect(rankScores(scores, 'ordered', 2).map(item => item.id)).toEqual(['ordered-small'])
  expect(rankScores(scores, 'shuffled').map(item => item.id)).toEqual(['large'])
  expect(scores.map(item => item.id)).toEqual(['large', 'small-wrong', 'small-slow', 'small-fast', 'ordered-small'])

})

test.each([1, 2])('migrates version %i complete scores without rewriting storage on read', version => {
  const storage = memoryStorage()
  const size = version === 1 ? 12 : 6
  const legacy = { id: 'old', mode: 'ordered', correct: size * size, total: size * size, elapsedMs: 1000, completedAt: '2026-01-02T12:00:00.000Z', ...(version === 2 ? { size } : {}) }
  const raw = JSON.stringify({ version, scores: [legacy] })
  storage.setItem(SCORE_KEY, raw)
  expect(loadScores(() => storage)).toEqual({ scores: [{ ...legacy, size, factors: presetFactors(size), status: 'complete', attempted: legacy.total }], warning: null })
  expect(storage.getItem(SCORE_KEY)).toBe(raw)
})

test.each([
  { status: 'unknown' }, { status: 'complete', attempted: 2 }, { status: 'partial', attempted: 144 },
  { attempted: 0 }, { attempted: -1 }, { attempted: 1.5 }, { attempted: 145 }, { correct: 3 },
  { size: 0 }, { size: 13 }, { size: 1.5 }, { size: '12' }, { total: 143 },
  { status: undefined }, { attempted: undefined }, { size: undefined },
])('rejects inconsistent version 3 partial records (%#)', change => {
  const storage = memoryStorage()
  const partial = { ...score('partial', 1, 1000), status: 'partial', attempted: 2, ...change }
  const raw = JSON.stringify({ version: 3, scores: [partial] })
  storage.setItem(SCORE_KEY, raw)
  expect(loadScores(() => storage).warning).toMatch(/could not be read/)
  expect(loadScores(() => storage).scores).toEqual([])
  expect(storage.getItem(SCORE_KEY)).toBe(raw)
})

test('excludes partial results and other sizes from full-grid rankings', () => {
  const scores: Score[] = [score('full', 140, 2000),
    { ...score('partial', 1, 1), status: 'partial', attempted: 1 },
    { ...score('small', 36, 1000), size: 6, total: 36, attempted: 36 },
    score('other-mode', 144, 100, 'ordered')]
  expect(rankScores(scores, 'shuffled').map(item => item.id)).toEqual(['full'])
  expect(rankScores(scores, 'shuffled', 6).map(item => item.id)).toEqual(['small'])
})

test('ranks one mode by accuracy then elapsed time without changing the source', () => {
  const scores = [score('fast-wrong', 143, 100), score('slow-perfect', 144, 2000),
    score('fast-perfect', 144, 1000), score('other-mode', 144, 50, 'ordered')]
  expect(rankScores(scores, 'shuffled').map(item => item.id)).toEqual(['fast-perfect', 'slow-perfect', 'fast-wrong'])
  expect(rankScores(scores, 'ordered').map(item => item.id)).toEqual(['other-mode'])
  expect(scores[0].id).toBe('fast-wrong')
})
