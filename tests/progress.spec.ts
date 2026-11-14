import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { chooseFilter, chooseGridSize, showPractice, showStats } from './helpers'

const scores = [
  { id: 'last', elapsedMs: 80000, completedAt: '2026-01-10T12:00:00.000Z' },
  { id: 'partial', elapsedMs: 5000, completedAt: '2026-01-02T12:00:00.000Z', status: 'partial', attempted: 2, correct: 2 },
  { id: 'other-order', mode: 'shuffled', elapsedMs: 1000, completedAt: '2026-01-05T12:00:00.000Z' },
  { id: 'first', elapsedMs: 60000, completedAt: '2026-01-01T12:00:00.000Z' },
  { id: 'wrong', elapsedMs: 10000, completedAt: '2026-01-03T12:00:00.000Z', correct: 3 },
  { id: 'middle', elapsedMs: 40000, completedAt: '2026-01-04T12:00:00.000Z' },
  { id: 'other-size', size: 3, attempted: 9, total: 9, correct: 9, elapsedMs: 2000, completedAt: '2026-01-05T12:00:00.000Z' },
].map(score => ({ mode: 'ordered', size: 2, status: 'complete', attempted: 4, total: 4, correct: 4, ...score }))

async function seed(page: Page, records = scores) {
  await page.addInitScript(records => {
    if (localStorage.getItem('progress-test-seeded')) return
    localStorage.setItem('times-tables.settings', JSON.stringify({ mode: 'ordered', size: 2, scoreMode: 'all', scoreSize: 'all' }))
    localStorage.setItem('times-tables.scores', JSON.stringify({ version: 3, scores: records }))
    localStorage.setItem('progress-test-seeded', 'true')
  }, records)
  await page.goto('/progress')
  await page.getByRole('button', { name: 'Time', exact: true }).click()
}

for (const appearance of ['dark', 'light'] as const) {
  test(`structured duration-first point tooltips in ${appearance}`, async ({ page }, info) => {
    await seed(page)
    if (appearance === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click()
    const graph = page.getByRole('region', { name: 'Progress', exact: true })
    for (const [i, duration] of ['1m', '40s', '1m 20s'].entries()) {
      await graph.locator('.progress-perfect .recharts-scatter-symbol').nth(i).hover()
      await expect(graph.locator('.progress-tooltip-duration')).toHaveText(duration)
      await expect(graph.locator('.progress-tooltip-status')).toHaveText('Complete')
      await expect(graph.locator('.progress-tooltip dt')).toHaveText(['Accuracy', 'Answered', 'Average of 5', 'Average of 25', 'Best time'])
      await expect(graph.locator('.progress-tooltip dd')).toHaveText(['100%', '4 / 4', ['1m', '50s', '1m'][i], ['1m', '50s', '1m'][i], ['1m', '40s', '40s'][i]])
      const hierarchy = await graph.locator('.progress-tooltip').evaluate(element => ({
        durationSize: parseFloat(getComputedStyle(element.querySelector('.progress-tooltip-duration')!).fontSize),
        dateSize: parseFloat(getComputedStyle(element.querySelector('time')!).fontSize),
        width: element.getBoundingClientRect().width,
      }))
      expect(hierarchy.durationSize).toBeGreaterThan(hierarchy.dateSize)
      expect(hierarchy.width).toBeLessThan(320)
    }
    await graph.screenshot({ path: info.outputPath(`tooltip-${appearance}.png`) })
    for (const [i, values] of [['100%', '2 / 4'], ['75%', '4 / 4']].entries()) {
      await graph.locator('.progress-other .recharts-scatter-symbol').nth(i).hover()
      await expect(graph.locator('.progress-tooltip-status')).toHaveText(i === 0 ? 'Partial' : 'Complete')
      await expect(graph.locator('.progress-tooltip dt')).toHaveText(['Accuracy', 'Answered'])
      await expect(graph.locator('.progress-tooltip dd')).toHaveText(values)
    }
  })
}

test('plots exact settings, truthful time spacing and perfect-only averages with point tooltips', async ({ page }) => {
  await seed(page)
  const graph = page.getByRole('region', { name: 'Progress', exact: true })
  await expect(page.getByRole('radiogroup', { name: 'Stats order' })).toHaveAttribute('data-value', 'ordered')
  await expect(page.getByRole('combobox', { name: 'Stats size' })).toHaveAttribute('data-value', '2')
  await expect(page.getByRole('table', { name: 'Score history', exact: true })).toBeVisible()
  await expect(graph.locator('details, summary, .recharts-xAxis text, .recharts-cartesian-axis-line, .recharts-cartesian-axis-tick-line, .recharts-legend-wrapper')).toHaveCount(0)
  await expect(graph.getByText('Data table', { exact: true })).toHaveCount(0)
  await expect(graph.getByText('Average (10 perfect)', { exact: true })).toHaveCount(0)
  await expect(graph.locator('.progress-perfect .recharts-scatter-symbol')).toHaveCount(3)
  await expect(graph.locator('.progress-other .recharts-scatter-symbol')).toHaveCount(2)
  await expect(graph.locator('.recharts-line-curve')).toHaveCount(3)
  const line = await graph.locator('.progress-average-5 .recharts-line-curve').getAttribute('d')
  const lineCoordinates = [...line!.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(match => ({ x: Number(match[1]), y: Number(match[2]) }))
  expect(lineCoordinates).toHaveLength(3)
  expect(lineCoordinates[0].y).toBeCloseTo(lineCoordinates[2].y, 2)
  expect(lineCoordinates[1].y).toBeGreaterThan(lineCoordinates[0].y)
  const firstCenter = await graph.locator('.progress-perfect .recharts-scatter-symbol').first().boundingBox()
  expect(lineCoordinates[0].y).toBeCloseTo(firstCenter!.y + firstCenter!.height / 2 - (await graph.locator('svg.recharts-surface[role="application"]').boundingBox())!.y, 2)
  const centers = await graph.locator('.progress-perfect .recharts-scatter-symbol').evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect(); return box.x + box.width / 2
  }))
  expect((centers[1] - centers[0]) / (centers[2] - centers[0])).toBeCloseTo(1 / 3, 2)
  await graph.locator('.progress-other .recharts-scatter-symbol').first().hover()
  const tooltip = graph.locator('.recharts-tooltip-wrapper')
  await expect(tooltip).toContainText('Partial')
  await expect(tooltip.locator('dt')).toHaveText(['Accuracy', 'Answered'])
  await expect(tooltip.locator('dd')).toHaveText(['100%', '2 / 4'])
  await expect(tooltip.locator('time')).toHaveAttribute('datetime', '2026-01-02T12:00:00.000Z')
  await expect(tooltip).toContainText('Jan 2, 2026')
  await graph.locator('.progress-other .recharts-scatter-symbol').last().hover()
  await expect(tooltip).toContainText('Complete')
  await expect(tooltip.locator('dt')).toHaveText(['Accuracy', 'Answered'])
  await expect(tooltip.locator('dd')).toHaveText(['75%', '4 / 4'])
  const rows = page.getByRole('table', { name: 'Score history', exact: true }).getByRole('row')
  await expect(rows).toHaveCount(6)
  await expect(rows.nth(1)).toContainText('1:20.0')
  await expect(rows.nth(3)).toContainText('75%')
  await expect(rows.nth(4)).toContainText('Partial')
  await expect(rows.nth(5)).toContainText('1:00.0')
  await expect(page.getByRole('table', { name: 'Score history', exact: true }).getByRole('columnheader')).toHaveText(['Date', 'Status', 'Attempted', 'Correct', 'Accuracy', 'Time'])
  for (const row of await rows.all()) await expect(row.locator('th, td')).toHaveCount(6)
  await graph.locator('.progress-perfect .recharts-scatter-symbol').nth(1).hover()
  await expect(tooltip.locator('dd')).toHaveText(['100%', '4 / 4', '50s', '50s', '40s'])
  await graph.locator('.progress-perfect .recharts-scatter-symbol').last().hover()
  await expect(tooltip.locator('dd')).toHaveText(['100%', '4 / 4', '1m', '1m', '40s'])
  await expect(graph.locator('.progress-summary')).toHaveCount(0)
})

test('persists exact graph controls independently of round and history settings', async ({ page }) => {
  await seed(page)
  const graph = page.getByRole('region', { name: 'Progress', exact: true })
  const raw = await page.evaluate(() => localStorage.getItem('times-tables.scores'))
  await chooseFilter(page.getByRole('radiogroup', { name: 'Stats order' }), 'shuffled')
  await expect(graph.locator('.recharts-scatter-symbol')).toHaveCount(1)
  await chooseFilter(page.getByRole('combobox', { name: 'Stats size' }), '3')
  await expect(graph.getByText('No rounds for Shuffled · 3 × 3.', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Run statistics' }).locator('dd')).toHaveText(['0', '0', '—', '—'])
  await showPractice(page)
  await chooseGridSize(page, 4)
  await page.reload()
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await expect(page.getByRole('radiogroup', { name: 'Stats order' })).toHaveAttribute('data-value', 'shuffled')
  await expect(page.getByRole('combobox', { name: 'Stats size' })).toHaveAttribute('data-value', '3')
  await page.getByRole('link', { name: 'Practice', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Grid size', exact: true })).toHaveText('4 × 4')
  await showStats(page)
  await expect(page.getByRole('radiogroup', { name: 'Stats order', exact: true })).toHaveAttribute('data-value', 'shuffled')
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(raw)
})

for (const appearance of ['dark', 'light'] as const) {
  test(`readable ${appearance} chart, accessible table, settings and tooltip at desktop widths`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()) })
    await seed(page)
    if (appearance === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click()
    const graph = page.getByRole('region', { name: 'Progress', exact: true })
    await graph.scrollIntoViewIfNeeded()
    const perfect = graph.locator('.progress-perfect .recharts-symbols')
    const other = graph.locator('.progress-other .recharts-symbols')
    await expect(perfect).toHaveCount(3)
    const fills = await Promise.all([perfect.first(), other.first()].map(node => node.evaluate(element => ({
      color: getComputedStyle(element).fill, opacity: getComputedStyle(element).fillOpacity,
    }))))
    expect(Number(fills[0].opacity)).toBe(0.5)
    expect(Number(fills[1].opacity)).toBe(0.4)
    expect(fills[0].color).not.toBe(fills[1].color)
    await expect(graph.locator('.progress-summary, .recharts-label')).toHaveCount(0)
    await expect(graph.getByText('Ordered · 2 × 2', { exact: true })).toHaveCount(0)
    await mkdir('artifacts/progress', { recursive: true })
    await page.screenshot({ path: `artifacts/progress/${appearance}-page-1440.png`, fullPage: true })
    await graph.locator('.progress-perfect .recharts-scatter-symbol').last().hover()
    await expect(graph.locator('.progress-tooltip dd')).toHaveText(['100%', '4 / 4', '1m', '1m', '40s'])
    await graph.screenshot({ path: `artifacts/progress/${appearance}-tooltip.png` })
    await graph.getByRole('heading', { name: 'Progress', exact: true }).hover()
    await expect(graph.locator('details, summary, .recharts-xAxis text, .recharts-cartesian-axis-line, .recharts-cartesian-axis-tick-line, .recharts-legend-wrapper')).toHaveCount(0)
    await expect(page.getByRole('table', { name: 'Score history', exact: true })).toBeVisible()
    await graph.screenshot({ path: `artifacts/progress/${appearance}.png` })
    await page.setViewportSize({ width: 1024, height: 900 })
    const bounds = await graph.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1024)
    await expect.poll(() => graph.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await graph.screenshot({ path: `artifacts/progress/${appearance}-1024.png` })
    await page.screenshot({ path: `artifacts/progress/${appearance}-page-1024.png`, fullPage: true })
    expect(errors).toEqual([])
  })
}

test('single zero-duration point is visible; duplicate timestamps and large outliers retain all observations', async ({ page }) => {
  await seed(page, [ { ...scores[3], elapsedMs: 0 } ])
  const graph = page.getByRole('region', { name: 'Progress', exact: true })
  const symbol = graph.locator('.progress-perfect .recharts-scatter-symbol')
  await expect(symbol).toHaveCount(1)
  await expect(graph.locator('.progress-results .recharts-line-curve')).toHaveCount(0)

  await symbol.hover()
  await expect(graph.locator('.recharts-tooltip-wrapper')).toContainText('0s')
  const bounds = await symbol.boundingBox()
  expect(bounds!.width).toBeGreaterThan(4)
  await graph.screenshot({ path: 'artifacts/progress/single.png' })
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('times-tables.scores')!)
    raw.scores.push({ ...raw.scores[0], id: 'duplicate', elapsedMs: 100000000 })
    localStorage.setItem('times-tables.scores', JSON.stringify(raw))
  })
  await page.reload()
  await expect(symbol).toHaveCount(2)
  const positions = await symbol.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y } }))
  expect(positions[0].x).toBeCloseTo(positions[1].x)
  expect(positions[0].y).not.toBeCloseTo(positions[1].y)
  await expect(graph.locator('.progress-results')).toHaveCount(0)
  await symbol.last().hover()
  await expect(graph.locator('.progress-tooltip-duration')).toHaveText('27h 46m 40s')
  await expect(page.getByRole('table', { name: 'Score history', exact: true }).getByRole('row')).toHaveCount(3)
  await graph.screenshot({ path: 'artifacts/progress/duplicates-outlier.png' })
})

test('empty graph stays usable without storage and never shows synthetic data', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError') } }))
  await page.goto('/progress')
  await page.getByRole('button', { name: 'Time', exact: true }).click()
  const graph = page.getByRole('region', { name: 'Progress', exact: true })
  await expect(graph).toContainText('No rounds for Shuffled · 12 × 12.')
  await chooseFilter(page.getByRole('radiogroup', { name: 'Stats order' }), 'ordered')
  await expect(graph).toContainText('No rounds for Ordered · 12 × 12.')
  await expect(graph.locator('.recharts-scatter-symbol')).toHaveCount(0)
})
