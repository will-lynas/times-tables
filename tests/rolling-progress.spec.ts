import { expect, test, type Page } from '@playwright/test'
import type { Score } from '../src/scores'

const start = Date.UTC(2026, 0, 1)
const run = (day: number, seconds: number, changes: Partial<Score> = {}): Score => ({
  id: `run-${day}`, mode: 'ordered', size: 2, factors: [1, 2], status: 'complete', attempted: 4, total: 4, correct: 4,
  elapsedMs: seconds * 1000, completedAt: new Date(start + day * 86400000).toISOString(), ...changes,
})
const fixture = [run(0, 2, { status: 'partial', attempted: 2, correct: 2 }), run(1, 60), run(2, 60),
  run(3, 1, { correct: 3 }), run(5, 40), run(6, 80), run(9, 0), run(10, 5, { status: 'partial', attempted: 1, correct: 1 })]

async function seed(page: Page, scores: Score[], appearance: string) {
  await page.addInitScript(({ scores, appearance }) => {
    localStorage.setItem('times-tables.settings', JSON.stringify({ mode: 'ordered', size: 2, appearance }))
    localStorage.setItem('times-tables.scores', JSON.stringify({ version: 4, scores, unknownMetadata: { retained: true } }))
  }, { scores, appearance })
  await page.goto('/stats')
  if (appearance === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click()
  const graph = page.getByRole('region', { name: 'Progress', exact: true })
  await expect(graph.locator('.progress-perfect .recharts-scatter-symbol')).toHaveCount(scores.filter(s => s.status === 'complete' && s.correct === s.total).length)
  return graph
}

for (const appearance of ['dark', 'light']) {
  test(`raw dots, truthful average and step-after vertices, duration grid and hovers in ${appearance}`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (['warning', 'error'].includes(message.type())) errors.push(message.text()) })
    const graph = await seed(page, fixture, appearance)
    await expect(graph.locator('.progress-results')).toHaveCount(0)
    await expect(graph.locator('.progress-average-5 .recharts-line-curve')).toHaveCount(1)
    await expect(graph.locator('.progress-average-25 .recharts-line-curve')).toHaveCount(1)
    await expect(graph.locator('.progress-best .recharts-line-curve')).toHaveCount(1)
    const geometry = await graph.evaluate(element => {
      const svg = element.querySelector('svg.recharts-surface[role="application"]')!.getBoundingClientRect()
      const centers = (selector: string) => [...element.querySelectorAll(selector)].map(point => {
        const r = point.getBoundingClientRect(); return { x: r.x + r.width / 2 - svg.x, y: r.y + r.height / 2 - svg.y }
      })
      const series = (selector: string) => {
        const path = element.querySelector(`${selector} .recharts-line-curve`)!
        const style = getComputedStyle(path)
        return { vertices: [...path.getAttribute('d')!.matchAll(/[ML]([\d.e+-]+),([\d.e+-]+)/g)].map(m => ({ x: +m[1], y: +m[2] })),
          stroke: style.stroke, opacity: +style.strokeOpacity, width: parseFloat(style.strokeWidth), pointerEvents: style.pointerEvents }
      }
      const ticks = [...element.querySelectorAll('.recharts-yAxis-tick-labels text')].map(t => ({ text: t.textContent!, y: +t.getAttribute('y')!, color: getComputedStyle(t).fill }))
      return { perfect: centers('.progress-perfect .recharts-scatter-symbol'), other: centers('.progress-other .recharts-scatter-symbol'),
        ten: series('.progress-average-5'), hundred: series('.progress-average-25'), best: series('.progress-best'), ticks,
        grid: [...element.querySelectorAll('.recharts-cartesian-grid-horizontal line')].map(l => ({ y: +l.getAttribute('y1')!, y2: +l.getAttribute('y2')!, opacity: +getComputedStyle(l).strokeOpacity })),
        vertical: element.querySelectorAll('.recharts-cartesian-grid-vertical line').length,
        axes: element.querySelectorAll('.recharts-yAxis').length }
    })
    const { perfect, ten, hundred, best } = geometry
    const x = (day: number) => perfect[0].x + (perfect[4].x - perfect[0].x) * (day - 1) / 8
    const y = (seconds: number) => perfect[4].y + (perfect[3].y - perfect[4].y) * seconds / 80
    const expectedAverage = [60, 60, 160 / 3, 60, 48]
    for (const series of [ten, hundred]) {
      expect(series.vertices).toHaveLength(5)
      for (let i = 0; i < 5; i++) {
        expect(series.vertices[i].x).toBeCloseTo(perfect[i].x, 2)
        expect(series.vertices[i].y).toBeCloseTo(y(expectedAverage[i]), 2)
      }
      expect(series.pointerEvents).toBe('none')
    }
    const days = [1, 2, 3, 5, 6, 9, 10], bests = [60, 60, 60, 40, 40, 0, 0]
    const expectedStep = [{ x: x(1), y: y(60) }]
    for (let i = 1; i < days.length; i++) expectedStep.push({ x: x(days[i]), y: y(bests[i - 1]) }, { x: x(days[i]), y: y(bests[i]) })
    expect(best.vertices).toHaveLength(expectedStep.length)
    best.vertices.forEach((p, i) => { expect(p.x).toBeCloseTo(expectedStep[i].x, 2); expect(p.y).toBeCloseTo(expectedStep[i].y, 2) })
    expect(best.vertices[0].x).toBeGreaterThan(geometry.other[0].x)
    expect(best.stroke).not.toBe(ten.stroke)
    expect(best.opacity).toBeGreaterThanOrEqual(0.8)
    expect(best.width).toBeGreaterThanOrEqual(2)
    expect(ten.stroke).toBe(hundred.stroke)
    expect(ten.opacity).toBeLessThan(hundred.opacity)
    expect(geometry.axes).toBe(1)
    expect(geometry.vertical).toBe(0)
    expect(geometry.ticks.length).toBeGreaterThanOrEqual(3)
    expect(geometry.ticks.every(t => /[hms]/.test(t.text))).toBe(true)
    expect(geometry.ticks[0].color).not.toBe(ten.stroke)
    expect(geometry.grid.length).toBe(geometry.ticks.length)
    geometry.grid.forEach(line => { expect(line.y).toBe(line.y2); expect(line.opacity).toBeLessThanOrEqual(0.15); expect(geometry.ticks.some(t => Math.abs(t.y - line.y) < 1)).toBe(true) })
    await expect(graph.getByRole('img')).toHaveAccessibleDescription(/5 and 25 perfect complete rounds.*fewer.*warm-up.*best.*strictly faster/i)
    await expect(graph.getByRole('table', { name: 'Progress data' }).getByRole('columnheader')).toHaveText(['Date', 'Status', 'Attempted', 'Accuracy', 'Duration'])
    for (const [index, duration] of [[0, '1m'], [3, '1m 20s'], [4, '0s']] as const) {
      await graph.locator('.progress-perfect .recharts-scatter-symbol').nth(index).hover()
      await expect(graph.locator('.progress-tooltip-duration')).toHaveText(duration)
      await expect(graph.locator('.progress-tooltip dt')).toHaveText(['Accuracy', 'Answered', 'Average of 5', 'Average of 25', 'Best time'])
      await expect(graph.locator('.progress-tooltip time')).toHaveAttribute('datetime', fixture.filter(s => s.status === 'complete' && s.correct === s.total)[index].completedAt)
    }
    await graph.locator('.progress-other .recharts-scatter-symbol').first().hover()
    await expect(graph.locator('.progress-tooltip-status')).toHaveText('Partial')
    await expect(graph.locator('.progress-tooltip dt')).toHaveText(['Accuracy', 'Answered'])
    await graph.getByRole('heading').hover()
    await graph.screenshot({ path: info.outputPath(`${appearance}-1440.png`) })
    await page.setViewportSize({ width: 1024, height: 900 })
    await expect.poll(() => graph.locator('svg.recharts-surface[role="application"]').evaluate(svg => svg.getBoundingClientRect().width)).toBeLessThanOrEqual(928)
    await graph.screenshot({ path: info.outputPath(`${appearance}-1024.png`) })
    expect(errors).toEqual([])
    await info.attach('geometry', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' })
  })
}

for (const appearance of ['dark', 'light']) {
test(`101-run rendered averages match independent trailing windows, with real gap/duplicate timestamps in ${appearance}`, async ({ page }, info) => {
  const scores = Array.from({ length: 101 }, (_, i) => run(i < 50 ? i : i + 20, (i * 17) % 97 + 10))
  scores[50].completedAt = scores[49].completedAt
  const graph = await seed(page, scores, appearance)
  const geometry = await graph.evaluate(element => {
    const svg = element.querySelector('svg.recharts-surface[role="application"]')!.getBoundingClientRect()
    const points = [...element.querySelectorAll('.progress-perfect .recharts-scatter-symbol')].map(e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2 - svg.x, y: r.y + r.height / 2 - svg.y } })
    const vertices = (selector: string) => [...element.querySelector(selector)!.getAttribute('d')!.matchAll(/[ML]([\d.e+-]+),([\d.e+-]+)/g)].map(m => ({ x: +m[1], y: +m[2] }))
    return { points, ten: vertices('.progress-average-5 .recharts-line-curve'), hundred: vertices('.progress-average-25 .recharts-line-curve') }
  })
  const slope = (geometry.points[1].y - geometry.points[0].y) / ((scores[1].elapsedMs - scores[0].elapsedMs) / 1000)
  for (const [window, vertices] of [[5, geometry.ten], [25, geometry.hundred]] as const) {
    expect(vertices).toHaveLength(101)
    vertices.forEach((p, i) => {
      const values = scores.slice(Math.max(0, i + 1 - window), i + 1).map(s => s.elapsedMs / 1000)
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length
      expect(p.x).toBeCloseTo(geometry.points[i].x, 2)
      expect(p.y).toBeCloseTo(geometry.points[0].y + slope * (mean - scores[0].elapsedMs / 1000), 2)
    })
  }
  expect(geometry.points[49].x).toBe(geometry.points[50].x)
  await info.attach('101-run-geometry', { body: JSON.stringify(geometry), contentType: 'application/json' })
  await graph.locator('.progress-plot').screenshot({ path: info.outputPath('101-runs.png') })
})

test(`single zero record and averages remain visible without blocking its raw hover in ${appearance}`, async ({ page }) => {
  const graph = await seed(page, [run(0, 0)], appearance)
  for (const selector of ['.progress-average-5-dot', '.progress-average-25-dot', '.progress-best-dot']) {
    await expect(graph.locator(selector)).toHaveCount(1)
    await expect(graph.locator(selector)).toBeVisible()
  }
  await graph.locator('.progress-perfect .recharts-scatter-symbol').hover()
  await expect(graph.locator('.progress-tooltip-duration')).toHaveText('0s')
  await expect(graph.locator('.progress-tooltip dd')).toHaveText(['100%', '4 / 4', '0s', '0s', '0s'])
})
}

test('duplicate timestamp record drops vertically in saved order; ties do not create record markers', async ({ page }, info) => {
  const graph = await seed(page, [run(0, 60), run(0, 40, { id: 'duplicate-record' }), run(3, 40), run(9, 20)], 'dark')
  const vertices = await graph.locator('.progress-best .recharts-line-curve').evaluate(path =>
    [...path.getAttribute('d')!.matchAll(/[ML]([\d.e+-]+),([\d.e+-]+)/g)].map(m => ({ x: +m[1], y: +m[2] })))
  expect(vertices).toHaveLength(7)
  expect(vertices[0].x).toBe(vertices[1].x)
  expect(vertices[1].x).toBe(vertices[2].x)
  expect(vertices[2].y).toBeGreaterThan(vertices[1].y)
  expect(vertices[2].y).toBe(vertices[3].y)
  expect(vertices[3].y).toBe(vertices[4].y)
  expect(vertices[4].y).toBe(vertices[5].y)
  expect(vertices[5].x).toBe(vertices[6].x)
  expect(vertices[6].y).toBeGreaterThan(vertices[5].y)
  await expect(graph.locator('.progress-best-dot')).toHaveCount(3)
  await info.attach('duplicate-record-vertices', { body: JSON.stringify(vertices), contentType: 'application/json' })
})

test('partial and inaccurate points alone create no averages or best-time records', async ({ page }) => {
  const graph = await seed(page, [run(0, 0, { status: 'partial', attempted: 1, correct: 1 }), run(1, 10, { correct: 3 })], 'dark')
  await expect(graph.locator('.progress-other .recharts-scatter-symbol')).toHaveCount(2)
  await expect(graph.locator('.recharts-line-curve[d], .progress-best-dot')).toHaveCount(0)
  await expect(graph.getByRole('table', { name: 'Progress data' }).getByRole('row')).toHaveCount(3)
})
