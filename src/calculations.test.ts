import { expect, test } from 'vitest'
import { createGrid, scoreAnswers } from './game'
import { summarizeCalculations } from './calculations'
import { loadScores, saveScores, recoverScores, SCORE_KEY, type Score } from './scores'

export function detailedScore(id = 'detailed', factors = [6, 9], answers = ['36', '54', '0', '']): Score {
  const result = scoreAnswers(createGrid('ordered', Math.random, factors), answers)
  return { id, mode: 'ordered', size: factors.length, factors, status: result.status, attempted: result.attempted,
    correct: result.correct, total: result.total, elapsedMs: 321, completedAt: '2026-01-02T12:00:00.000Z', calculations: result.calculations }
}
export function memoryStorage() {
  const data = new Map<string, string>()
  return { get length() { return data.size }, key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}

test.each([
  { version: 2 }, { cells: [] }, { cells: null },
  ...[{ index: 2 }, { rowIndex: 1 }, { columnIndex: 1 }, { row: 9 }, { column: 9 },
    { row: 0 }, { product: 37 }, { status: 'incorrect' }, { answer: '' }, { answer: 'NaN' },
    { answer: '3.6' }, { answer: ' 36' }, { answer: 36 }, { answer: '0036' }, { status: 'future' },
  ].map(change => ({ cell: change })),
  { attempted: 2 }, { correct: 1 }, { factors: [5, 9] },
])('refuses inconsistent or future final details without rewriting any original bytes (%#)', async change => {
  const original = detailedScore()
  const details: Record<string, unknown> = { ...original.calculations!, ...change }
  const { cell, attempted, correct, factors, ...detailChange } = details
  if (cell) detailChange.cells = original.calculations!.cells.map((value, index) => index === 0 ? { ...value, ...cell as object } : value)
  const bad = { ...original, ...(attempted === undefined ? {} : { attempted }), ...(correct === undefined ? {} : { correct }),
    ...(factors === undefined ? {} : { factors }), calculations: detailChange }
  const storage = memoryStorage()
  const raw = '  ' + JSON.stringify({ version: 4, scores: [bad], metadata: { keep: true } }) + '\n'
  storage.setItem(SCORE_KEY, raw)
  expect(loadScores(() => storage).warning).toMatch(/could not be read/)
  expect(await saveScores([detailedScore('new')], () => storage)).toMatch(/not saved/)
  expect(storage.getItem(SCORE_KEY)).toBe(raw)
  expect(storage.length).toBe(1)
})

test('shuffled independent axes and raw factor ordering retain their actual displayed operands', async () => {
  const grid = { size: 2, rows: [9, 6], columns: [6, 9], products: [54, 81, 36, 54] }
  const result = scoreAnswers(grid, ['5', '81', '36', '54'])
  const score = { ...detailedScore(), mode: 'shuffled' as const, factors: [9, 6], status: result.status,
    attempted: result.attempted, correct: result.correct, calculations: result.calculations }
  const storage = memoryStorage()
  expect(await saveScores([score], () => storage)).toBeNull()
  expect(loadScores(() => storage).scores).toEqual([score])
  expect(score.calculations.cells.map(cell => [cell.row, cell.column])).toEqual([[9, 6], [9, 9], [6, 6], [6, 9]])
})

test('wrong counts use answered detailed observations, including partials, and never merge reversed operands', () => {
  const partial = detailedScore()
  const complete = detailedScore('full', [6, 9], ['36', '0', '54', '81'])
  const more = detailedScore('more', [6, 9], ['0', '', '0', ''])
  const { calculations: _, ...historical } = detailedScore('historical')
  const summary = summarizeCalculations([partial, complete, more, historical])
  expect(summary).toMatchObject({ runs: 4, detailedRuns: 3, answered: 9, incorrect: [
    { row: 9, column: 6, wrong: 2, answered: 3, errorRate: 2 / 3, answers: [['0', 2]] },
    { row: 6, column: 6, wrong: 1, answered: 3, errorRate: 1 / 3 },
    { row: 6, column: 9, wrong: 1, answered: 2, errorRate: 1 / 2 },
  ] })
  expect(summarizeCalculations([historical])).toEqual({ runs: 1, detailedRuns: 0, answered: 0, incorrect: [] })
})

test.each([1, 2, 3, 4])('appending detailed runs preserves all historical v%i records and richer metadata without invented detail', async version => {
  const size = version === 1 ? 12 : 2
  const old = { id: 'old', mode: 'ordered', correct: 0, size, total: size * size, elapsedMs: 123.456,
    completedAt: '2026-01-01T00:00:00Z', ...(version >= 3 ? { status: 'complete', attempted: size * size } : {}),
    ...(version >= 4 ? { factors: [2, 1] } : {}), richer: { nested: ['001', null, { future: true }] } }
  const raw = '  ' + JSON.stringify({ version, scores: [old], richer: { keep: ['raw'] } }) + '\n'
  const storage = memoryStorage()
  storage.setItem(SCORE_KEY, raw)
  const original = loadScores(() => storage).scores[0]
  expect(storage.getItem(SCORE_KEY)).toBe(raw)
  const next = detailedScore()
  const richer = { ...next, calculations: { ...next.calculations!, future: { nested: ['000', null] },
    cells: next.calculations!.cells.map(cell => ({ ...cell, future: { retain: [false] } })) } }
  expect(await saveScores([richer], () => storage)).toBeNull()
  const restored = loadScores(() => storage).scores
  expect(restored).toEqual([original, richer])
  expect(restored[0]).not.toHaveProperty('calculations')
  expect(JSON.parse(storage.getItem(SCORE_KEY)!).richer).toEqual({ keep: ['raw'] })
  if (version < 4) expect(JSON.parse(storage.getItem(`${SCORE_KEY}.backup.v${version}`)!)).toEqual([raw])
  const committed = storage.getItem(SCORE_KEY)
  expect(await saveScores([richer], () => storage)).toBeNull()
  expect(storage.getItem(SCORE_KEY)).toBe(committed)
  expect(await saveScores([{ ...richer, calculations: { ...richer.calculations, cells: richer.calculations.cells.map((cell, index) => index === 2 ? { ...cell, answer: '1' } : cell) } }], () => storage)).toMatch(/not saved/)
  expect(storage.getItem(SCORE_KEY)).toBe(committed)
})

test.each(['primary', 'receipt'])('detailed %s write interruption retains source and replays the exact immutable cells', async failure => {
  const storage = memoryStorage()
  const old = { ...detailedScore('old'), calculations: undefined }
  storage.setItem(SCORE_KEY, JSON.stringify({ version: 4, scores: [old], extra: ['keep'] }))
  const source = storage.getItem(SCORE_KEY)
  const next = detailedScore()
  const failing = { get length() { return storage.length }, key: storage.key, getItem: storage.getItem,
    setItem: (key: string, value: string) => {
      if (failure === 'primary' ? key === SCORE_KEY : key.startsWith(`${SCORE_KEY}.receipt.`)) throw new DOMException('Full', 'QuotaExceededError')
      storage.setItem(key, value)
    } }
  expect(await saveScores([next], () => failing)).toMatch(/not saved/)
  if (failure === 'primary') expect(storage.getItem(SCORE_KEY)).toBe(source)
  const intentKey = Array.from({ length: storage.length }, (_, index) => storage.key(index)!).find(key => key.startsWith(`${SCORE_KEY}.intent.`))!
  const intent = storage.getItem(intentKey)
  expect(JSON.parse(intent!).payload).toEqual([next])
  expect(await recoverScores(() => storage)).toBeNull()
  expect(loadScores(() => storage).scores).toEqual([JSON.parse(source!).scores[0], next])
  expect(storage.getItem(intentKey)).toBe(intent)
  expect(await recoverScores(() => storage)).toBeNull()
  expect(loadScores(() => storage).scores).toHaveLength(2)
})

test('detailed concurrent appends and stale aggregate-only replay preserve the richer original', async () => {
  const storage = memoryStorage(), one = detailedScore('one'), two = detailedScore('two')
  expect(await Promise.all([saveScores([one], () => storage), saveScores([two], () => storage), saveScores([one], () => storage)])).toEqual([null, null, null])
  const { calculations: _, ...stale } = one
  expect(await saveScores([stale], () => storage)).toBeNull()
  expect(loadScores(() => storage).scores).toEqual([one, two])
})
