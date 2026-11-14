import { expect, test } from 'vitest'
import { buildProgress } from './progress'
import type { Score } from './scores'

const selection = { mode: 'ordered' as const, size: 2 }
function run(index: number, change: Partial<Score> = {}): Score {
  return { id: `run-${index}`, mode: 'ordered', size: 2, factors: [1, 2], status: 'complete',
    attempted: 4, total: 4, correct: 4, elapsedMs: index * 1000,
    completedAt: new Date(Date.UTC(2026, 0, 1) + index * 60000).toISOString(), ...change }
}

test.each([
  [5, 3, 3], [6, 4, 3.5], [25, 23, 13], [26, 24, 14],
])('5/25 boundary %i retains exact perfect-only windows through mixed invalid records', (count, short, long) => {
  const source = Array.from({ length: count }, (_, i) => [
    run(i + 1),
    run(i + 1, { id: `partial-${i}`, status: 'partial', attempted: 1, correct: 1, elapsedMs: 999000 }),
    run(i + 1, { id: `wrong-${i}`, correct: 3, elapsedMs: 999000 }),
    run(i + 1, { id: `invalid-total-${i}`, total: 1, attempted: 1, correct: 1, elapsedMs: 999000 }),
    run(i + 1, { id: `other-set-${i}`, factors: [2, 3], elapsedMs: 999000 }),
    run(i + 1, { id: `other-mode-${i}`, mode: 'shuffled', elapsedMs: 999000 }),
    run(i + 1, { id: `undated-${i}`, completedAt: '', elapsedMs: 999000 }),
  ]).flat()
  const before = JSON.stringify(source)
  for (const axisMode of ['time', 'runs'] as const) {
    const result = buildProgress(source, { ...selection, axisMode })
    const eligible = result.points.filter(p => p.perfect)
    expect(result.perfectCount).toBe(count)
    expect(eligible.at(-1)!.average5Seconds).toBe(short)
    expect(eligible.at(-1)!.average25Seconds).toBe(long)
    expect(result.points.filter(p => !p.perfect).every(p => p.average5Seconds === null && p.average25Seconds === null)).toBe(true)
  }
  expect(JSON.stringify(source)).toBe(before)
})

test.each([1, 4, 5, 6, 24, 25, 26])('trailing 5 and 25 use the last min(N, %i) perfect completions', count => {
  const source = Array.from({ length: count }, (_, i) => run(i + 1))
  const snapshot = JSON.stringify(source)
  const points = buildProgress(source, selection).points
  const last = points.at(-1)!
  const mean = (window: number) => {
    const values = source.slice(-window).map(score => score.elapsedMs / 1000)
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }
  expect(last.average5Seconds).toBe(mean(5))
  expect(last.average5Count).toBe(Math.min(5, count))
  expect(last.average25Seconds).toBe(mean(25))
  expect(last.average25Count).toBe(Math.min(25, count))
  expect(JSON.stringify(source)).toBe(snapshot)
})

test('records are cumulative eligible minima, with no early record, ties or future leakage', () => {
  const source = [run(1, { status: 'partial', attempted: 2, correct: 2 }),
    run(2, { elapsedMs: 60000 }), run(3, { elapsedMs: 60000 }),
    run(4, { correct: 3 }), run(5, { elapsedMs: 40000 }),
    run(6, { elapsedMs: 80000 }), run(7, { elapsedMs: 0 }),
    run(8, { elapsedMs: 0 })]
  const points = buildProgress(source, selection).points
  expect(points.map(p => p.bestSeconds)).toEqual([null, 60, 60, 60, 40, 40, 0, 0])
  expect(points.map(p => p.isRecord)).toEqual([false, true, false, false, true, false, true, false])
})

test('missing dates are not invented; duplicate timestamps retain saved order across gaps and exact sets', () => {
  const source = [run(20, { id: 'late', elapsedMs: 10000 }),
    run(1, { id: 'missing', completedAt: '' }),
    run(1, { id: 'first', elapsedMs: 60000, factors: [2, 1] }),
    run(1, { id: 'duplicate', elapsedMs: 40000 }),
    run(2, { id: 'different-set', factors: [2, 3], elapsedMs: 0 }),
    run(3, { id: 'different-mode', mode: 'shuffled', elapsedMs: 0 }),
    run(4, { id: 'partial', status: 'partial', attempted: 2, correct: 2 }),
    run(5, { id: 'wrong', correct: 3 }),
    run(6, { id: 'not-full', total: 1, attempted: 1, correct: 1 }),
    run(7, { id: 'rounded-100', size: 20, factors: Array.from({ length: 20 }, (_, i) => i + 1), total: 400, attempted: 400, correct: 399 })]
  const original = JSON.stringify(source)
  const result = buildProgress(source, selection)
  expect(result.points.map(p => p.id)).toEqual(['first', 'duplicate', 'partial', 'wrong', 'not-full', 'late'])
  expect(result.points.map(p => p.perfect)).toEqual([true, true, false, false, false, true])
  expect(result.points.map(p => p.average5Seconds)).toEqual([60, 50, null, null, null, 110 / 3])
  expect(result.points.map(p => p.average25Seconds)).toEqual([60, 50, null, null, null, 110 / 3])
  expect(result.points.map(p => p.bestSeconds)).toEqual([60, 40, 40, 40, 40, 10])
  const large = buildProgress(source, { mode: 'ordered', size: 20, factors: Array.from({ length: 20 }, (_, i) => i + 1) })
  expect(large.points[0]).toMatchObject({ perfect: false, average5Seconds: null, average25Seconds: null, bestSeconds: null })
  expect(JSON.stringify(source)).toBe(original)
})
