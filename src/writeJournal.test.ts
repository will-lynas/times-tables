import { afterEach, expect, test, vi } from 'vitest'
import { durableWrite, recoverWrites, type JournalStorage } from './writeJournal'
import { preferenceWriter } from './storage'

const key = 'times-tables.settings'
const apply = preferenceWriter(key, data => !('mode' in data) || ['ordered', 'shuffled'].includes(data.mode as string))
const payload = (mode: string) => ({ change: { mode }, defaults: {} })
function memory() {
  const values = new Map<string, string>()
  const storage: JournalStorage = { get length() { return values.size }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) } }
  return { storage, values }
}
afterEach(() => vi.unstubAllGlobals())

for (const stage of ['intent', 'backup', 'primary', 'receipt']) test(`interrupted ${stage} keeps exact original bytes or a recoverable intent and resumes idempotently`, async () => {
  const { storage, values } = memory()
  const original = ' {"mode":"ordered","extra":{"values":["001",null]}}\n'
  storage.setItem(key, original)
  const failing: JournalStorage = { get length() { return storage.length }, key: storage.key, getItem: storage.getItem,
    setItem: (target, value) => {
      if ((stage === 'primary' && target === key) || target.includes(`.${stage === 'intent' ? 'intent' : stage === 'backup' ? 'backup' : 'receipt'}.`)) throw new DOMException('Full', 'QuotaExceededError')
      storage.setItem(target, value)
    } }
  expect(await durableWrite(key, payload('shuffled'), apply, () => failing)).toBeTruthy()
  if (stage !== 'receipt') expect(storage.getItem(key)).toBe(original)
  if (stage === 'intent') {
    expect([...values]).toEqual([[key, original]])
    return
  }
  const intents = [...values].filter(([target]) => target.includes('.intent.'))
  expect(intents).toHaveLength(1)
  expect(await recoverWrites(key, apply, () => storage)).toBeNull()
  expect(JSON.parse(storage.getItem(key)!)).toEqual({ version: 1, mode: 'shuffled', extra: { values: ['001', null] } })
  expect(JSON.parse(storage.getItem(key + '.backup.vunversioned')!)).toEqual([original])
  const after = [...values]
  expect(await recoverWrites(key, apply, () => storage)).toBeNull()
  expect([...values]).toEqual(after)
  expect([...values].filter(([target]) => target.includes('.intent.'))).toEqual(intents)
})

test('enqueue persists synchronously before delayed Web Lock acquisition; recovery survives the abandoned Promise', async () => {
  const { storage, values } = memory()
  vi.stubGlobal('navigator', { locks: { request: () => new Promise(() => {}) } })
  void durableWrite(key, payload('ordered'), apply, () => storage)
  expect(storage.getItem(key)).toBeNull()
  expect([...values.keys()].filter(key => key.includes('.intent.'))).toHaveLength(1)
  vi.stubGlobal('navigator', { locks: { request: async (_key: string, _options: unknown, callback: () => void) => callback() } })
  expect(await recoverWrites(key, apply, () => storage)).toBeNull()
  expect(JSON.parse(storage.getItem(key)!)).toEqual({ version: 1, mode: 'ordered' })
})

test('ordered pending preference patches preserve later deliberate changes through receipt failure', async () => {
  const { storage } = memory()
  let rejectReceipt = true
  const failing: JournalStorage = { get length() { return storage.length }, key: storage.key, getItem: storage.getItem,
    setItem: (target, value) => { if (rejectReceipt && target.includes('.receipt.')) throw new Error('Interrupted'); storage.setItem(target, value) } }
  expect(await durableWrite(key, payload('ordered'), apply, () => failing)).toBeTruthy()
  expect(await durableWrite(key, payload('shuffled'), apply, () => failing)).toBeTruthy()
  rejectReceipt = false
  expect(await recoverWrites(key, apply, () => failing)).toBeNull()
  expect(JSON.parse(storage.getItem(key)!)).toEqual({ version: 1, mode: 'shuffled' })
})

for (const malformed of ['{broken', '{"version":99,"payload":{}}', '{"version":1}', '{"version":1,"payload":{"change":{"mode":"future"},"defaults":{}}}']) test(`unsupported queued source is preserved: ${malformed}`, async () => {
  const { storage, values } = memory()
  storage.setItem(key, '{"version":1,"mode":"ordered"}')
  storage.setItem(key + '.intent.0000000000000001-00000000-0000-4000-8000-000000000000', malformed)
  const before = [...values]
  expect(await recoverWrites(key, apply, () => storage)).toBeTruthy()
  expect([...values]).toEqual(before)
})

test('future receipts refuse replay without changing intent or primary bytes', async () => {
  const { storage, values } = memory()
  const id = '0000000000000001-00000000-0000-4000-8000-000000000000'
  storage.setItem(key, '{"version":1,"mode":"ordered"}')
  storage.setItem(key + '.intent.' + id, JSON.stringify({ version: 1, payload: payload('shuffled') }))
  storage.setItem(key + '.receipt.' + id, '{"version":2,"future":true}')
  const before = [...values]
  expect(await recoverWrites(key, apply, () => storage)).toBeTruthy()
  expect([...values]).toEqual(before)
})
