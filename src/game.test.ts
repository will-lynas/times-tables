import { expect, test } from 'vitest'
import { createGrid, scoreAnswers } from './game'

test.each(['  ', '1e0', '-1', '1.0', 'abc'])('refuses an invalid answer: %j', answer => {
  const grid = createGrid('ordered')
  const answers = grid.products.map(String)
  answers[0] = answer
  expect(() => scoreAnswers(grid, answers)).toThrow('Enter at least one answer using whole numbers before finishing.')
})

test('grades only attempted answers and leaves blanks ungraded', () => {
  const grid = createGrid('ordered')
  const answers = Array(144).fill('')
  answers[0] = '1'
  answers[1] = '0'
  expect(scoreAnswers(grid, answers)).toEqual({
    status: 'partial', correct: 1, attempted: 2, total: 144, accuracy: 50,
    matches: [true, false, ...Array(142).fill(null)],
  })
})

test('refuses to grade an entirely blank grid', () => {
  expect(() => scoreAnswers(createGrid('ordered'), Array(144).fill(''))).toThrow()
})

test('refuses a partial answer list', () => {
  expect(() => scoreAnswers(createGrid('ordered'), ['1'])).toThrow()
})

test('grades a smaller grid using its actual total and attempted denominator', () => {
  const grid = createGrid('ordered', Math.random, 2)
  expect(scoreAnswers(grid, ['0', '', '', ''])).toEqual({
    status: 'partial', correct: 0, attempted: 1, total: 4, accuracy: 0, matches: [false, null, null, null],
  })
  expect(scoreAnswers(grid, ['1', '2', '2', '4'])).toMatchObject({
    status: 'complete', correct: 4, attempted: 4, total: 4, accuracy: 100,
  })
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

test.each([2, 7, 12])('shuffled axes are independent permutations with matching products at size %i', size => {
  let seed = 37
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const grid = createGrid('shuffled', random, size)
  const ordered = Array.from({ length: size }, (_, index) => index + 1)
  expect([...grid.rows].sort((a, b) => a - b)).toEqual(ordered)
  expect([...grid.columns].sort((a, b) => a - b)).toEqual(ordered)
  if (size > 2) {
    expect(grid.rows).not.toEqual(ordered)
    expect(grid.columns).not.toEqual(ordered)
    expect(grid.rows).not.toEqual(grid.columns)
  }
  expect(grid.products).toEqual(grid.rows.flatMap(row => grid.columns.map(column => row * column)))
})

test.each(Array.from({ length: 11 }, (_, index) => index + 2))('creates and scores a table of size %i', size => {
  const grid = createGrid('ordered', Math.random, size)
  const headers = Array.from({ length: size }, (_, index) => index + 1)
  expect(grid.size).toBe(size)
  expect(grid.rows).toEqual(headers)
  expect(grid.columns).toEqual(headers)
  expect(grid.products).toEqual(headers.flatMap(row => headers.map(column => row * column)))
  expect(scoreAnswers(grid, grid.products.map(String))).toEqual({
    status: 'complete', attempted: size * size, correct: size * size, total: size * size, accuracy: 100, matches: Array(size * size).fill(true),
  })
})

test.each([0, 1, 13, -2, 2.5, NaN, Infinity])('rejects an unsupported grid size: %s', size => {
  expect(() => createGrid('ordered', Math.random, size)).toThrow('Grid size must be a whole number from 2 to 12.')
})

test('ordered grid contains the complete 1–12 multiplication table', () => {
  const grid = createGrid('ordered')
  expect(grid.size).toBe(12)
  const headers = Array.from({ length: 12 }, (_, index) => index + 1)
  expect(grid.rows).toEqual(headers)
  expect(grid.columns).toEqual(headers)
  expect(grid.products).toEqual(headers.flatMap(row => headers.map(column => row * column)))
})
