import { expect, test, type Page } from '@playwright/test'
import { chooseGridSize, showPractice, showStats } from './helpers'

const summary = (page: Page) => page.getByRole('region', { name: 'Run statistics' })
async function values(page: Page, started: string, completed: string, perfect: string) {
  await expect(summary(page).locator('dd')).toHaveText([started, completed, perfect])
}
async function fillGrid(page: Page, correct: boolean) {
  for (const cell of await page.getByRole('textbox').all()) {
    const [a, b] = (await cell.getAttribute('aria-label'))!.split(' × ').map(Number)
    await cell.fill(String(correct ? a * b : 0))
  }
}

test('tracks actual starts before finish, cancel, Escape, reload, duplicate keys and full/partial results', async ({ page }) => {
  await page.goto('/')
  await chooseGridSize(page, 2)
  await showStats(page)
  await values(page, '0', '0', '—')
  await showPractice(page)
  await page.locator('body').click({ position: { x: 8, y: 8 } })
  await page.evaluate(() => { for (let i = 0; i < 3; i++) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
  await showStats(page)
  await values(page, '1', '0', '—')
  await showPractice(page)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.keyboard.press('Space')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.reload()
  await showStats(page)
  await values(page, '3', '0', '—')
  await showPractice(page)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const label = (await page.getByRole('textbox').first().getAttribute('aria-label'))!.split(' × ').map(Number)
  await page.getByRole('textbox').first().fill(String(label[0] * label[1]))
  await page.keyboard.press('Enter')
  await showStats(page)
  await values(page, '4', '0', '—')
  await showPractice(page)
  await page.getByRole('button', { name: 'New round' }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await fillGrid(page, true)
  await page.evaluate(() => { for (let i = 0; i < 3; i++) document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
  await showStats(page)
  await values(page, '5', '1', '100%')
  await showPractice(page)
  await page.getByRole('button', { name: 'New round' }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await fillGrid(page, false)
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await showStats(page)
  await values(page, '6', '2', '50%')
  await expect(summary(page).getByText('50%', { exact: true })).toHaveAccessibleDescription('1 of 2 completed runs fully correct.')
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores')!))
  expect(stored.scores).toHaveLength(3)
  const starts = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('times-tables.run-start.')))
  expect(starts).toHaveLength(6)
  expect(stored.scores.every((score: { id: string }) => starts.includes('times-tables.run-start.' + score.id))).toBe(true)
  await page.reload()
  await values(page, '6', '2', '50%')
})

const legacy = (id: string, factors: number[], mode = 'ordered') => ({ id, mode, size: factors.length, factors, status: 'complete', attempted: factors.length ** 2, correct: factors.length ** 2, total: factors.length ** 2, elapsedMs: 1000, completedAt: '2026-01-01T00:00:00Z' })

test('legacy starts are a lower bound, scores remain unchanged, exact factor sets filter starts and results', async ({ page }) => {
  await page.goto('/')
  const scores = [legacy('one', [2, 7]), legacy('two', [3, 8], 'shuffled')]
  await page.evaluate(scores => localStorage.setItem('times-tables.scores', JSON.stringify({ version: 4, scores })), scores)
  await page.reload()
  await showStats(page)
  await values(page, '≥2', '2', '100%')
  await expect(summary(page).locator('dd').first()).toHaveAccessibleDescription(/older cancelled or abandoned runs were not recorded/i)
  // Use the app's existing history controls, whether native or custom.
  const size = page.getByRole('combobox', { name: 'Score size', exact: true })
  if (await size.count()) await size.selectOption('set:2,7')
  else { await page.getByRole('button', { name: 'Score size', exact: true }).click(); await page.getByRole('option', { name: '{2, 7}', exact: true }).click() }
  await values(page, '≥1', '1', '100%')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores')!).scores)).toEqual(scores)
})

test('corrupt start storage is preserved and warns rather than rebaselining', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('times-tables.run-tracking', '{broken'))
  await page.reload()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await showStats(page)
  await values(page, '—', '0', '—')
  await expect(page.getByRole('alert')).toContainText('Run tracking could not be read')
  expect(await page.evaluate(() => localStorage.getItem('times-tables.run-tracking'))).toBe('{broken')
})

test('denied start writes warn without claiming an exact total', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) { if (key.startsWith('times-tables.run-')) throw new DOMException('denied', 'QuotaExceededError'); original.call(this, key, value) }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await showStats(page)
  await values(page, '—', '0', '—')
  await expect(page.getByRole('alert')).toContainText('Run start not saved')
})

test('cancelled starts retain their exact factors and order across filter changes and reload', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Grid size', exact: true })
  await trigger.click()
  const custom = page.getByRole('button', { name: 'Custom', exact: true })
  if (await custom.isVisible()) await custom.click()
  const panel = page.getByRole('dialog', { name: 'Grid size options', exact: true })
  const selected = await panel.getByRole('group', { name: 'Factors', exact: true }).getByRole('button', { pressed: true }).allTextContents()
  for (const label of selected) await panel.getByRole('button', { name: label, exact: true }).click()
  await panel.getByRole('button', { name: '2', exact: true }).click()
  await panel.getByRole('button', { name: '7', exact: true }).click()
  await panel.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('radio', { name: 'Ordered', exact: true }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.keyboard.press('Escape')
  await showStats(page)
  await values(page, '1', '0', '—')
  const size = page.getByRole('combobox', { name: 'Score size', exact: true })
  if (await size.count()) await size.selectOption('set:2,7')
  else { await page.getByRole('button', { name: 'Score size', exact: true }).click(); await page.getByRole('option', { name: '{2, 7}', exact: true }).click() }
  await values(page, '1', '0', '—')
  const order = page.getByRole('combobox', { name: 'Score order', exact: true })
  if (await order.count()) await order.selectOption('shuffled')
  else { await page.getByRole('button', { name: 'Score order', exact: true }).click(); await page.getByRole('option', { name: 'Shuffled', exact: true }).click() }
  await values(page, '0', '0', '—')
  await page.reload()
  await values(page, '0', '0', '—')
})

test('stale tabs retain independent starts and observe each other', async ({ page, context }) => {
  await page.goto('/')
  const other = await context.newPage()
  await other.goto('/')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await other.getByRole('button', { name: 'Start', exact: true }).click()
  await showStats(page)
  await showStats(other)
  await values(page, '2', '0', '—')
  await values(other, '2', '0', '—')
  await page.reload()
  await values(page, '2', '0', '—')
})
