import { expect, test } from 'vitest'
import { CalculationTimer } from './calculationTiming'

test('entry checkpoint ends at the final edit, not the finish wait', () => {
  const timer = new CalculationTimer(2, 100, true)
  timer.edit(0, '3', 400)
  timer.edit(0, '36', 600)
  expect(timer.snapshot(1600).cells).toEqual([
    { index: 0, answerEntryMs: 500, focusedMs: 1500, visits: 1, edits: 2 },
    { index: 1, answerEntryMs: null, focusedMs: 0, visits: 0, edits: 0 },
  ])
  expect(timer.snapshot(9999).cells[0].focusedMs).toBe(1500)
})

test('revisits without edits keep the checkpoint; later corrections accumulate focus', () => {
  const timer = new CalculationTimer(2, 0, true)
  timer.edit(0, '3', 100)
  timer.focus(1, 200)
  timer.edit(1, '54', 500)
  timer.focus(0, 600)
  timer.blur(800)
  timer.focus(0, 900)
  timer.edit(0, '', 1000)
  timer.edit(0, '36', 1100)
  timer.focus(1, 1200)
  expect(timer.snapshot(1500).cells).toEqual([
    { index: 0, answerEntryMs: 600, focusedMs: 700, visits: 3, edits: 3 },
    { index: 1, answerEntryMs: 300, focusedMs: 700, visits: 2, edits: 1 },
  ])
})

test('environment pauses are idempotent, preserve identity and do not add visits', () => {
  const timer = new CalculationTimer(2, 0, true)
  timer.focus(0, 50) // autofocus and StrictMode replay are not new visits
  timer.setActive(false, 100)
  timer.setActive(false, 200)
  timer.setActive(true, 1000)
  timer.setActive(true, 1100)
  timer.edit(0, '36', 1200)
  timer.blur(1300)
  timer.setActive(false, 1400)
  timer.setActive(true, 2000)
  expect(timer.snapshot(3000).cells[0]).toEqual({ index: 0, answerEntryMs: 300, focusedMs: 400, visits: 1, edits: 1 })
})

test('real zero, cleared answer, unedited focus and detached snapshots stay distinct', () => {
  const timer = new CalculationTimer(3, 10, true)
  timer.edit(0, '1', 10)
  timer.focus(1, 10)
  timer.edit(1, '2', 20)
  timer.edit(1, '', 30)
  timer.focus(2, 40)
  const snapshot = timer.snapshot(50)
  expect(snapshot.cells).toEqual([
    { index: 0, answerEntryMs: 0, focusedMs: 0, visits: 1, edits: 1 },
    { index: 1, answerEntryMs: null, focusedMs: 30, visits: 1, edits: 2 },
    { index: 2, answerEntryMs: null, focusedMs: 10, visits: 1, edits: 0 },
  ])
  snapshot.cells[0].focusedMs = 999
  timer.edit(0, '2', 100)
  expect(timer.snapshot(200).cells[0].focusedMs).toBe(0)
})
