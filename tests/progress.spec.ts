import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { chooseGridSize, showPractice, showStats } from './helpers'

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
}

for (const appearance of ['dark', 'light'] as const) {
  test(`faint chronological perfect-result line preserves geometry and point hovers in ${appearance}`, async ({ page }, info) => {
    await seed(page)
    if (appearance === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click()
    const graph = page.getByRole('region', { name: 'Progress', exact: true })
    const raw = graph.locator('.progress-results .recharts-line-curve')
    await expect(raw).toHaveCount(1)
    const geometry = await graph.evaluate(element => {
      const svg = element.querySelector('svg.recharts-surface[role="application"]')!.getBoundingClientRect()
      const path = element.querySelector('.progress-results .recharts-line-curve')!
      const average = element.querySelector('.progress-average .recharts-line-curve')!
      const style = getComputedStyle(path)
      return {
        vertices: [...path.getAttribute('d')!.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]) })),
        centers: [...element.querySelectorAll('.progress-perfect .recharts-scatter-symbol')].map(point => {
          const box = point.getBoundingClientRect()
          return { x: box.x + box.width / 2 - svg.x, y: box.y + box.height / 2 - svg.y }
        }),
        stroke: style.stroke, neutral: getComputedStyle(element.querySelector('.progress-other .recharts-symbols')!).fill,
        opacity: Number(style.strokeOpacity), width: parseFloat(style.strokeWidth), pointerEvents: style.pointerEvents,
        averageOpacity: Number(getComputedStyle(average).strokeOpacity), averageWidth: parseFloat(getComputedStyle(average).strokeWidth),
        series: [...element.querySelectorAll('.recharts-line, .recharts-scatter')].map(series => series.getAttribute('class')),
      }
    })
    expect(geometry.vertices).toHaveLength(3)
    for (let i = 0; i < geometry.centers.length; i++) {
      expect(geometry.vertices[i].x).toBeCloseTo(geometry.centers[i].x, 2)
      expect(geometry.vertices[i].y).toBeCloseTo(geometry.centers[i].y, 2)
    }
    expect(geometry.vertices.map(p => p.x)).toEqual([...geometry.vertices.map(p => p.x)].sort((a, b) => a - b))
    expect(geometry.stroke).toBe(geometry.neutral)
    expect(geometry.opacity).toBe(0.25)
    expect(geometry.width).toBe(1)
    expect(geometry.opacity).toBeLessThan(geometry.averageOpacity)
    expect(geometry.width).toBeLessThan(geometry.averageWidth)
    expect(geometry.pointerEvents).toBe('none')
    expect(geometry.series[0]).toContain('progress-results')
    expect(geometry.series[1]).toContain('progress-average')
    await expect(graph.locator('.recharts-line-dots .recharts-dot')).toHaveCount(0)
    await expect(graph.getByRole('img')).toHaveAccessibleDescription(/faint line connects perfect complete rounds chronologically/i)
    for (const [i, duration] of ['1m', '40s', '1m 20s'].entries()) {
      await graph.locator('.progress-perfect .recharts-scatter-symbol').nth(i).hover()
      await expect(graph.locator('.progress-tooltip-duration')).toHaveText(duration)
      await expect(graph.locator('.progress-tooltip-status')).toHaveText('Complete')
      await expect(graph.locator('.progress-tooltip dt')).toHaveText(['Accuracy', 'Answered', 'Average'])
      await expect(graph.locator('.progress-tooltip dd')).toHaveText(['100%', '4 / 4', ['1m', '50s', '1m'][i]])
      await expect(graph.locator('.progress-tooltip')).not.toContainText('/10')
      const hierarchy = await graph.locator('.progress-tooltip').evaluate(element => {
        const duration = getComputedStyle(element.querySelector('.progress-tooltip-duration')!)
        const date = getComputedStyle(element.querySelector('time')!)
        return { durationSize: parseFloat(duration.fontSize), dateSize: parseFloat(date.fontSize), width: element.getBoundingClientRect().width }
      })
      expect(hierarchy.durationSize).toBeGreaterThan(hierarchy.dateSize)
      expect(hierarchy.width).toBeLessThan(320)
    }
    await graph.screenshot({ path: info.outputPath(`tooltip-${appearance}.png`) })
    await graph.getByRole('heading', { name: 'Progress', exact: true }).hover()
    await graph.screenshot({ path: info.outputPath(`connected-${appearance}.png`) })
    for (const [i, values] of [['100%', '2 / 4'], ['75%', '4 / 4']].entries()) {
      await graph.locator('.progress-other .recharts-scatter-symbol').nth(i).hover()
      await expect(graph.locator('.progress-tooltip-status')).toHaveText(i === 0 ? 'Partial' : 'Complete')
      await expect(graph.locator('.progress-tooltip dt')).toHaveText(['Accuracy', 'Answered'])
      await expect(graph.locator('.progress-tooltip dd')).toHaveText(values)
      await graph.screenshot({ path: info.outputPath(`${i === 0 ? 'partial' : 'inaccurate'}-tooltip-${appearance}.png`) })
    }
    await info.attach('line-geometry', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' })
  })
}

test('plots exact settings, truthful time spacing and perfect-only averages with point tooltips', async ({ page }) => {
  await seed(page)
  const graph = page.getByRole('region', { name: 'Progress', exact: true })
  await expect(graph.getByRole('combobox', { name: 'Progress order' })).toHaveValue('ordered')
  await expect(graph.getByRole('combobox', { name: 'Progress size' })).toHaveValue('2')
  await expect(graph.getByRole('table', { name: 'Progress data' })).toBeVisible()
  await expect(graph.locator('details, summary, .recharts-cartesian-grid, .recharts-cartesian-axis, .recharts-legend-wrapper')).toHaveCount(0)
  await expect(graph.getByText('Data table', { exact: true })).toHaveCount(0)
  await expect(graph.getByText('Average (10 perfect)', { exact: true })).toHaveCount(0)
  await expect(graph.locator('.progress-perfect .recharts-scatter-symbol')).toHaveCount(3)
  await expect(graph.locator('.progress-other .recharts-scatter-symbol')).toHaveCount(2)
  await expect(graph.locator('.recharts-line-curve')).toHaveCount(2)
  const line = await graph.locator('.progress-average .recharts-line-curve').getAttribute('d')
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
  const rows = graph.getByRole('table', { name: 'Progress data' }).getByRole('row')
  await expect(rows).toHaveCount(6)
  await expect(rows.nth(1)).toContainText('1m')
  await expect(rows.nth(2)).toContainText('Partial')
  await expect(rows.nth(3)).toContainText('75%')
  await expect(rows.nth(5)).toContainText('1m 20s')
  await expect(graph.getByRole('table', { name: 'Progress data' }).getByRole('columnheader')).toHaveText(['Date', 'Status', 'Attempted', 'Accuracy', 'Duration'])
  for (const row of await rows.all()) await expect(row.locator('th, td')).toHaveCount(5)
  await graph.locator('.progress-perfect .recharts-scatter-symbol').nth(1).hover()
  await expect(tooltip.locator('dd')).toHaveText(['100%', '4 / 4', '50s'])
  await graph.locator('.progress-perfect .recharts-scatter-symbol').last().hover()
  await expect(tooltip.locator('dd')).toHaveText(['100%', '4 / 4', '1m'])
  await expect(graph.locator('.progress-summary')).toHaveCount(0)
})

test('persists exact graph controls independently of round and history settings', async ({ page }) => {
  await seed(page)
  const graph = page.getByRole('region', { name: 'Progress', exact: true })
  const raw = await page.evaluate(() => localStorage.getItem('times-tables.scores'))
  await graph.getByRole('combobox', { name: 'Progress order' }).selectOption('shuffled')
  await expect(graph.locator('.recharts-scatter-symbol')).toHaveCount(1)
  await graph.getByRole('combobox', { name: 'Progress size' }).selectOption('3')
  await expect(graph.getByText('No rounds for Shuffled · 3 × 3.', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Score order', exact: true }).selectOption('ordered')
  await showPractice(page)
  await chooseGridSize(page, 4)
  await page.reload()
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await expect(graph.getByRole('combobox', { name: 'Progress order' })).toHaveValue('shuffled')
  await expect(graph.getByRole('combobox', { name: 'Progress size' })).toHaveValue('3')
  await page.getByRole('link', { name: 'Practice', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Grid size', exact: true })).toHaveText('4 × 4')
  await showStats(page)
  await expect(page.getByRole('combobox', { name: 'Score order', exact: true })).toHaveValue('ordered')
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
    expect(Number(fills[0].opacity)).toBe(1)
    expect(Number(fills[1].opacity)).toBe(0.4)
    expect(fills[0].color).not.toBe(fills[1].color)
    await expect(graph.locator('.progress-summary, .recharts-label')).toHaveCount(0)
    await expect(graph.getByText('Ordered · 2 × 2', { exact: true })).toHaveCount(0)
    await mkdir('artifacts/progress', { recursive: true })
    await page.screenshot({ path: `artifacts/progress/${appearance}-page-1440.png`, fullPage: true })
    await graph.locator('.progress-perfect .recharts-scatter-symbol').last().hover()
    await expect(graph.locator('.progress-tooltip dd')).toHaveText(['100%', '4 / 4', '1m'])
    await graph.screenshot({ path: `artifacts/progress/${appearance}-tooltip.png` })
    await graph.getByRole('heading', { name: 'Progress', exact: true }).hover()
    await expect(graph.locator('details, summary, .recharts-cartesian-grid, .recharts-cartesian-axis, .recharts-legend-wrapper')).toHaveCount(0)
    await expect(graph.getByRole('table', { name: 'Progress data' })).toBeVisible()
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
  const raw = await graph.locator('.progress-results .recharts-line-curve').getAttribute('d')
  const vertices = [...raw!.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]) }))
  expect(vertices).toHaveLength(2)
  expect(vertices[0].x).toBe(vertices[1].x)
  expect(vertices[0].y).toBeGreaterThan(vertices[1].y)
  await expect(graph.getByRole('table', { name: 'Progress data' }).getByRole('row')).toHaveCount(3)
  await graph.screenshot({ path: 'artifacts/progress/duplicates-outlier.png' })
})

test('empty graph stays usable without storage and never shows synthetic data', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError') } }))
  await page.goto('/progress')
  const graph = page.getByRole('region', { name: 'Progress', exact: true })
  await expect(graph).toContainText('No rounds for Shuffled · 12 × 12.')
  await graph.getByRole('combobox', { name: 'Progress order' }).selectOption('ordered')
  await expect(graph).toContainText('No rounds for Ordered · 12 × 12.')
  await expect(graph.locator('.recharts-scatter-symbol')).toHaveCount(0)
})
