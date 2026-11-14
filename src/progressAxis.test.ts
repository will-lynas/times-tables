import { expect, test } from 'vitest'
import { buildProgress } from './progress'
import type { Score } from './scores'

const selection = { mode: 'ordered' as const, size: 2 }
const run = (id: string, day: number, change: Partial<Score> = {}): Score => ({ id, mode: 'ordered', size: 2, factors: [1, 2], status: 'complete', attempted: 4, total: 4, correct: 4, elapsedMs: 60000, completedAt: new Date(Date.UTC(2026, 0, 1) + day * 86400000).toISOString(), ...change })

test('Runs projects every selected observation in stable chronological order without compressing eligible indices', () => {
  const scores = [run('late', 10, { elapsedMs: 0 }), run('partial', 0, { status: 'partial', attempted: 1, correct: 1 }), run('first', 1), run('duplicate', 1, { elapsedMs: 40000 }), run('wrong', 3, { correct: 3 }), run('other-set', 4, { factors: [2, 3] }), run('other-mode', 5, { mode: 'shuffled' })]
  const before = JSON.stringify(scores)
  const time = buildProgress(scores, selection).points
  const runs = buildProgress(scores, { ...selection, axisMode: 'runs' }).points
  expect(runs.map(p => [p.id, p.runNumber, p.x])).toEqual([['partial', 1, 1], ['first', 2, 2], ['duplicate', 3, 3], ['wrong', 4, 4], ['late', 5, 5]])
  expect(time.map(p => p.x)).toEqual(time.map(p => p.timestamp))
  expect(runs.filter(p => p.perfect).map(p => [p.x, p.averageSeconds, p.average100Seconds])).toEqual([[2, 60, 60], [3, 50, 50], [5, 100 / 3, 100 / 3]])
  expect(runs.map(p => p.bestSeconds)).toEqual([null, 60, 40, 40, 0])
  expect(runs.map(({ x: _, ...p }) => p)).toEqual(time.map(({ x: _, ...p }) => p))
  expect(JSON.stringify(scores)).toBe(before)
})

test.each([[], [run('zero', 0, { elapsedMs: 0 })], [run('extreme', 0, { elapsedMs: 100000000 })]].map(scores => ({ scores })))('Runs edge populations remain observational: $scores', ({ scores }) => {
  const points = buildProgress(scores, { ...selection, axisMode: 'runs' }).points
  expect(points).toHaveLength(scores.length)
  points.forEach((p, i) => expect(p).toMatchObject({ x: i + 1, runNumber: i + 1, seconds: scores[i].elapsedMs / 1000 }))
})
