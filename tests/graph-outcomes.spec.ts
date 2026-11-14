import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Score } from '../src/scores'

const origin = Date.UTC(2026, 0, 1)
const run = (i: number, seconds: number, changes: Partial<Score> = {}): Score => ({
  id: `outcome-${i}`, mode: 'ordered', size: 2, factors: [1, 2], status: 'complete',
  attempted: 4, total: 4, correct: 4, elapsedMs: seconds * 1000,
  completedAt: new Date(origin + [0, 1, 3, 4, 9, 12][i] * 86400000).toISOString(), ...changes,
})
const fixture = [run(0, 60), run(1, 20, { correct: 3 }),
  run(2, 30, { status: 'partial', attempted: 2, correct: 2 }),
  run(3, 10, { status: 'partial', attempted: 2, correct: 1 }), run(4, 40),
  run(5, 0, { status: 'partial', attempted: 1, correct: 0 })]

async function seed(page: Page, palette: string, scores: Score[]) {
  const bytes = JSON.stringify({ version: 4, scores, future: { retained: true } })
  await page.addInitScript(({ palette, bytes }) => {
    if (localStorage.getItem('outcomes-seeded')) return
    localStorage.setItem('outcomes-seeded', 'yes')
    localStorage.setItem('times-tables.theme', palette)
    localStorage.setItem('times-tables.settings', JSON.stringify({ version: 1, mode: 'ordered', size: 2 }))
    localStorage.setItem('times-tables.scores', bytes)
  }, { palette, bytes })
  await page.goto('/stats')
  await expect(page.getByRole('alert')).toHaveCount(0)
  const graph = page.getByRole('region', { name: 'Progress', exact: true })
  await expect(graph.locator('.recharts-scatter-symbol')).toHaveCount(scores.length)
  return { graph, bytes }
}

async function appearance(graph: Locator) {
  return graph.evaluate(element => {
    const probe = document.createElement('span'); element.append(probe)
    const token = (name: string) => { probe.style.color = `var(${name})`; return getComputedStyle(probe).color }
    const colors = { red: token('--red-11'), grey: token('--gray-11'), perfect: token('--accent-11'), bg: token('--color-background') }
    probe.remove()
    const rgb = (s: string) => s.match(/[\d.]+/g)!.slice(0, 3).map(Number)
    const luminance = (channels: number[]) => channels.map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0)
    const bg = luminance(rgb(colors.bg))
    const points = [...element.querySelectorAll('.recharts-scatter-symbol')].map(symbol => {
      const path = symbol.querySelector('path')!, style = getComputedStyle(path), rect = symbol.getBoundingClientRect()
      let opacity = +style.fillOpacity
      for (let parent: Element | null = path; parent && parent !== element; parent = parent.parentElement) opacity *= +getComputedStyle(parent).opacity
      const blended = rgb(style.fill).map((n, i) => n * opacity + rgb(colors.bg)[i] * (1 - opacity))
      const fg = luminance(blended)
      return { fill: style.fill, opacity, contrast: (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05), className: path.getAttribute('class'), label: path.getAttribute('aria-label'), x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    })
    const vertices = (selector: string) => [...(element.querySelector(selector)?.getAttribute('d') ?? '').matchAll(/[ML]([\d.e+-]+),([\d.e+-]+)/g)].map(m => ({ x: +m[1], y: +m[2] }))
    return { colors, points, averages: [vertices('.progress-average-5 .recharts-line-curve'), vertices('.progress-average-25 .recharts-line-curve')], record: vertices('.progress-best .recharts-line-curve'), connectors: element.querySelectorAll('.recharts-scatter-line').length }
  })
}

for (const palette of ['dark', 'light']) for (const width of [1024, 1440]) {
  test(`run outcome fills preserve all observations and derived geometry in ${palette} at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 })
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (['warning', 'error'].includes(m.type())) errors.push(m.text()) })
    const { graph, bytes } = await seed(page, palette, fixture)
    const evidence: unknown[] = []
    for (const axis of ['Runs', 'Time']) {
      await graph.getByRole('button', { name: axis, exact: true }).click()
      const rendered = await appearance(graph)
      const other = rendered.points.slice(0, 4), perfect = rendered.points.slice(4)
      // Non-perfect points retain chronological identity/order in the existing Scatter.
      for (const [i, point] of other.entries()) {
        expect(point.fill).toBe(i === 0 ? rendered.colors.red : rendered.colors.grey)
        expect(point.opacity).toBe(1)
        expect(point.contrast).toBeGreaterThanOrEqual(3)
        expect(point.className).toContain(i === 0 ? 'progress-inaccurate' : 'progress-partial')
        expect(point.label).toBe(i === 0 ? 'Complete inaccurate run' : 'Partial run')
      }
      perfect.forEach(point => { expect(point.fill).toBe(rendered.colors.perfect); expect(point.opacity).toBe(.5) })
      expect(rendered.connectors).toBe(0)
      const raw = [perfect[0], other[0], other[1], other[2], perfect[1], other[3]]
      const svg = await graph.locator('svg.recharts-surface[role="application"]').boundingBox()
      const y = (seconds: number) => raw[5].y + (raw[0].y - raw[5].y) * seconds / 60 - svg!.y
      const x = (i: number) => raw[i].x - svg!.x
      const spacing = axis === 'Runs' ? [0, 1, 2, 3, 4, 5] : [0, 1, 3, 4, 9, 12]
      raw.forEach((p, i) => expect(p.x).toBeCloseTo(raw[0].x + (raw[5].x - raw[0].x) * spacing[i] / spacing[5], 2))
      rendered.averages.forEach(vertices => {
        expect(vertices).toHaveLength(2)
        vertices.forEach((p, i) => { expect(p.x).toBeCloseTo(x([0, 4][i]), 2); expect(p.y).toBeCloseTo(y([60, 50][i]), 2) })
      })
      const bests = [60, 60, 60, 60, 40, 40], expected = [{ x: x(0), y: y(60) }]
      for (let i = 1; i < 6; i++) expected.push({ x: x(i), y: y(bests[i - 1]) }, { x: x(i), y: y(bests[i]) })
      expect(rendered.record).toHaveLength(expected.length)
      rendered.record.forEach((p, i) => { expect(p.x).toBeCloseTo(expected[i].x, 2); expect(p.y).toBeCloseTo(expected[i].y, 2) })
      const indices = [1, 2, 3, 5, 0, 4]
      for (let i = 0; i < 6; i++) {
        const score = fixture[indices[i]]
        await graph.locator('.recharts-scatter-symbol').nth(i).hover()
        await expect(graph.locator('.progress-tooltip-status')).toHaveText(score.status === 'complete' ? 'Complete' : 'Partial')
        await expect(graph.locator('.progress-tooltip time')).toHaveAttribute('datetime', score.completedAt)
        const labels = ['Accuracy', 'Answered', ...(i >= 4 ? ['Average of 5', 'Average of 25', 'Best time'] : [])]
        await expect(graph.locator('.progress-tooltip dt')).toHaveText(axis === 'Runs' ? ['Run', ...labels] : labels)
        const values = await graph.locator('.progress-tooltip dd').allTextContents()
        expect(values.slice(axis === 'Runs' ? 1 : 0, axis === 'Runs' ? 3 : 2)).toEqual([`${score.correct / score.attempted * 100}%`, `${score.attempted} / ${score.total}`])
        if (axis === 'Runs') expect(values[0]).toBe(String(indices[i] + 1))
      }
      await graph.getByRole('heading').hover()
      await graph.screenshot({ path: info.outputPath(`${palette}-${width}-${axis}.png`) })
      evidence.push({ axis, ...rendered })
      expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(bytes)
    }
    await page.reload()
    await expect(graph.locator('.recharts-scatter-symbol')).toHaveCount(6)
    expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(bytes)
    expect(errors).toEqual([])
    await info.attach('rendered-outcomes', { body: JSON.stringify(evidence), contentType: 'application/json' })
  })
}

for (const palette of ['dark', 'light']) {
  for (const [name, scores] of [
    ['empty', []], ['perfect zero', [run(0, 0)]], ['inaccurate zero', [run(0, 0, { correct: 3 })]],
    ['partial correct zero', [run(0, 0, { status: 'partial', attempted: 1, correct: 1 })]],
    ['partial wrong zero', [run(0, 0, { status: 'partial', attempted: 1, correct: 0 })]],
  ] as const) test(`${name} retains its honest outcome in ${palette}`, async ({ page }) => {
    const { graph, bytes } = await seed(page, palette, [...scores])
    for (const axis of ['Runs', 'Time']) {
      await graph.getByRole('button', { name: axis, exact: true }).click()
      if (!scores.length) await expect(graph.locator('.progress-empty')).toBeVisible()
      else {
        const g = await appearance(graph), point = g.points[0]
        const perfect = name.startsWith('perfect'), wrong = name.startsWith('inaccurate')
        expect(point.fill).toBe(perfect ? g.colors.perfect : wrong ? g.colors.red : g.colors.grey)
        expect(point.opacity).toBe(perfect ? .5 : 1)
        expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
        await graph.locator('.recharts-scatter-symbol').hover()
        await expect(graph.locator('.progress-tooltip-duration')).toHaveText('0s')
        if (!perfect) await expect(graph.locator('.recharts-line-curve[d], .progress-best-dot')).toHaveCount(0)
      }
      expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(bytes)
    }
  })
}
