import type { CalculationDetails } from '../calculations'

// Synthetic archived schema fixtures, never called by gameplay or production code.
// Positions/operands are fixed independently of createGrid and scoreAnswers.
export function historicalDetails(answers = ['36', '54', '0', '']): CalculationDetails {
  const positions = [
    { index: 0, rowIndex: 0, columnIndex: 0, row: 6, column: 6, product: 36 },
    { index: 1, rowIndex: 0, columnIndex: 1, row: 6, column: 9, product: 54 },
    { index: 2, rowIndex: 1, columnIndex: 0, row: 9, column: 6, product: 54 },
    { index: 3, rowIndex: 1, columnIndex: 1, row: 9, column: 9, product: 81 },
  ]
  return { version: 1, cells: positions.map((cell, index) => ({ ...cell, answer: answers[index],
    status: answers[index] === '' ? 'unanswered' : Number(answers[index]) === cell.product ? 'correct' : 'incorrect' })) }
}

export function historicalTimedDetails(): CalculationDetails {
  return { ...historicalDetails(['36', '', '', '']), timing: { version: 1, cells: [
    { index: 0, answerEntryMs: 0, focusedMs: 100, visits: 1, edits: 1 },
    { index: 1, answerEntryMs: null, focusedMs: 0, visits: 0, edits: 0 },
    { index: 2, answerEntryMs: null, focusedMs: 0, visits: 0, edits: 0 },
    { index: 3, answerEntryMs: null, focusedMs: 0, visits: 0, edits: 0 },
  ] } }
}
