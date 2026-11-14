import { expect, test } from '@playwright/test'
import { chooseGridSize, chooseFilter, showStats } from './helpers'

const score = { id: 'fixture', mode: 'ordered', size: 2, factors: [7, 13], status: 'partial', attempted: 2, correct: 1, total: 4, elapsedMs: 123.45, completedAt: '2026-01-01T00:00:00Z', extra: { raw: ['001', null] } }

test('unknown theme bytes survive toggling while the page remains usable', async ({ page }) => {
  await page.goto('/')
  const raw = '{"version":99,"appearance":"sepia"}'
  await page.evaluate(raw => localStorage.setItem('times-tables.theme', raw), raw)
  await page.reload()
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('.radix-themes')).toHaveClass(/light/)
  expect(await page.evaluate(() => localStorage.getItem('times-tables.theme'))).toBe(raw)
})

for (const version of [1, 2, 3, 4]) test(`production round flow migrates v${version} losslessly with exact source backup`, async ({ page }) => {
  const legacy = version === 1 ? { ...score, size: 12, total: 144, attempted: 144, status: 'complete' } : version < 3 ? { ...score, attempted: 4, status: 'complete' } : score
  const entry = { ...legacy, factors: version < 4 ? undefined : score.factors }
  const raw = ` ${JSON.stringify({ version, scores: [entry], extra: { nested: [true, null] } })}\n`
  await page.goto('/')
  await page.evaluate(({ raw }) => localStorage.setItem('times-tables.scores', raw), { raw })
  await page.reload()
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(raw)
  await chooseGridSize(page, 2)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('0')
  await page.getByRole('button', { name: 'Finish early' }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores') ?? '{"scores":[]}').scores.length)).toBe(2)
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores')!))
  expect(data.extra).toEqual({ nested: [true, null] })
  expect(data.scores[0]).toMatchObject(JSON.parse(raw).scores[0])
  if (version < 4) expect(await page.evaluate(version => JSON.parse(localStorage.getItem(`times-tables.scores.backup.v${version}`)!), version)).toEqual([raw])
  await page.reload()
  await showStats(page)
  await expect(page.getByRole('table', { name: 'Score history', exact: true }).getByRole('row')).toHaveCount(2)
  await page.getByRole('radio', { name: 'Ordered', exact: true }).click()
  await chooseFilter(page.getByRole('combobox', { name: 'Stats size' }), version === 1 ? '12' : version < 4 ? '2' : 'set:7,13')
  await expect(page.locator('tr[data-score-id="fixture"]')).toHaveCount(1)
})

test('two stale tabs finishing together retain both rounds and independent preference changes', async ({ context, page }) => {
  await page.goto('/')
  await chooseGridSize(page, 2)
  const other = await context.newPage()
  await other.goto('/')
  await Promise.all([page, other].map(async tab => {
    await tab.getByRole('button', { name: 'Start', exact: true }).click()
    await tab.getByRole('textbox').first().fill('0')
  }))
  await Promise.all([page, other].map(tab => tab.getByRole('button', { name: 'Finish early' }).click()))
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores') ?? '{"scores":[]}').scores.length)).toBe(2)
  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores')!).scores.map((s: { id: string }) => s.id))
  expect(new Set(ids).size).toBe(2)
  await Promise.all([showStats(page), showStats(other)])
  await Promise.all([
    chooseFilter(page.getByRole('radiogroup', { name: 'Stats order', exact: true }), 'ordered'),
    chooseFilter(other.getByRole('combobox', { name: 'Stats size', exact: true }), '2'),
  ])
  await page.reload()
  await expect(page.getByRole('radiogroup', { name: 'Stats order', exact: true })).toHaveAttribute('data-value', 'ordered')
  await expect(page.getByRole('combobox', { name: 'Stats size', exact: true })).toHaveAttribute('data-value', '2')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.progress')!))).toMatchObject({ mode: 'ordered', factors: [1, 2] })
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores')!).scores.map((s: { id: string }) => s.id))).toEqual(ids)
  await other.close()
})

for (const raw of ['{broken', '{"version":99,"scores":[]}', JSON.stringify({ version: 4, scores: [score, null] })]) test(`unsupported score bytes stay unchanged through a real finish: ${raw.slice(0, 35)}`, async ({ page }) => {
  await page.goto('/')
  await page.evaluate(raw => localStorage.setItem('times-tables.scores', raw), raw)
  await page.reload()
  await chooseGridSize(page, 2)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('0')
  await page.getByRole('button', { name: 'Finish early' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Score not saved' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(raw)
})
