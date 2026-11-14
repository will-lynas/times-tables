import { expect, test } from '@playwright/test'
import { chooseFilter, chooseGridSize, showPractice, showStats } from './helpers'

test('shared custom selection journals before a held lock and reload, preserving unknown and legacy preferences', async ({ page, context }) => {
  await page.goto('/')
  const progress = ' {"version":1,"mode":"ordered","size":2,"factors":[2,7],"extension":{"keep":[null,"001"]}}\n'
  const settings = '{"version":1,"mode":"shuffled","size":3,"customFactors":[3,8],"scoreMode":"all","scoreSize":"all","scoreFactors":"set:5,9","extension":true}'
  await page.evaluate(({ progress, settings }) => {
    localStorage.setItem('times-tables.progress', progress)
    localStorage.setItem('times-tables.settings', settings)
  }, { progress, settings })
  await page.reload()
  await showStats(page)
  const picker = page.getByRole('combobox', { name: 'Stats size', exact: true })
  await expect(picker).toHaveAttribute('data-value', '3')
  await expect(page.getByRole('radio', { name: 'Shuffled', exact: true })).toBeChecked()
  const holder = await context.newPage()
  await holder.goto('/')
  await holder.evaluate(async () => {
    let ready!: () => void
    const acquired = new Promise<void>(resolve => { ready = resolve })
    void navigator.locks.request('times-tables.settings', () => new Promise<void>(resolve => {
      Object.assign(window, { releaseStatsLock: resolve }); ready()
    }))
    await acquired
  })
  await page.getByRole('radio', { name: 'Ordered', exact: true }).click()
  await chooseFilter(picker, 'set:3,8')
  const intents = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('times-tables.settings.intent.')).map(key => [key, localStorage.getItem(key)])))
  expect(Object.keys(intents)).toHaveLength(2)
  expect(await page.evaluate(() => localStorage.getItem('times-tables.settings'))).toBe(settings)
  await page.reload({ waitUntil: 'commit' })
  await holder.evaluate(() => (window as unknown as { releaseStatsLock: () => void }).releaseStatsLock())
  await expect(picker).toHaveAttribute('data-value', 'set:3,8')
  await expect(page.getByRole('radio', { name: 'Ordered', exact: true })).toBeChecked()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.settings')!))).toEqual({ ...JSON.parse(settings), mode: 'ordered', choice: 'custom', customFactors: [3, 8] })
  expect(await page.evaluate(() => localStorage.getItem('times-tables.progress'))).toBe(progress)
  expect(await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('times-tables.settings.intent.')).map(key => [key, localStorage.getItem(key)])))).toEqual(intents)
  await showPractice(page)
  await expect(page.getByRole('button', { name: 'Grid size', exact: true })).toHaveText('Custom')
  await holder.close()
})

test('Stats browsing keeps active answers, settings and timer while every shortcut stays scoped to practice', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await chooseGridSize(page, 2)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('1')
  await showStats(page)
  await expect(page.getByRole('combobox', { name: 'Stats size', exact: true })).toBeDisabled()
  await expect(page.getByRole('radio', { name: 'Ordered', exact: true })).toBeDisabled()
  await page.locator('body').click({ position: { x: 8, y: 8 } })
  for (const key of ['Enter', 'Space', 'Shift+Enter', 'Escape']) await page.keyboard.press(key)
  await page.clock.runFor(2000)
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBeNull()
  await showPractice(page)
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Grid size', exact: true })).toHaveText('2 × 2')
  await expect(page.getByRole('textbox').first()).toHaveValue('1')
  await expect(page.getByRole('timer')).not.toHaveText('0:00.0')
  await showStats(page)
  await expect(page.getByRole('combobox', { name: 'Stats size', exact: true })).toHaveAttribute('data-value', '2')
})
