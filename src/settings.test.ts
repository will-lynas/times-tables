import { afterEach, expect, test, vi } from 'vitest'
import { loadSettings, saveSettings } from './settings'

const defaults = { mode: 'shuffled' as const, size: 12, scoreMode: 'all' as const, scoreSize: 'all' as const, spaceToAdvance: false }
afterEach(() => vi.unstubAllGlobals())

function storage(raw: string | null) {
  const values = new Map(raw === null ? [] : [['times-tables.settings', raw]])
  vi.stubGlobal('localStorage', {
    get length() { return values.size }, key: (index: number) => [...values.keys()][index] ?? null, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  })
  return values
}

test.each([null, '{broken', 'null', '[]', '{}', '"ordered"', JSON.stringify({ mode: 'invalid', size: '2' }),
  ...[0, 1, 13, 2.5].map(size => JSON.stringify({ size })),
  ...[0, 1, 13, 2.5, '2', null].map(scoreSize => JSON.stringify({ scoreMode: 'invalid', scoreSize })),
])('falls back safely for missing or invalid settings (%#)', async raw => {
  storage(raw)
  expect(loadSettings()).toMatchObject(defaults)
})

test('restores validated round settings and history filters independently', async () => {
  storage(JSON.stringify({ mode: 'ordered', size: 99, scoreMode: 'shuffled', scoreSize: 2 }))
  expect(loadSettings()).toEqual({ ...defaults, mode: 'ordered', scoreMode: 'shuffled', scoreSize: 2, warning: expect.any(String) })
  storage(JSON.stringify({ mode: 'invalid', size: 2, scoreMode: 'invalid', scoreSize: 13 }))
  expect(loadSettings()).toEqual({ ...defaults, size: 2, warning: expect.any(String) })
})

test('saves and restores settings without touching score history', async () => {
  const values = storage(null)
  values.set('times-tables.scores', 'existing history')
  const settings = { mode: 'ordered' as const, size: 7, scoreMode: 'shuffled' as const, scoreSize: 3 }
  await saveSettings(settings)
  expect(loadSettings()).toEqual({ ...settings, spaceToAdvance: false })
  expect(values.get('times-tables.scores')).toBe('existing history')
})

test.each([null, '{}', '{"version":1,"size":2}'])('Space navigation defaults off without writing absent fields (%s)', raw => {
  const values = storage(raw)
  expect(loadSettings().spaceToAdvance).toBe(false)
  expect(values.get('times-tables.settings') ?? null).toBe(raw)
})

test.each([true, false])('restores and deliberately patches Space navigation (%s) without losing unknown fields', async spaceToAdvance => {
  const source = ' {"mode":"ordered","unknown":{"nested":[1,2]}} '
  const values = storage(source)
  expect(await saveSettings({ spaceToAdvance })).toBeNull()
  expect(loadSettings().spaceToAdvance).toBe(spaceToAdvance)
  expect(JSON.parse(values.get('times-tables.settings')!)).toEqual({ version: 1, mode: 'ordered', spaceToAdvance, unknown: { nested: [1, 2] } })
  expect(JSON.parse(values.get('times-tables.settings.backup.vunversioned')!)).toEqual([source])
})

test.each(['true', 1, null])('refuses invalid Space values without replacing source (%s)', async spaceToAdvance => {
  const source = JSON.stringify({ version: 1, spaceToAdvance, unknown: 'kept' })
  const values = storage(source)
  expect(loadSettings()).toMatchObject({ spaceToAdvance: false, warning: expect.any(String) })
  expect(await saveSettings({ mode: 'ordered' })).toEqual(expect.any(String))
  expect(values.get('times-tables.settings')).toBe(source)
})

test('handles unavailable storage access and failed writes', async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new DOMException('Blocked', 'SecurityError') },
    setItem: () => { throw new DOMException('Full', 'QuotaExceededError') },
  })
  expect(loadSettings()).toMatchObject(defaults)
  expect(() => saveSettings({ ...defaults, mode: 'ordered', size: 2 })).not.toThrow()
})
