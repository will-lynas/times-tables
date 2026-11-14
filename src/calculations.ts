import { canonicalFactors } from './factors'
import { validTiming, type CalculationTiming } from './calculationTiming'
import { object } from './storage'
import type { Score } from './scores'

export type CalculationCell = {
  index: number
  rowIndex: number
  columnIndex: number
  row: number
  column: number
  answer: string
  product: number
  status: 'correct' | 'incorrect' | 'unanswered'
}

export type CalculationDetails = { version: 1; cells: CalculationCell[]; timing?: CalculationTiming }

// Optional additive extension: absent means unknown historical detail, never zero.
// Unknown fields survive untouched; unsupported versions/shapes block writes.
export function validCalculations(value: unknown, score: Score): value is CalculationDetails {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.cells) || value.cells.length !== score.total) return false
  const rows: number[] = [], columns: number[] = []
  let attempted = 0, correct = 0
  for (let index = 0; index < value.cells.length; index++) {
    const cell = value.cells[index]
    if (!object(cell)) return false
    const rowIndex = Math.floor(index / score.size), columnIndex = index % score.size
    if (cell.index !== index || cell.rowIndex !== rowIndex || cell.columnIndex !== columnIndex
      || typeof cell.row !== 'number' || typeof cell.column !== 'number'
      || typeof cell.answer !== 'string' || !/^\d{0,3}$/.test(cell.answer)
      || cell.product !== cell.row * cell.column) return false
    if (columnIndex === 0) rows.push(cell.row)
    if (rowIndex === 0) columns.push(cell.column)
    if (rows[rowIndex] !== cell.row || columns[columnIndex] !== cell.column) return false
    const status = cell.answer === '' ? 'unanswered' : Number(cell.answer) === cell.product ? 'correct' : 'incorrect'
    if (cell.status !== status) return false
    if (status !== 'unanswered') attempted++
    if (status === 'correct') correct++
  }
  const factors = JSON.stringify(canonicalFactors(score.factors))
  return (!Object.hasOwn(value, 'timing') || validTiming(value.timing, value.cells as CalculationCell[]))
    && attempted === score.attempted && correct === score.correct
    && rows.length === score.size && new Set(rows).size === score.size && new Set(columns).size === score.size
    && JSON.stringify(canonicalFactors(rows)) === factors && JSON.stringify(canonicalFactors(columns)) === factors
    && (score.mode !== 'ordered' || (JSON.stringify(rows) === factors && JSON.stringify(columns) === factors))
}

export function summarizeCalculations(scores: readonly Score[]) {
  const rows = new Map<string, { row: number; column: number; product: number; wrong: number; answered: number; answers: Map<string, number> }>()
  let detailedRuns = 0, answered = 0
  for (const score of scores) {
    if (!score.calculations) continue
    detailedRuns++
    for (const cell of score.calculations.cells) {
      if (cell.status === 'unanswered') continue
      answered++
      const key = `${cell.row}:${cell.column}`
      const item = rows.get(key) ?? { row: cell.row, column: cell.column, product: cell.product, wrong: 0, answered: 0, answers: new Map<string, number>() }
      item.answered++
      if (cell.status === 'incorrect') {
        item.wrong++
        item.answers.set(cell.answer, (item.answers.get(cell.answer) ?? 0) + 1)
      }
      rows.set(key, item)
    }
  }
  return { runs: scores.length, detailedRuns, answered,
    incorrect: [...rows.values()].filter(item => item.wrong > 0).sort((a, b) => b.wrong - a.wrong || a.row - b.row || a.column - b.column)
      .map(item => ({ ...item, errorRate: item.wrong / item.answered,
        answers: [...item.answers].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) })) }
}
