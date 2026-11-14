import { expect, test } from '@playwright/test'
import { chooseFilter, chooseGridSize, showStats } from './helpers'

for (const key of ['times-tables.settings', 'times-tables.progress']) test(`unsupported future ${key} stays byte-identical after deliberate edits`, async ({ page }) => {
  await page.goto('/')
  const raw = ' {"version":99,"mode":"ordered","size":2,"extra":{"keep":[null,"001"]}}\n'
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw })
  await page.reload()
  if (key.endsWith('settings')) await chooseGridSize(page, 3)
  else { await showStats(page); await chooseFilter(page.getByRole('combobox', { name: 'Progress order', exact: true }), 'ordered') }
  await expect(page.getByRole('alert').filter({ hasText: /not saved|could not be read/ }).first()).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw)
})

test('interrupted migration replays its exact durable score after reload without losing original source', async ({ page }) => {
  await page.goto('/')
  const original = ' {"version":3,"scores":[{"id":"legacy","mode":"ordered","size":2,"status":"partial","attempted":1,"correct":0,"total":4,"elapsedMs":123.456,"completedAt":"2026-01-01T00:00:00Z","extra":{"answers":["001",null]}}],"extra":["retain",false]}\n'
  await page.evaluate(raw => localStorage.setItem('times-tables.scores', raw), original)
  await page.reload()
  await chooseGridSize(page, 2)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('0')
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'times-tables.scores') throw new DOMException('Full', 'QuotaExceededError')
      original.call(this, key, value)
    }
  })
  await page.getByRole('button', { name: 'Finish early' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Score not saved' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(original)
  const intents = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('times-tables.scores.intent.')).map(key => [key, localStorage.getItem(key)!])))
  expect(Object.keys(intents)).toHaveLength(1)
  const intended = JSON.parse(Object.values(intents)[0]).payload[0]
  await page.reload()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores')!).scores.length)).toBe(2)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores')!))
  expect(saved.scores[0]).toEqual({ ...JSON.parse(original).scores[0], factors: [1, 2] })
  expect(saved.scores[1]).toEqual(intended)
  expect(saved.extra).toEqual(['retain', false])
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores.backup.v3')!))).toEqual([original])
  expect(await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('times-tables.scores.intent.')).map(key => [key, localStorage.getItem(key)!])))).toEqual(intents)
  const raw = await page.evaluate(() => localStorage.getItem('times-tables.scores'))
  await page.reload()
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(raw)
})

test('closing the originating tab before lock acquisition does not lose the durable start', async ({ page, context }) => {
  await page.goto('/')
  const holder = await context.newPage()
  await holder.goto('/')
  await holder.evaluate(async () => {
    let acquired!: () => void
    const ready = new Promise<void>(resolve => { acquired = resolve })
    void navigator.locks.request('times-tables.run-tracking', () => new Promise<void>(resolve => {
      Object.assign(window, { releaseStorageLock: resolve }); acquired()
    }))
    await ready
  })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const intents = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('times-tables.run-tracking.intent.')).map(key => [key, localStorage.getItem(key)!])))
  expect(Object.keys(intents)).toHaveLength(1)
  const run = JSON.parse(Object.values(intents)[0]).payload.run
  await page.close()
  await holder.evaluate(() => (window as unknown as { releaseStorageLock: () => void }).releaseStorageLock())
  const restored = await context.newPage()
  await restored.goto('/')
  await expect(restored.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  const starts = await restored.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('times-tables.run-start.')).map(key => [key, JSON.parse(localStorage.getItem(key)!)])))
  expect(starts).toEqual({ ['times-tables.run-start.' + run.id]: { version: 1, mode: run.mode, factors: run.factors } })
  expect(await restored.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('times-tables.run-tracking.intent.')).map(key => [key, localStorage.getItem(key)!])))).toEqual(intents)
  await holder.close()
})
