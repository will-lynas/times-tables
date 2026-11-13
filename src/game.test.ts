import { expect, test } from 'vitest'
import { createGrid, scoreAnswers } from './game'

test.each(['', '  ', '1e0', '-1', '1.0', 'abc'])('refuses an unfinished or invalid answer: %j', answer => {
  const grid = createGrid('ordered')
  const answers = grid.products.map(String)
  answers[0] = answer
  expect(() => scoreAnswers(grid, answers)).toThrow('Fill every cell with a whole number before finishing.')
})

test('refuses a partial answer list', () => {
  expect(() => scoreAnswers(createGrid('ordered'), ['1'])).toThrow()
})

test('scores a finished grid without treating a wrong answer as correct', () => {
  const grid = createGrid('ordered')
  const answers = grid.products.map(String)
  answers[0] = '2'
  const score = scoreAnswers(grid, answers)
  expect(score.correct).toBe(143)
  expect(score.total).toBe(144)
  expect(score.accuracy).toBeCloseTo(99.305555)
  expect(score.matches).toEqual([false, ...Array(143).fill(true)])
})

test('shuffled axes are independent permutations with matching products', () => {
  let seed = 37
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const grid = createGrid('shuffled', random)
  const ordered = Array.from({ length: 12 }, (_, index) => index + 1)
  expect([...grid.rows].sort((a, b) => a - b)).toEqual(ordered)
  expect([...grid.columns].sort((a, b) => a - b)).toEqual(ordered)
  expect(grid.rows).not.toEqual(ordered)
  expect(grid.columns).not.toEqual(ordered)
  expect(grid.rows).not.toEqual(grid.columns)
  expect(grid.products).toEqual(grid.rows.flatMap(row => grid.columns.map(column => row * column)))
})

test('ordered grid contains the complete 1–12 multiplication table', () => {
  const grid = createGrid('ordered')
  const headers = Array.from({ length: 12 }, (_, index) => index + 1)
  expect(grid.rows).toEqual(headers)
  expect(grid.columns).toEqual(headers)
  expect(grid.products).toEqual(headers.flatMap(row => headers.map(column => row * column)))
})
