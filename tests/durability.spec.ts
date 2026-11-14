import { expect, test } from '@playwright/test'
import { chooseGridSize, chooseFilter, showStats } from './helpers'

test('graph selection survives reload before its delayed preference commit', async ({ page, context }) => {
  await page.goto('/')
  await chooseGridSize(page, 2)
  await showStats(page)
  const holder = await context.newPage()
  await holder.goto('/')
  await holder.evaluate(async () => {
    let acquired!: () => void
    const ready = new Promise<void>(resolve => { acquired = resolve })
    void navigator.locks.request('times-tables.progress', () => new Promise<void>(resolve => {
      Object.assign(window, { releaseStorageLock: resolve }); acquired()
    }))
    await ready
  })
  const order = page.getByRole('combobox', { name: 'Progress order', exact: true })
  await chooseFilter(order, 'ordered')
  await page.reload({ waitUntil: 'commit' })
  await holder.evaluate(() => (window as unknown as { releaseStorageLock: () => void }).releaseStorageLock())
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.progress') ?? '{}').mode)).toBe('ordered')
  await expect(order).toHaveAttribute('data-value', 'ordered')
  await holder.close()
})

for (const key of ['times-tables.theme', 'times-tables.scores']) test(`immediate reload recovers ${key} while its commit is blocked`, async ({ page, context }) => {
  await page.goto('/')
  await chooseGridSize(page, 2)
  if (key.endsWith('scores')) {
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await page.getByRole('textbox').first().fill('0')
  }
  const holder = await context.newPage()
  await holder.goto('/')
  await holder.evaluate(async key => {
    let acquired!: () => void
    const ready = new Promise<void>(resolve => { acquired = resolve })
    void navigator.locks.request(key, () => new Promise<void>(resolve => {
      Object.assign(window, { releaseStorageLock: resolve }); acquired()
    }))
    await ready
  }, key)
  if (key.endsWith('theme')) await page.getByRole('button', { name: 'Switch to light mode' }).click()
  else await page.getByRole('button', { name: 'Finish early' }).click()
  await page.reload({ waitUntil: 'commit' })
  await holder.evaluate(() => (window as unknown as { releaseStorageLock: () => void }).releaseStorageLock())
  if (key.endsWith('theme')) await expect(page.locator('.radix-themes')).toHaveClass(/light/)
  else await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores') ?? '{"scores":[]}').scores.length)).toBe(1)
  await holder.close()
})

for (const key of ['times-tables.settings', 'times-tables.run-tracking']) test(`immediate reload recovers ${key} while another tab holds its lock`, async ({ page, context }) => {
  await page.goto('/')
  const holder = await context.newPage()
  await holder.goto('/')
  await holder.evaluate(async key => {
    let acquired!: () => void
    const ready = new Promise<void>(resolve => { acquired = resolve })
    void navigator.locks.request(key, () => new Promise<void>(resolve => {
      Object.assign(window, { releaseStorageLock: resolve })
      acquired()
    }))
    await ready
  }, key)
  if (key.endsWith('settings')) await chooseGridSize(page, 2)
  else await page.getByRole('button', { name: 'Start', exact: true }).click()
  // Reload at the actual event boundary, not after polling primary storage.
  await page.reload({ waitUntil: 'commit' })
  await holder.evaluate(() => (window as unknown as { releaseStorageLock: () => void }).releaseStorageLock())
  if (key.endsWith('settings')) await expect(page.getByRole('textbox')).toHaveCount(4)
  else await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('times-tables.run-start.')).length)).toBe(1)
  await holder.close()
})
