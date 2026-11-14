import { afterEach, expect, test, vi } from 'vitest'
import { loadScores, saveScores, SCORE_KEY, type Score } from './scores'
import { loadSettings, saveSettings } from './settings'
import { loadProgressSelection, saveProgressSelection } from './progressSettings'
import { loadTheme, saveTheme } from './theme'

export const example: Score = { id: 'synthetic', mode: 'ordered', size: 2, factors: [1, 2], status: 'partial', attempted: 2, correct: 1, total: 4, elapsedMs: 123.456, completedAt: '2026-01-01T00:00:00Z' }
function memory(raw: string | null, key = SCORE_KEY) {
  const values = new Map<string, string>(raw === null ? [] : [[key, raw]])
  const storage = { get length() { return values.size }, key: (index: number) => [...values.keys()][index] ?? null, getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v) } }
  vi.stubGlobal('localStorage', storage)
  return { storage, values }
}
afterEach(() => vi.unstubAllGlobals())

test.each(['times-tables.settings', 'times-tables.progress'])('patch %s keeps richer fields and backs up legacy bytes', async key => {
  const raw = ` ${JSON.stringify({ mode: 'ordered', size: 2, future: { nested: ['001', null] } })}\n`
  const { values } = memory(raw, key)
  const save = key.endsWith('settings') ? saveSettings : saveProgressSelection
  expect(await save({ mode: 'shuffled' })).toBeNull()
  expect(JSON.parse(values.get(key)!)).toEqual({ version: 1, mode: 'shuffled', size: 2, future: { nested: ['001', null] } })
  expect(JSON.parse(values.get(`${key}.backup.vunversioned`)!)).toEqual([raw])
  const before = [...values]
  await save({ mode: 'shuffled' })
  expect([...values]).toEqual(before)
})

test.each(['backup', 'primary'])('failed %s write never destroys migration source', async failure => {
  const raw = JSON.stringify({ version: 3, scores: [{ ...example, factors: undefined }] })
  const { storage, values } = memory(raw)
  const attempts: string[] = []
  const failing = { get length() { return storage.length }, key: storage.key, getItem: storage.getItem, setItem: (key: string, value: string) => {
    attempts.push(key)
    if (failure === 'backup' ? key.includes('.backup.') : key === SCORE_KEY) throw new DOMException('Full', 'QuotaExceededError')
    storage.setItem(key, value)
  } }
  expect(await saveScores([{ ...example, id: 'new' }], () => failing)).toMatch(/not saved/i)
  expect(storage.getItem(SCORE_KEY)).toBe(raw)
  expect(attempts[0]).toContain('.intent.')
  expect(attempts[1]).toContain('.backup.v3')
  if (failure === 'backup') expect(attempts).toHaveLength(2)
  else expect(JSON.parse(values.get(`${SCORE_KEY}.backup.v3`)!)).toEqual([raw])
})

test.each(['{broken', 'null', '[]', '{"version":9}', '{"mode":"future"}'])('invalid preferences remain unchanged after fallback and edits: %s', async raw => {
  for (const key of ['times-tables.settings', 'times-tables.progress']) {
    const { values } = memory(raw, key)
    if (key.endsWith('settings')) { expect(loadSettings().warning).toBeTruthy(); await saveSettings({ size: 2 }) }
    else { expect(loadProgressSelection({ mode: 'ordered', size: 2 }).warning).toBeTruthy(); await saveProgressSelection({ mode: 'ordered', size: 3 }) }
    expect(values.get(key)).toBe(raw)
  }
})

test.each([null, 17, { ...example, id: '' }, { ...example, factors: [1, '2'] }])('one unrecognized record protects the entire array: %j', async invalid => {
  const raw = JSON.stringify({ version: 4, scores: [example, invalid] })
  const { storage } = memory(raw)
  expect(loadScores(() => storage).warning).toBeTruthy()
  expect(await saveScores([{ ...example, id: 'new' }], () => storage)).toMatch(/not saved/i)
  expect(storage.getItem(SCORE_KEY)).toBe(raw)
})

test('v4 preserves exact raw factor ordering and nested unknown record/envelope data', async () => {
  const existing = { ...example, factors: [2, 1], metadata: { values: [null, '001', { x: false }] } }
  const { storage } = memory(JSON.stringify({ version: 4, scores: [existing], metadata: [null, { future: 3 }] }))
  expect(loadScores(() => storage).scores[0]).toEqual(existing)
  await saveScores([{ ...example, id: 'new' }], () => storage)
  expect(JSON.parse(storage.getItem(SCORE_KEY)!).scores[0]).toEqual(existing)
})

test('simultaneous appends are serialized and retrying a stable ID is idempotent', async () => {
  const { storage } = memory(null)
  const a = { ...example, id: 'one' }, b = { ...example, id: 'two' }
  expect(await Promise.all([saveScores([a], () => storage), saveScores([b], () => storage), saveScores([a], () => storage)])).toEqual([null, null, null])
  expect(loadScores(() => storage).scores).toEqual([a, b])
})

test('missing Web Locks refuses writes instead of pretending read/merge/write is atomic', async () => {
  const { storage } = memory(null)
  vi.stubGlobal('navigator', {})
  expect(await saveScores([example], () => storage)).toMatch(/not saved/i)
  expect(storage.getItem(SCORE_KEY)).toBeNull()
})

test('theme unsupported bytes remain untouched after a toggle', async () => {
  const raw = '{"version":99,"appearance":"sepia"}'
  const { values } = memory(raw, 'times-tables.theme')
  expect(loadTheme().warning).toBeTruthy()
  expect(await saveTheme('light')).toBeTruthy()
  expect(values.get('times-tables.theme')).toBe(raw)
})

test('append preserves envelope metadata and records added by a stale tab', async () => {
  const richer = { ...example, metadata: { answers: ['7', null], future: { x: 1 } } }
  const { storage } = memory(JSON.stringify({ version: 4, scores: [richer], future: { nested: [1, 'x'] } }))
  const stale = loadScores(() => storage).scores
  await saveScores([...stale, { ...example, id: 'tab-one' }], () => storage)
  await saveScores([...stale, { ...example, id: 'tab-two' }], () => storage)
  const data = JSON.parse(storage.getItem(SCORE_KEY)!)
  expect(data.future).toEqual({ nested: [1, 'x'] })
  expect(data.scores).toEqual([richer, { ...example, id: 'tab-one' }, { ...example, id: 'tab-two' }])
})

test.each([1, 2, 3])('migration v%i backs up exact original bytes before replacement, only once', async version => {
  const size = version === 1 ? 12 : 2
  const old = { ...example, size, factors: undefined, total: size ** 2, attempted: size ** 2, status: 'complete', correct: 0, extra: { rawAnswers: ['001', '', null] } }
  const raw = `  ${JSON.stringify({ version, scores: [old], extra: { source: 'fixture' } })}\n`
  const { storage, values } = memory(raw)
  expect(loadScores(() => storage).warning).toBeNull()
  expect(storage.getItem(SCORE_KEY)).toBe(raw)
  expect(await saveScores([{ ...example, id: 'new' }], () => storage)).toBeNull()
  expect(JSON.parse(storage.getItem(SCORE_KEY)!).scores).toHaveLength(2)
  expect([...values].some(([key, value]) => key.includes('.backup.') && JSON.parse(value).includes(raw))).toBe(true)
  const backups = [...values].filter(([key]) => key.includes('.backup.'))
  expect(await saveScores(loadScores(() => storage).scores, () => storage)).toBeNull()
  expect([...values].filter(([key]) => key.includes('.backup.'))).toEqual(backups)
})

test.each(['9007199254740993', '0.100000000000000001', '1e999', '-0'])('refuses numeric JSON coercion in unknown metadata rather than rewriting %s', async number => {
  const raw = JSON.stringify({ version: 4, scores: [example] }).slice(0, -1) + `,"unknown":${number}}`
  const { storage } = memory(raw)
  expect(await saveScores([{ ...example, id: 'new' }], () => storage)).toMatch(/not saved/i)
  expect(storage.getItem(SCORE_KEY)).toBe(raw)
})

test('duplicate JSON object members are unsupported, not silently collapsed', async () => {
  const raw = '{"version":4,"scores":[],"extra":{"field":1,"field":2}}'
  const { storage } = memory(raw)
  expect(await saveScores([example], () => storage)).toMatch(/not saved/i)
  expect(storage.getItem(SCORE_KEY)).toBe(raw)
})

test('conflicting stable IDs cannot silently replace an existing record', async () => {
  const raw = JSON.stringify({ version: 4, scores: [example] })
  const { storage } = memory(raw)
  expect(await saveScores([{ ...example, correct: 2 }], () => storage)).toMatch(/not saved/i)
  expect(storage.getItem(SCORE_KEY)).toBe(raw)
})

test.each(['times-tables.settings', 'times-tables.progress'])('future %s remains byte-identical after interaction', async key => {
  const raw = JSON.stringify({ version: 99, mode: 'ordered', size: 2, custom: { richer: [null, 'x'] } })
  const { values } = memory(raw, key)
  if (key.endsWith('settings')) { loadSettings(); await saveSettings({ mode: 'shuffled', size: 3 }) }
  else { loadProgressSelection({ mode: 'ordered', size: 2 }); await saveProgressSelection({ mode: 'shuffled', size: 3 }) }
  expect(values.get(key)).toBe(raw)
})
