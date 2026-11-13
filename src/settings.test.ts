import { afterEach, expect, test, vi } from 'vitest'
import { loadSettings, saveSettings } from './settings'

const defaults = { mode: 'shuffled' as const, size: 12, scoreMode: 'all' as const, scoreSize: 'all' as const }
afterEach(() => vi.unstubAllGlobals())

function storage(raw: string | null) {
  const values = new Map(raw === null ? [] : [['times-tables.settings', raw]])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
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
  expect(loadSettings()).toEqual(settings)
  expect(values.get('times-tables.scores')).toBe('existing history')
})

test('handles unavailable storage access and failed writes', async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new DOMException('Blocked', 'SecurityError') },
    setItem: () => { throw new DOMException('Full', 'QuotaExceededError') },
  })
  expect(loadSettings()).toMatchObject(defaults)
  expect(() => saveSettings({ ...defaults, mode: 'ordered', size: 2 })).not.toThrow()
})
