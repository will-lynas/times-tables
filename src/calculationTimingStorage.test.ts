import { expect, test } from 'vitest'
import { CalculationTimer } from './calculationTiming'
import { createGrid, scoreAnswers } from './game'
import { loadScores, saveScores, recoverScores, SCORE_KEY, type Score } from './scores'

function storage() {
  const data = new Map<string, string>()
  return { get length() { return data.size }, key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}
function timed(id = 'new'): Score {
  const result = scoreAnswers(createGrid('ordered', Math.random, [6, 9]), ['36', '', '', ''])
  const timer = new CalculationTimer(4, 0, true)
  timer.edit(0, '36', 0)
  return { id, mode: 'ordered', factors: [6, 9], size: 2, correct: 1, attempted: 1, total: 4, status: 'partial', elapsedMs: 100,
    completedAt: '2026-01-01T00:00:00Z', calculations: { ...result.calculations, timing: timer.snapshot(100) } }
}

test.each([
  { version: 2 }, { cells: [] }, { cells: null },
  ...[{ index: 1 }, { answerEntryMs: -1 }, { answerEntryMs: null }, { answerEntryMs: 101 }, { focusedMs: -1 },
    { focusedMs: '100' }, { edits: 0 }, { visits: 0 }, { visits: 1.5 }, { edits: -1 }, { answerEntryMs: '0' },
  ].map(cell => ({ cell })),
])('future or inconsistent timing fails closed and preserves exact source (%#)', async change => {
  const score = timed()
  const timing: Record<string, unknown> = { ...score.calculations!.timing!, ...change }
  if ('cell' in change) timing.cells = score.calculations!.timing!.cells.map((cell, index) => index === 0 ? { ...cell, ...change.cell } : cell)
  const bad = { ...score, calculations: { ...score.calculations, timing } }
  const store = storage(), raw = '  ' + JSON.stringify({ version: 4, scores: [bad], unknown: ['keep'] }) + '\n'
  store.setItem(SCORE_KEY, raw)
  expect(loadScores(() => store).warning).toBeTruthy()
  expect(await saveScores([timed('another')], () => store)).toMatch(/not saved/)
  expect(store.getItem(SCORE_KEY)).toBe(raw)
  expect(store.length).toBe(1)
})

test('stage1 details and unknown timing metadata survive append/replay without array enrichment', async () => {
  const next = timed(), store = storage()
  const { timing: _, ...details } = next.calculations!
  const old = { ...next, id: 'stage1', calculations: { ...details, unknown: ['old'], cells: details.cells.map(cell => ({ ...cell, richer: [true] })) } }
  const richer = { ...next, calculations: { ...next.calculations!, timing: { ...next.calculations!.timing!, unknown: ['future'], cells: next.calculations!.timing!.cells.map(cell => ({ ...cell, unknown: { retain: true } })) } } }
  const raw = ' ' + JSON.stringify({ version: 4, scores: [old], unknown: ['envelope'] }) + '\n'
  store.setItem(SCORE_KEY, raw)
  expect(loadScores(() => store).scores).toEqual([old])
  expect(store.getItem(SCORE_KEY)).toBe(raw)
  expect(await saveScores([richer], () => store)).toBeNull()
  expect(loadScores(() => store).scores).toEqual([old, richer])
  expect(await saveScores([{ ...next, id: 'stage1' }], () => store)).toMatch(/not saved/)
  expect(await recoverScores(() => store)).toBeNull()
  expect(loadScores(() => store).scores).toEqual([old, richer])
})

for (const failure of ['primary', 'receipt']) test(`timing survives ${failure} interruption and idempotent replay`, async () => {
  const store = storage(), next = timed()
  const failing = { ...store, get length() { return store.length }, setItem: (key: string, value: string) => {
    if (failure === 'primary' ? key === SCORE_KEY : key.startsWith(`${SCORE_KEY}.receipt.`)) throw Error('Full')
    store.setItem(key, value)
  } }
  expect(await saveScores([next], () => failing)).toMatch(/not saved/)
  const intent = Array.from({ length: store.length }, (_, i) => store.key(i)!).find(key => key.includes('.intent.'))!
  const raw = store.getItem(intent)
  expect(JSON.parse(raw!).payload).toEqual([next])
  expect(await recoverScores(() => store)).toBeNull()
  expect(await recoverScores(() => store)).toBeNull()
  expect(loadScores(() => store).scores).toEqual([next])
  expect(store.getItem(intent)).toBe(raw)
})
