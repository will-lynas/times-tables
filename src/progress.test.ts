import { expect, test } from 'vitest'
import { buildProgress, formatDuration, progressTimeDomain } from './progress'
import type { Score } from './scores'

function round(id: string, seconds: number, day: number, change: Partial<Score> = {}): Score {
  return { id, mode: 'ordered', size: 2, status: 'complete', attempted: 4, total: 4, correct: 4,
    elapsedMs: seconds * 1000, completedAt: new Date(Date.UTC(2026, 0, day)).toISOString(), ...change }
}

test('plots chronological exact-setting observations without mutating the source', () => {
  const source = [round('late', 30, 3), round('different-mode', 1, 2, { mode: 'shuffled' }),
    round('early', 60, 1), round('different-size', 2, 2, { size: 3, total: 9, attempted: 9, correct: 9 })]
  const original = structuredClone(source)
  source.forEach(Object.freeze)
  Object.freeze(source)
  const result = buildProgress(source, { mode: 'ordered', size: 2 })
  expect(result.points.map(point => [point.id, point.timestamp, point.seconds, point.averageSeconds, point.averageCount])).toEqual([
    ['early', Date.UTC(2026, 0, 1), 60, 60, 1], ['late', Date.UTC(2026, 0, 3), 30, 45, 2],
  ])
  expect(result.perfectCount).toBe(2)
  expect(source).toEqual(original)
})

test('only perfect complete rounds contribute to the trailing up-to-10 average', () => {
  const source = [round('first', 60, 1), round('partial-perfect', 1, 2, { status: 'partial', attempted: 2, correct: 2 }),
    round('wrong', 2, 3, { correct: 3 }), round('second', 40, 4)]
  const result = buildProgress(source, { mode: 'ordered', size: 2 })
  expect(result.points.map(point => [point.perfect, point.accuracy, point.averageSeconds, point.averageCount])).toEqual([
    [true, 100, 60, 1], [false, 100, null, 0], [false, 75, null, 0], [true, 100, 50, 2],
  ])
  expect(result.perfectCount).toBe(2)
  const many = buildProgress(Array.from({ length: 12 }, (_, index) => round(String(index), (index + 1) * 10, index + 1)), { mode: 'ordered', size: 2 })
  expect(many.points.map(point => point.averageSeconds)).toEqual([10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 65, 75])
  expect(many.points.map(point => point.averageCount)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10])
})

test('handles empty, single, identical timestamps, zero duration and outliers without fabricated observations', () => {
  const selection = { mode: 'ordered' as const, size: 2 }
  expect(buildProgress([], selection)).toEqual({ points: [], perfectCount: 0 })
  expect(progressTimeDomain([])).toEqual([0, 1])
  const one = buildProgress([round('one', 0, 1)], selection)
  expect(one.points[0]).toMatchObject({ seconds: 0, averageSeconds: 0, averageCount: 1 })
  expect(progressTimeDomain(one.points)).toEqual([Date.UTC(2026, 0, 1) - 60000, Date.UTC(2026, 0, 1) + 60000])
  const equal = buildProgress([round('b', 100000, 1), round('a', 0, 1), round('later', 10, 4)], selection)
  expect(equal.points.map(point => [point.id, point.seconds, point.averageSeconds])).toEqual([
    ['b', 100000, 100000], ['a', 0, 50000], ['later', 10, 100010 / 3],
  ])
  expect(progressTimeDomain(equal.points)).toEqual([Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 4)])
})

test.each([[0, '0s'], [0.01, '0.01s'], [1.25, '1.25s'], [59.999, '1m'], [60, '1m'], [90.5, '1m 30.5s'], [3600, '1h'], [3661.25, '1h 1m 1.25s']])(
  'formats %s seconds with meaningful duration units', (seconds, label) => expect(formatDuration(Number(seconds))).toBe(label),
)
