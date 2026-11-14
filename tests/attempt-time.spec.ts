import { expect, test, type Page } from '@playwright/test'

import { mkdir } from 'node:fs/promises'

const now = Date.parse('2026-11-13T12:00:00.000Z')
const week = 7 * 24 * 60 * 60 * 1000
const records = [
  { id: 'old', completedAt: new Date(now - week).toISOString() },
  { id: 'minutes', completedAt: new Date(now - 5 * 60000).toISOString(), status: 'partial', attempted: 2, correct: 2 },
  { id: 'seconds', completedAt: new Date(now - 1000).toISOString() },
  { id: 'hours', completedAt: new Date(now - 3 * 3600000).toISOString(), correct: 3 },
  { id: 'future', completedAt: new Date(now + 5 * 60000).toISOString() },
  { id: 'threshold', completedAt: new Date(now - week + 1000).toISOString() },
].map(score => ({ mode: 'ordered', size: 2, status: 'complete', attempted: 4, total: 4, correct: 4, elapsedMs: 10000, ...score }))

async function seed(page: Page) {
  await page.clock.install({ time: now })
  await page.clock.pauseAt(now)
  await page.addInitScript(records => {
    if (localStorage.getItem('attempt-time-seeded')) return
    localStorage.setItem('times-tables.settings', JSON.stringify({ mode: 'ordered', size: 2, scoreMode: 'all', scoreSize: 'all' }))
    localStorage.setItem('times-tables.scores', JSON.stringify({ version: 3, scores: records }))
    localStorage.setItem('attempt-time-seeded', 'true')
  }, records)
  await page.goto('/stats')
  // Allow React to mount while keeping timestamp assertions deterministic.
  await expect.poll(async () => {
    await page.clock.runFor(100)
    return page.getByRole('table', { name: 'Score history', exact: true }).locator('time').count()
  }).toBe(6)
  await page.clock.setSystemTime(now)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

function exact(page: Page, iso: string) {
  return page.evaluate(iso => new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
  }).format(new Date(iso)), iso)
}

test('attempt dates are relative for a week, then local; exact dates are accessible in the single history table', async ({ page }) => {
  await seed(page)
  const table = page.getByRole('table', { name: 'Score history', exact: true })
  await expect(table.getByRole('columnheader', { name: 'Date', exact: true })).toBeVisible()
  const times = table.locator('time')
  await expect(times).toHaveCount(6)
  expect(await times.evaluateAll(nodes => nodes.map(node => node.getAttribute('datetime')))).toEqual(
    [...records].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)).map(score => score.completedAt),
  )
  await expect(times.nth(0)).toHaveText('in 5 mins')
  await expect(times.nth(1)).toHaveText('1 sec ago')
  await expect(times.nth(2)).toHaveText('5 mins ago')
  await expect(times.nth(3)).toHaveText('3 hours ago')
  await expect(times.nth(4)).toHaveText('6 days ago')
  await expect(times.nth(5)).toHaveText(await exact(page, records[0].completedAt))
  for (const record of records) {
    const time = table.locator(`time[datetime="${record.completedAt}"]`)
    const label = await exact(page, record.completedAt)
    await expect(time).toHaveAttribute('title', label)
    await expect(time).toHaveAccessibleDescription(label)
  }
  await expect.poll(async () => {
    await page.clock.runFor(100)
    return page.getByRole('table', { name: 'Score history', exact: true }).count()
  }).toBe(1)
  const graphTimes = page.getByRole('table', { name: 'Score history', exact: true }).locator('time')
  await expect(graphTimes).toHaveCount(6)
  await expect(graphTimes.first()).toHaveText('in 5 mins')
  const raw = await page.evaluate(() => localStorage.getItem('times-tables.scores'))
  await page.clock.runFor(2000)
  await expect(graphTimes.nth(4)).toHaveText(await exact(page, records[5].completedAt))
  await page.getByRole('link', { name: 'Practice', exact: true }).click()
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await expect(times.nth(1)).toHaveText(/^[23] secs ago$/)
  await expect(times.nth(4)).toHaveText(await exact(page, records[5].completedAt))
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(raw)
})

for (const theme of ['dark', 'light']) {
  test(`dates fit the unified ${theme} history at the minimum desktop width`, async ({ page }) => {
    await seed(page)
    if (theme === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click()
    await page.setViewportSize({ width: 1024, height: 900 })
    const history = page.getByRole('region', { name: 'Score history', exact: true })
    await history.scrollIntoViewIfNeeded()
    await expect(history.locator('time')).toHaveCount(6)
    expect(await history.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    await mkdir('artifacts/attempt-time', { recursive: true })
    await history.screenshot({ path: `artifacts/attempt-time/${theme}-1024.png` })
  })
}
