import { expect, test } from 'vitest'
import { summarizeTiming } from './calculationTiming'
import { createGrid, scoreAnswers } from './game'
import type { Score } from './scores'

function run(id: string, durations: number[], answers = ['36', '54', '54', '81']): Score {
  const result = scoreAnswers(createGrid('ordered', Math.random, [6, 9]), answers)
  return { id, factors: [6, 9], size: 2, mode: 'ordered', correct: result.correct, attempted: result.attempted, total: 4, status: result.status,
    elapsedMs: 9999999, completedAt: '2026-01-01T00:00:00Z', calculations: { ...result.calculations, timing: { version: 1,
      cells: durations.map((duration, index) => ({ index, answerEntryMs: answers[index] === '' ? null : duration, focusedMs: duration, visits: 1, edits: 1 })) } } }
}

test('correct-only medians rank ordered pairs and retain duplicates, zero, extremes and incorrect samples', () => {
  const first = run('first', [0, 2000, 7000, 1], ['36', '54', '0', ''])
  const second = run('second', [1000, 4000, 0, 1], ['36', '54', '0', ''])
  const third = run('third', [1000, 6000, 1000000, 1], ['36', '54', '54', ''])
  const fourth = run('fourth', [9000, 8000, 0, 1], ['36', '54', '0', ''])
  const { timing: _, ...oldDetails } = first.calculations!
  const old = { ...first, id: 'stage1', calculations: oldDetails }
  const { calculations: __, ...legacy } = old
  const summary = summarizeTiming([first, second, third, fourth, old, { ...legacy, id: 'legacy' }])
  expect(summary).toMatchObject({ runs: 6, timedRuns: 4, measured: 12, missingAnswers: 3 })
  expect(summary.pairs.map(pair => [pair.row, pair.column, pair.medianMs, pair.correct, pair.incorrect, pair.missing])).toEqual([
    [9, 6, 1000000, 1, 3, 1], [6, 9, 5000, 4, 0, 1], [6, 6, 1000, 4, 0, 1],
  ])
  expect(summary.pairs[2].samples.map(sample => sample.ms)).toEqual([0, 1000, 1000, 9000])
  expect(summary.pairs[0].samples.map(sample => [sample.ms, sample.status])).toEqual([[7000, 'incorrect'], [0, 'incorrect'], [1000000, 'correct'], [0, 'incorrect']])
})

test('no correct sample is unranked; old detail and aggregate-only history never become zero samples', () => {
  const wrong = run('wrong', [0, 0, 0, 0], ['0', '', '', ''])
  const { timing: _, ...details } = wrong.calculations!
  const old = { ...wrong, id: 'old', calculations: details }
  expect(summarizeTiming([wrong, old])).toMatchObject({ runs: 2, timedRuns: 1, measured: 1, missingAnswers: 1,
    pairs: [{ row: 6, column: 6, medianMs: null, correct: 0, incorrect: 1, missing: 1 }] })
  expect(summarizeTiming([old]).pairs[0].samples).toEqual([])
  expect(summarizeTiming([])).toEqual({ runs: 0, timedRuns: 0, measured: 0, missingAnswers: 0, pairs: [] })
})

test('unranked pairs have deterministic numeric order even when encountered in reverse', () => {
  const score = run('ordered', [0, 0, 0, 0], ['0', '0', '0', '0'])
  score.calculations!.cells.reverse()
  expect(summarizeTiming([score]).pairs.map(pair => [pair.row, pair.column])).toEqual([[6, 6], [6, 9], [9, 6], [9, 9]])
})
