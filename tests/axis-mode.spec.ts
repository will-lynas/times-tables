import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Score } from '../src/scores'
import { chooseFilter } from './helpers'

const start = Date.UTC(2026, 0, 1)
const run = (id: string, day: number, seconds: number, changes: Partial<Score> = {}): Score => ({ id, mode: 'ordered', size: 2, factors: [1, 2], status: 'complete', attempted: 4, total: 4, correct: 4, elapsedMs: seconds * 1000, completedAt: new Date(start + day * 86400000).toISOString(), ...changes })
const fixture = [run('partial', 0, 2, { status: 'partial', attempted: 2, correct: 2 }), run('first', 1, 60), run('duplicate', 1, 40), run('wrong', 3, 1, { correct: 3 }), run('record', 9, 0), run('last', 10, 5, { status: 'partial', attempted: 1, correct: 1 })]
async function seed(page: Page, appearance: string, scores = fixture, progress?: string) {
  await page.addInitScript(({ appearance, scores, progress }) => {
    if (localStorage.getItem('axis-fixture')) return
    localStorage.setItem('axis-fixture', 'seeded')
    localStorage.setItem('times-tables.theme', appearance)
    localStorage.setItem('times-tables.settings', JSON.stringify({ version: 1, mode: 'ordered', size: 2, customFactors: [2, 3], historyMode: 'all', marker: { keep: true } }))
    localStorage.setItem('times-tables.scores', JSON.stringify({ version: 4, scores, marker: { keep: true } }))
    if (progress) localStorage.setItem('times-tables.progress', progress)
  }, { appearance, scores, progress })
  await page.goto('/stats')
  const graph = page.getByRole('region', { name: 'Progress', exact: true })
  await expect(graph.getByRole('heading')).toBeVisible()
  return graph
}
async function geometry(graph: Locator) {
  return graph.evaluate(element => {
    const svg = element.querySelector('svg.recharts-surface[role="application"]')!.getBoundingClientRect()
    const points = (selector: string) => [...element.querySelectorAll(selector)].map(e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2 - svg.x, y: r.y + r.height / 2 - svg.y } })
    const vertices = (selector: string) => [...(element.querySelector(selector)?.getAttribute('d') ?? '').matchAll(/[ML]([\d.e+-]+),([\d.e+-]+)/g)].map(m => ({ x: +m[1], y: +m[2] }))
    return { perfect: points('.progress-perfect .recharts-scatter-symbol'), other: points('.progress-other .recharts-scatter-symbol'), ten: vertices('.progress-average-5 .recharts-line-curve'), hundred: vertices('.progress-average-25 .recharts-line-curve'), best: vertices('.progress-best .recharts-line-curve'), ticks: [...element.querySelectorAll('.recharts-xAxis-tick-labels text')].map(t => t.textContent) }
  })
}
for (const appearance of ['dark', 'light']) test(`Time / Runs shares raw, mean, record and hover projection in ${appearance}`, async ({ page }, info) => {
  const graph = await seed(page, appearance)
  await expect(graph.locator('.progress-perfect .recharts-scatter-symbol')).toHaveCount(3)
  const time = await geometry(graph)
  expect(time.perfect[0].x).toBe(time.perfect[1].x)
  const timeRaw = [time.other[0], time.perfect[0], time.perfect[1], time.other[1], time.perfect[2], time.other[2]]
  timeRaw.forEach((p, i) => expect(p.x).toBeCloseTo(timeRaw[0].x + (timeRaw[5].x - timeRaw[0].x) * [0, 1, 1, 3, 9, 10][i] / 10, 2))
  const runsButton = graph.getByRole('button', { name: 'Runs', exact: true })
  await expect(graph.getByRole('button', { name: 'Time', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await runsButton.click()
  await expect(runsButton).toHaveAttribute('aria-pressed', 'true')
  const runs = await geometry(graph)
  const raw = [runs.other[0], runs.perfect[0], runs.perfect[1], runs.other[1], runs.perfect[2], runs.other[2]]
  const gap = raw[1].x - raw[0].x
  raw.forEach((p, i) => expect(p.x).toBeCloseTo(raw[0].x + gap * i, 2))
  expect(gap).toBeGreaterThan(0)
  const y = (seconds: number) => runs.perfect[2].y + (runs.perfect[0].y - runs.perfect[2].y) * seconds / 60
  for (const vertices of [runs.ten, runs.hundred]) {
    expect(vertices).toHaveLength(3)
    vertices.forEach((p, i) => { expect(p.x).toBeCloseTo(raw[[1, 2, 4][i]].x, 2); expect(p.y).toBeCloseTo(y([60, 50, 100 / 3][i]), 2) })
  }
  const best = [60, 40, 40, 0, 0]
  const expected = [{ x: raw[1].x, y: y(60) }]
  for (let i = 1; i < 5; i++) expected.push({ x: raw[i + 1].x, y: y(best[i - 1]) }, { x: raw[i + 1].x, y: y(best[i]) })
  expect(runs.best).toHaveLength(expected.length)
  runs.best.forEach((p, i) => { expect(p.x).toBeCloseTo(expected[i].x, 2); expect(p.y).toBeCloseTo(expected[i].y, 2) })
  expect(runs.perfect.map(p => p.y)).toEqual(time.perfect.map(p => p.y))
  expect(runs.other.map(p => p.y)).toEqual(time.other.map(p => p.y))
  expect(runs.ticks.length).toBeGreaterThan(0)
  expect(runs.ticks.every(t => /^\d+$/.test(t!))).toBe(true)
  for (let i = 0; i < 3; i++) {
    await graph.locator('.progress-perfect .recharts-scatter-symbol').nth(i).hover()
    await expect(graph.locator('.progress-tooltip-duration')).toHaveText(['1m', '40s', '0s'][i])
    await expect(graph.locator('.progress-tooltip time')).toHaveAttribute('datetime', fixture[[1, 2, 4][i]].completedAt)
  }
  await graph.getByRole('heading').hover()
  await graph.screenshot({ path: info.outputPath(`${appearance}-1440.png`) })
  await page.setViewportSize({ width: 1024, height: 900 })
  await expect.poll(() => graph.locator('svg.recharts-surface[role="application"]').evaluate(svg => svg.getBoundingClientRect().width)).toBeLessThanOrEqual(928)
  await graph.screenshot({ path: info.outputPath(`${appearance}-1024.png`) })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect.poll(() => graph.locator('svg.recharts-surface[role="application"]').evaluate(svg => svg.getBoundingClientRect().width)).toBeGreaterThan(928)
  await graph.getByRole('button', { name: 'Time', exact: true }).click()
  expect(await geometry(graph)).toEqual(time)
  await info.attach('axis-geometry', { body: JSON.stringify({ time, runs }), contentType: 'application/json' })
})

test('axis intent survives reload while another tab holds the progress lock; sibling keys and score bytes survive', async ({ page, context }) => {
  const source = JSON.stringify({ version: 1, mode: 'ordered', size: 2, showAverage: false, future: { keep: [1, 2] } })
  const graph = await seed(page, 'dark', fixture, source)
  const before = await page.evaluate(() => ({ scores: localStorage.getItem('times-tables.scores'), settings: localStorage.getItem('times-tables.settings') }))
  const holder = await context.newPage()
  await holder.goto('/')
  await holder.evaluate(async () => {
    let acquired!: () => void
    const ready = new Promise<void>(resolve => { acquired = resolve })
    void navigator.locks.request('times-tables.progress', () => new Promise<void>(resolve => { Object.assign(window, { releaseAxisLock: resolve }); acquired() }))
    await ready
  })
  await graph.getByRole('button', { name: 'Runs', exact: true }).click()
  // No primary-write polling: the reload happens at the synchronous event boundary.
  await page.reload({ waitUntil: 'commit' })
  await holder.evaluate(() => (window as unknown as { releaseAxisLock: () => void }).releaseAxisLock())
  await expect(graph.getByRole('button', { name: 'Runs', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.progress')!).axisMode)).toBe('runs')
  expect(await page.evaluate(() => ({ scores: localStorage.getItem('times-tables.scores'), settings: localStorage.getItem('times-tables.settings') }))).toEqual(before)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.progress')!))).toEqual({ ...JSON.parse(source), axisMode: 'runs' })
  await page.getByRole('link', { name: 'Practice', exact: true }).click()
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await expect(graph.getByRole('button', { name: 'Runs', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await holder.close()
})

for (const appearance of ['dark', 'light']) {
  for (const [label, scores, duration] of [
    ['empty', [], ''], ['zero', [run('zero', 0, 0)], '0s'], ['extreme', [run('extreme', 0, 100000)], '27h 46m 40s'],
  ] as const) test(`Runs ${label} population remains honest and usable in ${appearance}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (['warning', 'error'].includes(m.type())) errors.push(m.text()) })
    const graph = await seed(page, appearance, [...scores])
    await graph.getByRole('button', { name: 'Runs', exact: true }).click()
    await expect(graph.locator('.recharts-scatter-symbol')).toHaveCount(scores.length)
    if (!scores.length) await expect(graph.locator('.progress-empty')).toBeVisible()
    else {
      const g = await geometry(graph)
      expect(g.ticks).toEqual(['1'])
      expect(g.perfect[0].x).toBeGreaterThan(0)
      expect(Number.isFinite(g.perfect[0].y)).toBe(true)
      await graph.locator('.progress-perfect .recharts-scatter-symbol').hover()
      await expect(graph.locator('.progress-tooltip-duration')).toHaveText(duration)
      await expect(graph.locator('.progress-tooltip dd').first()).toHaveText('1')
      for (const selector of ['.progress-average-5-dot', '.progress-average-25-dot', '.progress-best-dot']) await expect(graph.locator(selector)).toBeVisible()
    }
    await page.reload()
    await expect(graph.getByRole('button', { name: 'Runs', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(errors).toEqual([])
  })
}

test('Runs keeps exact-set and order filtering, and remains a keyboard-operable graph-only preference', async ({ page }) => {
  const scores = [...fixture, run('other-set', 2, 99, { factors: [2, 3] }), run('other-mode', 2, 98, { mode: 'shuffled' })]
  const graph = await seed(page, 'dark', scores)
  const source = await page.evaluate(() => ({ scores: localStorage.getItem('times-tables.scores'), settings: localStorage.getItem('times-tables.settings') }))
  const time = graph.getByRole('button', { name: 'Time', exact: true })
  const runs = graph.getByRole('button', { name: 'Runs', exact: true })
  await time.focus()
  await page.keyboard.press('Tab')
  await expect(runs).toBeFocused()
  await page.keyboard.press('Space')
  await expect(runs).toHaveAttribute('aria-pressed', 'true')
  expect(await runs.evaluate(e => ({ width: e.getBoundingClientRect().width, outline: getComputedStyle(e).outlineStyle }))).toMatchObject({ outline: 'solid' })
  await page.keyboard.press('Shift+Tab')
  await expect(time).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(time).toHaveAttribute('aria-pressed', 'true')
  await runs.click()
  await expect(graph.locator('.recharts-scatter-symbol')).toHaveCount(fixture.length)
  await chooseFilter(graph.getByRole('combobox', { name: 'Progress size', exact: true }), 'set:2,3')
  await expect(graph.locator('.recharts-scatter-symbol')).toHaveCount(1)
  expect((await geometry(graph)).ticks).toEqual(['1'])
  await chooseFilter(graph.getByRole('combobox', { name: 'Progress size', exact: true }), '2')
  await chooseFilter(graph.getByRole('combobox', { name: 'Progress order', exact: true }), 'shuffled')
  await expect(graph.locator('.recharts-scatter-symbol')).toHaveCount(1)
  await expect(runs).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(runs).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => ({ scores: localStorage.getItem('times-tables.scores'), settings: localStorage.getItem('times-tables.settings') }))).toEqual(source)
})

for (const raw of ['{broken', '{"version":2,"mode":"ordered","size":2,"axisMode":"runs"}', '{"version":1,"mode":"ordered","size":2,"axisMode":"future"}']) test(`unsupported preference remains byte-identical: ${raw}`, async ({ page }) => {
  const graph = await seed(page, 'dark', fixture, raw)
  await expect(graph.getByRole('button', { name: 'Time', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(graph.getByRole('alert')).toBeVisible()
  await graph.getByRole('button', { name: 'Runs', exact: true }).click()
  await expect(graph.getByRole('alert')).toContainText(/not saved/i)
  expect(await page.evaluate(() => localStorage.getItem('times-tables.progress'))).toBe(raw)
  await page.reload()
  await expect(graph.getByRole('button', { name: 'Time', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => localStorage.getItem('times-tables.progress'))).toBe(raw)
})

test('101 eligible runs interleaved with partials retain independent rolling-window values and observation-index vertices', async ({ page }, info) => {
  const scores: Score[] = []
  for (let i = 0; i < 101; i++) {
    scores.push(run(`perfect-${i}`, i < 50 ? i : i + 20, (i * 17) % 97 + 10))
    if (i % 10 === 0) scores.push(run(`partial-${i}`, i < 50 ? i : i + 20, 2, { status: 'partial', attempted: 1, correct: 1 }))
  }
  const graph = await seed(page, 'dark', scores)
  await graph.getByRole('button', { name: 'Runs', exact: true }).click()
  await expect(graph.locator('.progress-perfect .recharts-scatter-symbol')).toHaveCount(101)
  const g = await geometry(graph)
  const eligible = scores.map((s, i) => ({ s, i })).filter(({ s }) => s.status === 'complete')
  const gap = (g.perfect.at(-1)!.x - g.perfect[0].x) / (eligible.at(-1)!.i - eligible[0].i)
  const slope = (g.perfect[1].y - g.perfect[0].y) / ((eligible[1].s.elapsedMs - eligible[0].s.elapsedMs) / 1000)
  for (const [window, vertices] of [[5, g.ten], [25, g.hundred]] as const) {
    expect(vertices).toHaveLength(101)
    vertices.forEach((p, i) => {
      const values = eligible.slice(Math.max(0, i + 1 - window), i + 1).map(({ s }) => s.elapsedMs / 1000)
      const mean = values.reduce((sum, n) => sum + n, 0) / values.length
      expect(p.x).toBeCloseTo(g.perfect[0].x + gap * eligible[i].i, 2)
      expect(p.y).toBeCloseTo(g.perfect[0].y + slope * (mean - eligible[0].s.elapsedMs / 1000), 2)
    })
  }
  await info.attach('101-runs-axis-geometry', { body: JSON.stringify(g), contentType: 'application/json' })
})
