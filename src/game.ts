export type Mode = 'ordered' | 'shuffled'
export type Grid = { size: number; rows: number[]; columns: number[]; products: number[] }

export function scoreAnswers(grid: Grid, answers: string[]) {
  if (answers.length !== grid.products.length || answers.some(answer => !/^\d{0,3}$/.test(answer)) || !answers.some(Boolean)) {
    throw new Error('Enter at least one answer using whole numbers before finishing.')
  }
  const matches = grid.products.map((product, index) => answers[index] === '' ? null : Number(answers[index]) === product)
  const correct = matches.filter(match => match === true).length
  const attempted = matches.filter(match => match !== null).length
  const status: 'complete' | 'partial' = attempted === matches.length ? 'complete' : 'partial'
  return { status, correct, attempted, total: matches.length, accuracy: correct / attempted * 100, matches }
}

export function createGrid(mode: Mode, random = Math.random, size = 12): Grid {
  if (!Number.isInteger(size) || size < 2 || size > 12) {
    throw new Error('Grid size must be a whole number from 2 to 12.')
  }
  const rows = Array.from({ length: size }, (_, index) => index + 1)
  const columns = [...rows]
  if (mode === 'shuffled') {
    for (const axis of [rows, columns]) {
      for (let index = axis.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1))
        ;[axis[index], axis[other]] = [axis[other], axis[index]]
      }
    }
  }
  return { size, rows, columns, products: rows.flatMap(row => columns.map(column => row * column)) }
}
