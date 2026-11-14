import { afterEach, expect, test, vi } from 'vitest'
import { loadSettings, saveSettings } from './settings'
import { loadProgressSelection, saveProgressSelection } from './progressSettings'
import { canonicalFactors, factorKey, factorLabel, factorOption, factorsFromOption, settingLabel } from './factors'

afterEach(() => vi.unstubAllGlobals())
function settingsStorage(raw: string | null = null) {
  const values = new Map(raw === null ? [] : [['times-tables.settings', raw]])
  vi.stubGlobal('localStorage', { get length() { return values.size }, key: (index: number) => [...values.keys()][index] ?? null, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
  return values
}

test('persists Custom separately from the active preset and graph exact-set selection', async () => {
  settingsStorage()
  const custom = { ...loadSettings(), choice: 'custom' as const, customFactors: a }
  await saveSettings(custom)
  expect(loadSettings()).toEqual(custom)
  await saveSettings({ ...custom, choice: 'preset', size: 2 })
  expect(loadSettings()).toMatchObject({ choice: 'preset', size: 2, customFactors: a })
  await saveProgressSelection({ mode: 'ordered', size: 5, factors: a })
  expect(loadProgressSelection({ mode: 'shuffled', size: 12 })).toEqual({ mode: 'ordered', size: 5, factors: a })
})

test('keeps malformed saved Custom members visible as an error, with original bytes intact on writes', async () => {
  const raw = JSON.stringify({ mode: 'ordered', size: 5, choice: 'custom', customFactors: [7, '8', 13] })
  const values = settingsStorage(raw)
  const loaded = loadSettings()
  expect(loaded.customFactors).toEqual([])
  expect(loaded.choice).toBe('custom')
  expect(loaded.warning).toMatch(/could not be read/i)
  await saveSettings({ ...loaded, choice: 'preset', size: 2 })
  expect(values.get('times-tables.settings')).toBe(raw)
})

test('uses compact, unambiguous exact-set labels and reversible filter values', async () => {
  for (const factors of [a, b, [13], Array.from({ length: 20 }, (_, i) => i + 1), [1, 2]]) {
    expect(factorsFromOption(factorOption(factors))).toEqual(factors)
  }
  expect(factorLabel(a)).toBe('7, 8, 9, 11, 13')
  expect(settingLabel(a)).toBe('{7, 8, 9, 11, 13}')
  expect(settingLabel([1, 2])).toBe('2 × 2')
  expect(factorLabel([])).toBe('None')
  expect(factorKey([13, 7, 7])).toBe('7,13')
})

test('supports singleton, all20, independent permutations and guards empty/invalid sets', async () => {
  expect(createGrid('ordered', Math.random, [20]).products).toEqual([400])
  const all = Array.from({ length: 20 }, (_, i) => i + 1)
  expect(createGrid('ordered', Math.random, all).products).toHaveLength(400)
  let seed = 37
  const grid = createGrid('shuffled', () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646, a)
  expect([...grid.rows].sort((x, y) => x - y)).toEqual(a)
  expect([...grid.columns].sort((x, y) => x - y)).toEqual(a)
  expect(grid.rows).not.toEqual(grid.columns)
  for (const invalid of [[], [0], [21], [1.5], ['7']]) {
    expect(() => createGrid('ordered', Math.random, invalid as number[])).toThrow()
  }
  expect(canonicalFactors([], true)).toEqual([])
})
import { createGrid, scoreAnswers } from './game'
import { loadScores, rankScores, saveScores, type Score } from './scores'
import { buildProgress } from './progress'

const a = [7, 8, 9, 11, 13]
const b = [1, 3, 5, 7, 9]
function round(id: string, factors: number[], elapsedMs = 1000): Score {
  return { id, factors, mode: 'ordered', size: factors.length, status: 'complete', attempted: factors.length ** 2,
    total: factors.length ** 2, correct: factors.length ** 2, elapsedMs, completedAt: '2026-01-01T00:00:00Z' }
}

test('isolates rankings and chronological graph/averages by canonical set, never just count', async () => {
  const scores = [round('a', a, 4000), round('b', b, 1000), round('equivalent', [...a].reverse(), 6000),
    { ...round('partial', a), status: 'partial' as const, correct: 1, attempted: 1 }]
  expect(rankScores(scores, 'ordered', a).map(s => s.id)).toEqual(['a', 'equivalent'])
  const progress = buildProgress(scores, { mode: 'ordered', size: 5, factors: a })
  expect(progress.points.map(p => [p.id, p.averageSeconds])).toEqual([['a', 4], ['equivalent', 5], ['partial', null]])
  expect(rankScores([round('standard', [1, 2])], 'ordered', 2)).toHaveLength(1)
})

test('roundtrips v4 factors and preserves v1/v2/v3 legacy fields and storage bytes', async () => {
  let raw: string | null = null
  const backups = new Map<string, string>()
  const storage = { get length() { return backups.size + 1 }, key: (index: number) => ['times-tables.scores', ...backups.keys()][index] ?? null, getItem: (key: string) => key === 'times-tables.scores' ? raw : backups.get(key) ?? null, setItem: (key: string, value: string) => { if (key === 'times-tables.scores') raw = value; else backups.set(key, value) } }
  for (const version of [1, 2, 3]) {
    const old = { ...round('legacy', Array.from({ length: version === 1 ? 12 : 5 }, (_, i) => i + 1)), factors: undefined }
    if (version === 3) Object.assign(old, { status: 'partial', correct: 1, attempted: 2 })
    raw = JSON.stringify({ version, scores: [old] })
    const original = raw
    const loaded = loadScores(() => storage)
    expect(loaded.warning).toBeNull()
    expect(loaded.scores[0]).toEqual({ ...JSON.parse(original).scores[0], factors: Array.from({ length: old.size }, (_, i) => i + 1) })
    expect(raw).toBe(original)
    expect(await saveScores([...loaded.scores, round('custom', a)], () => storage)).toBeNull()
    expect(JSON.parse(raw!).version).toBe(4)
    expect(loadScores(() => storage).scores).toEqual([...loaded.scores, round('custom', a)])
  }
})

test.each([[], [0, 7], [7, 21], [7, '8'], [7, null], [NaN], [2.5]].map(factors => [factors]))('rejects malformed saved factor sets without overwriting original bytes: %j', async factors => {
  let raw = JSON.stringify({ version: 4, scores: [{ ...round('bad', a), factors }] })
  const original = raw
  const backups = new Map<string, string>()
  const storage = { get length() { return backups.size + 1 }, key: (index: number) => ['times-tables.scores', ...backups.keys()][index] ?? null, getItem: (key: string) => key === 'times-tables.scores' ? raw : backups.get(key) ?? null, setItem: (key: string, value: string) => { if (key === 'times-tables.scores') raw = value; else backups.set(key, value) } }
  expect(loadScores(() => storage).warning).toMatch(/could not be read/)
  expect(await saveScores([round('new', a)], () => storage)).toMatch(/not saved/i)
  expect(raw).toBe(original)
})

test('does not save inconsistent factor count and keeps existing valid score bytes', async () => {
  let raw = JSON.stringify({ version: 4, scores: [round('old', a)] })
  const original = raw
  const backups = new Map<string, string>()
  const storage = { get length() { return backups.size + 1 }, key: (index: number) => ['times-tables.scores', ...backups.keys()][index] ?? null, getItem: (key: string) => key === 'times-tables.scores' ? raw : backups.get(key) ?? null, setItem: (key: string, value: string) => { if (key === 'times-tables.scores') raw = value; else backups.set(key, value) } }
  expect(await saveScores([{ ...round('bad', a), factors: [20] }], () => storage)).toMatch(/not saved/i)
  expect(raw).toBe(original)
})

test('malformed saved graph factors are warned about and never rewritten', async () => {
  const values = settingsStorage()
  const raw = JSON.stringify({ mode: 'ordered', size: 2, factors: [7, '8'] })
  values.set('times-tables.progress', raw)
  const selection = loadProgressSelection({ mode: 'shuffled', size: 12 })
  expect(selection.warning).toMatch(/could not be read/i)
  await saveProgressSelection({ mode: 'ordered', size: 5, factors: a })
  expect(values.get('times-tables.progress')).toBe(raw)
})

test('uses one canonical arbitrary factor set on both ordered axes', async () => {
  const grid = createGrid('ordered', Math.random, [13, 7, 9, 8, 11, 7])
  expect(grid.rows).toEqual([7, 8, 9, 11, 13])
  expect(grid.columns).toEqual(grid.rows)
  expect(grid.size).toBe(5)
  expect(grid.products).toEqual(grid.rows.flatMap(row => grid.columns.map(column => row * column)))
  expect(scoreAnswers(grid, grid.products.map(String))).toMatchObject({ correct: 25, total: 25, status: 'complete' })
})
