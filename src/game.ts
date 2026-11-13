export type Mode = 'ordered' | 'shuffled'
export type Grid = { rows: number[]; columns: number[]; products: number[] }

export function scoreAnswers(grid: Grid, answers: string[]) {
  if (answers.length !== grid.products.length || answers.some(answer => !/^\d{1,3}$/.test(answer))) {
    throw new Error('Fill every cell with a whole number before finishing.')
  }
  const matches = grid.products.map((product, index) => Number(answers[index]) === product)
  const correct = matches.filter(Boolean).length
  return { correct, total: matches.length, accuracy: correct / matches.length * 100, matches }
}

export function createGrid(mode: Mode, random = Math.random): Grid {
  const rows = Array.from({ length: 12 }, (_, index) => index + 1)
  const columns = [...rows]
  if (mode === 'shuffled') {
    for (const axis of [rows, columns]) {
      for (let index = axis.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1))
        ;[axis[index], axis[other]] = [axis[other], axis[index]]
      }
    }
  }
  return { rows, columns, products: rows.flatMap(row => columns.map(column => row * column)) }
}
