import { afterEach, expect, test, vi } from 'vitest'
import { loadProgressSelection, saveProgressSelection } from './progressSettings'

const fallback = { mode: 'ordered' as const, size: 3 }
afterEach(() => vi.unstubAllGlobals())

function storage(raw: string | null) {
  const values = new Map(raw === null ? [] : [['times-tables.progress', raw]])
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value) })
  return values
}

test('defaults to current game once, then saves a separate exact graph selection', () => {
  const values = storage(null)
  expect(loadProgressSelection(fallback)).toEqual(fallback)
  saveProgressSelection({ mode: 'shuffled', size: 12 })
  expect(loadProgressSelection(fallback)).toEqual({ mode: 'shuffled', size: 12 })
  expect([...values.keys()]).toEqual(['times-tables.progress'])
})

test.each(['{broken', 'null', '[]', '{}', '"ordered"',
  ...['all', 1, 13, 2.5, '2', null].map(size => JSON.stringify({ mode: 'ordered', size })),
  JSON.stringify({ mode: 'all', size: 3 }),
])('ignores invalid graph selections, never pools all settings: %s', raw => {
  storage(raw)
  expect(loadProgressSelection(fallback)).toEqual(fallback)
})

test('denied browser storage leaves graph usable', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Blocked') }, setItem: () => { throw new Error('Full') } })
  expect(loadProgressSelection(fallback)).toEqual(fallback)
  expect(() => saveProgressSelection(fallback)).not.toThrow()
})
