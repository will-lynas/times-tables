import { expect, test, type Page } from '@playwright/test'
import { createGrid, scoreAnswers } from '../src/game'
import type { Score } from '../src/scores'

function run(id: string, times: number[], answers = ['36', '54', '0', '81']): Score {
  const result = scoreAnswers(createGrid('ordered', Math.random, [6, 9]), answers)
  return { id, factors: [6, 9], mode: 'ordered', size: 2, status: result.status, attempted: result.attempted, correct: result.correct, total: 4,
    elapsedMs: 9999999, completedAt: '2026-01-01T00:00:00Z', calculations: { ...result.calculations,
      timing: { version: 1, cells: times.map((ms, index) => ({ index, answerEntryMs: answers[index] === '' ? null : ms, focusedMs: ms + 50, edits: 1, visits: 1 })) } } }
}
async function seed(page: Page, theme = 'dark') {
  const a = run('a', [0, 2000, 7000, 0]), b = run('b', [1000, 4000, 0, 0]), c = run('c', [1000, 6000, 1000000, 0], ['36', '54', '54', '81']), d = run('d', [9000, 8000, 0, 0])
  const { timing: _, ...details } = a.calculations!
  const old = { ...a, id: 'stage1', calculations: details }
  const { calculations: __, ...aggregate } = old
  const different = { ...run('different', [9999999, 9999999, 0, 0]), mode: 'shuffled' }
  await page.addInitScript(({ theme, scores }) => {
    if (!localStorage.getItem('times-tables.scores')) localStorage.setItem('times-tables.scores', JSON.stringify({ version: 4, scores }))
    if (!localStorage.getItem('times-tables.settings')) localStorage.setItem('times-tables.settings', JSON.stringify({ version: 1, mode: 'ordered', size: 2, choice: 'custom', customFactors: [6, 9] }))
    localStorage.setItem('times-tables.theme', theme)
  }, { theme, scores: [a, b, c, d, old, { ...aggregate, id: 'legacy' }, different] })
  await page.goto('/stats/calculations')
}

test('Times ranks correct medians, plots all samples, keeps reversed pairs and exposes precise keyboard detail', async ({ page }) => {
  await seed(page)
  await expect(page.getByRole('heading', { name: 'Incorrect calculations' })).toBeVisible()
  const raw = await page.evaluate(() => localStorage.getItem('times-tables.scores'))
  await page.getByRole('radio', { name: 'Times', exact: true }).click()
  const table = page.getByRole('table', { name: 'Slow calculations', exact: true })
  await expect(table).toBeVisible()
  await expect(page.getByText('Timing coverage: 5 / 7 runs · 20 measured answers · 4 missing')).toBeVisible()
  const rows = table.locator(':scope > tbody > tr')
  await expect(rows).toHaveCount(4)
  await expect(rows.nth(0).getByRole('rowheader')).toHaveText('9 × 6')
  await expect(rows.nth(0).locator(':scope > td').nth(0)).toHaveText('1000 s')
  await expect(rows.nth(1).getByRole('rowheader')).toHaveText('6 × 9')
  await expect(rows.nth(1).locator(':scope > td').nth(0)).toHaveText('6 s')
  await expect(rows.nth(2).locator(':scope > td').nth(0)).toHaveText('1 s')
  await expect(rows.nth(3).locator(':scope > td').nth(0)).toHaveText('0 s')
  await expect(rows.nth(2).locator('.recharts-scatter-symbol')).toHaveCount(5)
  const disclosure = rows.nth(2).locator('summary[aria-label="Timing samples for 6 × 6"]')
  await disclosure.focus(); await page.keyboard.press('Enter')
  const samples = rows.nth(2).getByRole('table', { name: 'Timing samples for 6 × 6', exact: true })
  await expect(samples).toBeVisible()
  const scroll = rows.nth(2).getByRole('region', { name: 'Timing sample data for 6 × 6', exact: true })
  await scroll.focus()
  await expect(scroll).toBeFocused()
  await expect(samples.getByRole('row')).toHaveCount(6)
  expect(await samples.locator('tbody tr td:nth-child(2)').allTextContents()).toEqual(['0 ms', '1000 ms', '1000 ms', '9000 ms', '9999999 ms'])
  await expect(page.getByLabel('Answer-entry timing definition')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(raw)
  await page.getByRole('radio', { name: 'Errors', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Incorrect calculations' })).toBeVisible()
})

for (const theme of ['dark', 'light']) for (const width of [1024, 1440]) test(`timing distributions readable in ${theme} at ${width}`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()) })
  await page.setViewportSize({ width, height: 1000 })
  await seed(page, theme)
  await page.getByRole('radio', { name: 'Times', exact: true }).click()
  const table = page.getByRole('table', { name: 'Slow calculations', exact: true })
  await expect(table.locator('.recharts-scatter-symbol')).toHaveCount(20)
  await table.locator('summary[aria-label="Timing samples for 9 × 6"]').click()
  await expect(table.getByRole('table', { name: 'Timing samples for 9 × 6', exact: true })).toBeVisible()
  const contrast = await page.locator('.timing-counts, .detail-coverage, .timing-definition, .timing-samples, .timing-samples .calculation-correct, .timing-samples .calculation-wrong').evaluateAll(nodes => {
    function luminance(color: string) {
      const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => { const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4 })
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
    }
    const background = luminance(getComputedStyle(document.querySelector('.radix-themes')!).backgroundColor)
    return nodes.map(node => { const foreground = luminance(getComputedStyle(node).color); return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) })
  })
  expect(contrast.every(value => value >= 4.5)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `artifacts/timing/${theme}-${width}.png`, fullPage: true })
  expect(errors).toEqual([])
})

test('missing and no-correct observations remain honest without manufacturing zero medians', async ({ page }) => {
  const wrong = run('wrong', [0, 0, 0, 0], ['0', '', '', ''])
  const { timing: _, ...details } = wrong.calculations!
  await page.addInitScript(scores => localStorage.setItem('times-tables.scores', JSON.stringify({ version: 4, scores })), [wrong, { ...wrong, id: 'old', calculations: details }])
  await seed(page)
  await page.getByRole('radio', { name: 'Times', exact: true }).click()
  const row = page.getByRole('table', { name: 'Slow calculations', exact: true }).locator(':scope > tbody > tr').first()
  await expect(row.locator(':scope > td').nth(0)).toHaveText('—')
  await expect(row).toContainText('0 correct · 1 incorrect · 1 missing')
  await expect(row.locator('.recharts-scatter-symbol')).toHaveCount(1)
})

test('empty Times view has no inferred samples', async ({ page }) => {
  await page.goto('/stats/calculations')
  await page.getByRole('radio', { name: 'Times', exact: true }).click()
  await expect(page.getByText('No answer-entry timings yet.')).toBeVisible()
  await expect(page.getByText('Timing coverage: 0 / 0 runs · 0 measured answers · 0 missing')).toBeVisible()
})
