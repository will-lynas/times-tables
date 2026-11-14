import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { chooseGridSize } from './helpers'

for (const appearance of ['dark', 'light']) {
  test(`minimal practice and unified Stats in ${appearance}`, async ({ page }) => {
    await page.addInitScript(appearance => {
      localStorage.setItem('times-tables.theme', appearance)
      localStorage.setItem('times-tables.settings', JSON.stringify({ mode: 'ordered', size: 2, scoreMode: 'all', scoreSize: 'all' }))
      localStorage.setItem('times-tables.scores', JSON.stringify({ version: 3, scores: [
        { id: 'perfect', mode: 'ordered', size: 2, status: 'complete', attempted: 4, correct: 4, total: 4, elapsedMs: 23000, completedAt: '2026-11-01T12:00:00Z' },
        { id: 'partial', mode: 'ordered', size: 2, status: 'partial', attempted: 2, correct: 2, total: 4, elapsedMs: 7000, completedAt: '2026-11-02T12:00:00Z' },
        { id: 'wrong', mode: 'ordered', size: 2, status: 'complete', attempted: 4, correct: 3, total: 4, elapsedMs: 19000, completedAt: '2026-11-03T12:00:00Z' },
      ] }))
    }, appearance)
    await page.goto('/')
    await expect(page.getByRole('region', { name: 'Score history', exact: true })).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'Score filters' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Progress', exact: true })).toHaveCount(0)
    const palette = await page.locator('.radix-themes').evaluate(element => ({ background: getComputedStyle(element).backgroundColor, font: getComputedStyle(element).fontFamily }))
    expect(palette.background).toBe(appearance === 'dark' ? 'rgb(50, 52, 55)' : 'rgb(225, 227, 224)')
    expect(palette.font).toContain('monospace')
    await mkdir('artifacts/stats', { recursive: true })
    await page.screenshot({ path: `artifacts/stats/practice-${appearance}.png`, fullPage: true })
    await page.getByRole('link', { name: 'Stats', exact: true }).click()
    await expect(page).toHaveURL(/\/stats$/)
    await expect(page.getByRole('region', { name: 'Progress', exact: true })).toBeVisible()
    const rows = page.getByRole('table', { name: 'Score history', exact: true }).getByRole('row')
    await expect(rows).toHaveCount(4)
    await expect(rows.nth(1)).toContainText('75%')
    await expect(rows.nth(2)).toContainText('Partial')
    await expect(rows.nth(3)).toContainText('100%')
    await expect(page.getByRole('link', { name: 'Stats', exact: true })).toHaveAttribute('aria-current', 'page')
    await page.screenshot({ path: `artifacts/stats/stats-${appearance}.png`, fullPage: true })
    await page.reload()
    await expect(rows).toHaveCount(4)
    await page.getByRole('link', { name: 'Practice', exact: true }).click()
    await page.goBack()
    await expect(rows).toHaveCount(4)
    await page.goForward()
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
    await page.goto('/progress')
    await expect(rows).toHaveCount(4)
    await expect(page.getByRole('link', { name: 'Stats', exact: true })).toHaveAttribute('aria-current', 'page')
  })
}

test('Stats preserves elapsed running time and never handles practice shortcuts', async ({ page }) => {
  await page.goto('/')
  await chooseGridSize(page, 2)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const inputs = page.getByRole('table', { name: 'Multiplication grid' }).getByRole('textbox')
  await inputs.first().fill('1')
  const before = await page.getByRole('timer').innerText()
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await page.locator('body').click({ position: { x: 8, y: 8 } })
  await page.keyboard.press('Enter')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.press('Space')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.goBack()
  await expect(inputs.first()).toHaveValue('1')
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
  expect(await page.getByRole('timer').innerText()).not.toBe(before)
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBeNull()
})
