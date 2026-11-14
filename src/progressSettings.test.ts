import { afterEach, expect, test, vi } from 'vitest'
import { loadProgressSelection, recoverProgressSelection, saveProgressSelection } from './progressSettings'

const fallback = { mode: 'ordered' as const, size: 3 }
afterEach(() => vi.unstubAllGlobals())

function storage(raw: string | null) {
  const values = new Map(raw === null ? [] : [['times-tables.progress', raw]])
  vi.stubGlobal('localStorage', { get length() { return values.size }, key: (index: number) => [...values.keys()][index] ?? null, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value) })
  return values
}

test('defaults to current game once, then saves a separate exact graph selection', async () => {
  const values = storage(null)
  expect(loadProgressSelection(fallback)).toMatchObject(fallback)
  await saveProgressSelection({ mode: 'shuffled', size: 12 })
  expect(loadProgressSelection(fallback)).toEqual({ mode: 'shuffled', size: 12 })
  expect([...values.keys()].filter(key => !key.includes('.intent.') && !key.includes('.receipt.'))).toEqual(['times-tables.progress'])
  expect([...values.keys()].filter(key => key.includes('.intent.'))).toHaveLength(1)
  expect([...values.keys()].filter(key => key.includes('.receipt.'))).toHaveLength(1)
})

test.each(['{broken', 'null', '[]', '{}', '"ordered"',
  ...['all', 1, 13, 2.5, '2', null].map(size => JSON.stringify({ mode: 'ordered', size })),
  JSON.stringify({ mode: 'all', size: 3 }),
])('ignores invalid graph selections, never pools all settings: %s', async raw => {
  storage(raw)
  expect(loadProgressSelection(fallback)).toMatchObject(fallback)
})

test('denied browser storage leaves graph usable', async () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Blocked') }, setItem: () => { throw new Error('Full') } })
  expect(loadProgressSelection(fallback)).toMatchObject(fallback)
  expect(() => saveProgressSelection(fallback)).not.toThrow()
})

test('axis patches load and replay through the progress journal without replacing sibling preferences', async () => {
  const raw = ' { "version": 1, "mode": "ordered", "size": 3, "showAverage": false, "future": {"kept":[1,2]} } '
  const values = storage(raw)
  const saved = JSON.parse(raw)
  expect(loadProgressSelection(fallback).axisMode).toBeUndefined()
  await expect(saveProgressSelection({ axisMode: 'runs' }, fallback)).resolves.toBeNull()
  expect(loadProgressSelection(fallback)).toMatchObject({ ...fallback, axisMode: 'runs' })
  expect(JSON.parse(values.get('times-tables.progress')!)).toEqual({ ...saved, axisMode: 'runs' })
  const intent = [...values.keys()].find(k => k.includes('.intent.'))!
  values.delete(intent.replace('.intent.', '.receipt.'))
  values.set('times-tables.progress', raw)
  await expect(recoverProgressSelection()).resolves.toBeNull()
  expect(loadProgressSelection(fallback).axisMode).toBe('runs')
  await saveProgressSelection({ mode: 'shuffled' }, fallback)
  expect(loadProgressSelection(fallback)).toMatchObject({ mode: 'shuffled', axisMode: 'runs' })
  await saveProgressSelection({ axisMode: 'time' }, fallback)
  expect(loadProgressSelection(fallback)).toMatchObject({ mode: 'shuffled', axisMode: 'time' })
})

test('axis patch backs up exact legacy preference source and preserves unrelated metadata', async () => {
  const raw = ' { "mode": "ordered", "size": 3, "showAverage": false, "future": {"kept":[1,2]} } '
  const values = storage(raw)
  await expect(saveProgressSelection({ axisMode: 'runs' }, fallback)).resolves.toBeNull()
  expect(JSON.parse(values.get('times-tables.progress.backup.vunversioned')!)).toEqual([raw])
  expect(JSON.parse(values.get('times-tables.progress')!)).toEqual({ ...JSON.parse(raw), version: 1, axisMode: 'runs' })
  const intents = [...values].filter(([key]) => key.includes('.intent.'))
  expect(intents).toHaveLength(1)
  expect(JSON.parse(intents[0][1]).payload.change).toEqual({ axisMode: 'runs' })
  await recoverProgressSelection()
  expect([...values].filter(([key]) => key.includes('.intent.'))).toEqual(intents)
})

test.each(['future', null, false, 1, {}, []].map(axisMode => ({ axisMode })))('unknown axis format $axisMode refuses writes and keeps original bytes', async ({ axisMode }) => {
  const raw = JSON.stringify({ version: 1, ...fallback, axisMode, future: { kept: true } })
  const values = storage(raw)
  expect(loadProgressSelection(fallback)).toMatchObject({ ...fallback, warning: expect.any(String) })
  await expect(saveProgressSelection({ axisMode: 'runs' }, fallback)).resolves.toEqual(expect.any(String))
  expect(values.get('times-tables.progress')).toBe(raw)
  expect([...values.keys()]).toEqual(['times-tables.progress'])
})
