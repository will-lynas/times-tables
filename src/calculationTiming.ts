import { object } from './storage'
import type { CalculationCell } from './calculations'
import type { Score } from './scores'

export type TimingSample = CellTiming & { ms: number; status: 'correct' | 'incorrect'; answer: string; runId: string; completedAt: string }
export type TimingPair = { row: number; column: number; correct: number; incorrect: number; missing: number; medianMs: number | null; samples: TimingSample[] }

export function summarizeTiming(scores: readonly Score[]) {
  const pairs = new Map<string, TimingPair>()
  let timedRuns = 0, measured = 0, missingAnswers = 0
  for (const score of scores) {
    const details = score.calculations
    if (!details) continue
    if (details.timing) timedRuns++
    for (const cell of details.cells) {
      if (cell.status === 'unanswered') continue
      const key = `${cell.row}:${cell.column}`
      const pair = pairs.get(key) ?? { row: cell.row, column: cell.column, correct: 0, incorrect: 0, missing: 0, medianMs: null, samples: [] }
      const timing = details.timing?.cells[cell.index]
      if (timing && timing.answerEntryMs !== null) {
        pair.samples.push({ ...timing, ms: timing.answerEntryMs, status: cell.status, answer: cell.answer, runId: score.id, completedAt: score.completedAt })
        pair[cell.status]++
        measured++
      } else { pair.missing++; missingAnswers++ }
      pairs.set(key, pair)
    }
  }
  for (const pair of pairs.values()) {
    const values = pair.samples.filter(sample => sample.status === 'correct').map(sample => sample.ms).sort((a, b) => a - b)
    const middle = Math.floor(values.length / 2)
    pair.medianMs = values.length === 0 ? null : values.length % 2 ? values[middle] : values[middle - 1] / 2 + values[middle] / 2
  }
  return { runs: scores.length, timedRuns, measured, missingAnswers, pairs: [...pairs.values()].sort((a, b) =>
    (a.medianMs === null && b.medianMs === null ? 0 : a.medianMs === null ? 1 : b.medianMs === null ? -1 : b.medianMs - a.medianMs) || a.row - b.row || a.column - b.column) }
}

export function validTiming(value: unknown, outcomes: readonly CalculationCell[]): value is CalculationTiming {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.cells) || value.cells.length !== outcomes.length) return false
  return value.cells.every((cell, index) => {
    if (!object(cell) || cell.index !== index) return false
    const duration = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
    const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    if (!duration(cell.focusedMs) || !count(cell.visits) || !count(cell.edits)) return false
    if (cell.visits === 0 && (cell.focusedMs !== 0 || cell.edits !== 0)) return false
    if (outcomes[index].answer === '') return cell.answerEntryMs === null
    return cell.edits > 0 && cell.visits > 0 && duration(cell.answerEntryMs) && cell.answerEntryMs <= cell.focusedMs
  })
}

export type CellTiming = { index: number; answerEntryMs: number | null; focusedMs: number; visits: number; edits: number }
export type CalculationTiming = { version: 1; cells: CellTiming[] }

// One event-driven collector per actual start; no React effect owns its lifetime.
export class CalculationTimer {
  private cells: CellTiming[]
  private focused: number | null = 0
  private since: number
  private active: boolean
  private stopped = false
  constructor(count: number, now: number, active: boolean) {
    this.cells = Array.from({ length: count }, (_, index) => ({ index, answerEntryMs: null, focusedMs: 0, visits: index === 0 ? 1 : 0, edits: 0 }))
    this.since = now
    this.active = active
  }
  private tick(now: number) {
    if (!this.stopped && this.active && this.focused !== null) this.cells[this.focused].focusedMs += Math.max(0, now - this.since)
    this.since = now
  }
  focus(index: number, now: number) {
    if (this.stopped) return
    this.tick(now)
    if (this.focused !== index) this.cells[index].visits++
    this.focused = index
  }
  blur(now: number) {
    if (this.stopped) return
    this.tick(now)
    this.focused = null
  }
  setActive(active: boolean, now: number) {
    if (this.stopped) return
    this.tick(now)
    this.active = active
  }
  edit(index: number, value: string, now: number) {
    if (this.stopped) return
    this.tick(now)
    const cell = this.cells[index]
    cell.edits++
    cell.answerEntryMs = value === '' ? null : cell.focusedMs
  }
  snapshot(now: number): CalculationTiming {
    this.tick(now)
    this.stopped = true
    return { version: 1, cells: this.cells.map(cell => ({ ...cell })) }
  }
}
