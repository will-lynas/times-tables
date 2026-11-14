import { expect, test, type Page, type Locator } from '@playwright/test'
import type { Score } from '../src/scores'
import { chooseFilter } from './helpers'

const start = Date.UTC(2026, 0, 1)
const run = (i: number, seconds: number, change: Partial<Score> = {}): Score => ({ id: `legend-${i}`, mode: 'ordered', size: 2, factors: [1, 2], status: 'complete', attempted: 4, total: 4, correct: 4, elapsedMs: seconds * 1000, completedAt: new Date(start + i * 86400000).toISOString(), ...change })
const fixture = [run(0, 2, { status: 'partial', attempted: 2, correct: 2 }), run(1, 60), run(2, 40), run(3, 1, { correct: 3 }), run(4, 0), run(5, 5, { status: 'partial', attempted: 1, correct: 1 })]
const series = [
  { name: 'Average of 5', flag: 'showAverage5', selector: '.progress-average-5', dot: '.progress-average-5-dot', row: 'Average of 5' },
  { name: 'Average of 25', flag: 'showAverage25', selector: '.progress-average-25', dot: '.progress-average-25-dot', row: 'Average of 25' },
  { name: 'Record', flag: 'showRecord', selector: '.progress-best', dot: '.progress-best-dot', row: 'Best time' },
]
async function seed(page: Page, appearance = 'dark', scores = fixture, progress?: string) {
  await page.addInitScript(({ appearance, scores, progress }) => {
    if (localStorage.getItem('legend-fixture')) return
    localStorage.setItem('legend-fixture', 'seeded')
    localStorage.setItem('times-tables.theme', appearance)
    localStorage.setItem('times-tables.settings', JSON.stringify({ version: 1, mode: 'ordered', size: 2, customFactors: [2, 3], marker: { keep: true } }))
    localStorage.setItem('times-tables.scores', JSON.stringify({ version: 4, scores, marker: { keep: true } }))
    if (progress) localStorage.setItem('times-tables.progress', progress)
  }, { appearance, scores, progress })
  await page.goto('/stats')
  const graph = page.getByRole('region', { name: 'Progress', exact: true })
  await expect(graph.getByRole('heading')).toBeVisible()
  return graph
}
for (const appearance of ['dark', 'light']) for (const axis of ['time', 'runs']) test(`every visibility combination preserves geometry, tooltip and readable key in ${appearance} / ${axis}`, async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()) })
  const graph = await seed(page, appearance, fixture, JSON.stringify({ version: 1, mode: 'ordered', size: 2, axisMode: axis }))
  await expect(graph.locator('.recharts-scatter-symbol')).toHaveCount(fixture.length)
  const original = await rawGeometry(graph)
  const paths = await Promise.all(series.map(s => graph.locator(`${s.selector} .recharts-line-curve`).getAttribute('d')))
  const summary = await page.getByRole('region', { name: 'Run statistics', exact: true }).textContent()
  const history = await page.getByRole('table', { name: 'Score history', exact: true }).textContent()
  const source = await page.evaluate(() => localStorage.getItem('times-tables.scores'))
  const styles = await Promise.all(series.map(async s => ({
    swatch: await graph.getByRole('button', { name: s.name, exact: true }).locator('path').evaluate(p => { const c = getComputedStyle(p); return { stroke: c.stroke, opacity: c.strokeOpacity, width: c.strokeWidth } }),
    line: await graph.locator(`${s.selector} .recharts-line-curve`).evaluate(p => { const c = getComputedStyle(p); return { stroke: c.stroke, opacity: c.strokeOpacity, width: c.strokeWidth } }),
  })))
  styles.forEach(s => expect(s.swatch).toEqual(s.line))
  expect(styles[0].line.stroke).toBe(styles[1].line.stroke)
  expect(+styles[0].line.opacity).toBeLessThan(+styles[1].line.opacity)
  expect(styles[2].line.stroke).not.toBe(styles[0].line.stroke)
  for (const mask of [6, 5, 3, 0, 1, 2, 4, 7]) {
    for (const [i, s] of series.entries()) {
      const shown = Boolean(mask & (1 << i))
      const button = graph.getByRole('button', { name: s.name, exact: true })
      if (await button.getAttribute('aria-pressed') !== String(shown)) await button.click()
      await expect(button).toHaveAttribute('aria-pressed', String(shown))
      await expect(graph.locator(`${s.selector} .recharts-line-curve[d]`)).toHaveCount(shown ? 1 : 0)
      if (shown) expect(await graph.locator(`${s.selector} .recharts-line-curve`).getAttribute('d')).toBe(paths[i])
      else {
        await expect(graph.locator(s.dot)).toHaveCount(0)
        const off = await button.evaluate(e => ({ color: getComputedStyle(e).color, decoration: getComputedStyle(e.querySelector('span')!).textDecorationLine, border: getComputedStyle(e).borderTopStyle }))
        expect(off.decoration).toBe('line-through')
        expect(off.border).toBe('dashed')
      }
    }
    expect(await rawGeometry(graph)).toEqual(original)
    await graph.locator('.progress-perfect .recharts-scatter-symbol').last().hover()
    await expect(graph.locator('.progress-tooltip-duration')).toHaveText('0s')
    await expect(graph.locator('.progress-tooltip dt')).toHaveText([...(axis === 'runs' ? ['Run'] : []), 'Accuracy', 'Answered', ...series.filter((_, i) => mask & (1 << i)).map(s => s.row)])
    await expect(graph.locator('.progress-tooltip time')).toHaveAttribute('datetime', fixture[4].completedAt)
    if (mask === 0) await graph.locator('.progress-plot').screenshot({ path: info.outputPath(`${appearance}-${axis}-all-off.png`) })
  }
  const first = graph.getByRole('button', { name: 'Average of 5', exact: true })
  await first.focus()
  await page.keyboard.press('Space')
  await expect(first).toHaveAttribute('aria-pressed', 'false')
  expect(await first.evaluate(e => getComputedStyle(e).outlineStyle)).toBe('solid')
  await page.keyboard.press('Tab')
  const second = graph.getByRole('button', { name: 'Average of 25', exact: true })
  await expect(second).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(second).toHaveAttribute('aria-pressed', 'false')
  await graph.getByRole('heading').hover()
  await graph.screenshot({ path: info.outputPath(`${appearance}-${axis}-1440.png`) })
  await page.setViewportSize({ width: 1024, height: 900 })
  await expect.poll(() => graph.locator('svg.recharts-surface[role="application"]').evaluate(e => e.getBoundingClientRect().width)).toBeLessThanOrEqual(928)
  expect(await graph.getByRole('group', { name: 'Chart series' }).evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true)
  await graph.screenshot({ path: info.outputPath(`${appearance}-${axis}-1024.png`) })
  expect(await page.getByRole('region', { name: 'Run statistics', exact: true }).textContent()).toBe(summary)
  expect(await page.getByRole('table', { name: 'Score history', exact: true }).textContent()).toBe(history)
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(source)
  expect(errors).toEqual([])
  await info.attach('swatch-line-styles', { body: JSON.stringify(styles), contentType: 'application/json' })
})

for (const appearance of ['dark', 'light']) for (const [label, scores, duration] of [
  ['empty', [], ''], ['no-perfect', [run(0, 0, { status: 'partial', attempted: 1, correct: 1 }), run(1, 2, { correct: 3 })], ''],
  ['zero', [run(0, 0)], '0s'], ['extreme', [run(0, 100000)], '27h 46m 40s'],
] as const) test(`key handles ${label} including singleton dots and raw hovers in ${appearance}`, async ({ page }) => {
  const graph = await seed(page, appearance, [...scores])
  for (const axis of ['Runs', 'Time']) {
    await graph.getByRole('button', { name: axis, exact: true }).click()
    await expect(graph.locator('.recharts-scatter-symbol')).toHaveCount(scores.length)
    for (const s of series) {
      if (duration) await expect(graph.locator(s.dot)).toBeVisible()
      await graph.getByRole('button', { name: s.name, exact: true }).click()
      await expect(graph.locator(`${s.selector} .recharts-line-curve[d], ${s.dot}`)).toHaveCount(0)
    }
    if (duration) {
      await graph.locator('.recharts-scatter-symbol').hover()
      await expect(graph.locator('.progress-tooltip-duration')).toHaveText(duration)
    }
    for (const s of series) await graph.getByRole('button', { name: s.name, exact: true }).click()
    if (!duration) await expect(graph.locator('.recharts-line-curve[d], .progress-best-dot, .progress-average-5-dot, .progress-average-25-dot')).toHaveCount(0)
  }
})

for (const raw of ['{broken', '{"version":2,"mode":"ordered","size":2}', ...series.map(s => JSON.stringify({ version: 1, mode: 'ordered', size: 2, [s.flag]: 'future' }))]) test(`unreadable preferences stay byte-identical on legend changes: ${raw}`, async ({ page }) => {
  const graph = await seed(page, 'dark', fixture, raw)
  for (const s of series) await graph.getByRole('button', { name: s.name, exact: true }).click()
  await expect(page.getByRole('alert').last()).toContainText(/not saved/)
  expect(await page.evaluate(() => localStorage.getItem('times-tables.progress'))).toBe(raw)
  await page.reload()
  for (const s of series) await expect(graph.getByRole('button', { name: s.name, exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => localStorage.getItem('times-tables.progress'))).toBe(raw)
})

test('legend labels have no state glyphs or reserved slots when shown or hidden', async ({ page }, info) => {
  const graph = await seed(page)
  for (const appearance of ['dark', 'light']) for (const width of [1440, 1024]) {
    await page.evaluate(appearance => localStorage.setItem('times-tables.theme', appearance), appearance)
    await page.setViewportSize({ width, height: 1000 })
    await page.reload()
    for (const shown of [true, false]) {
      for (const s of series) {
        const button = graph.getByRole('button', { name: s.name, exact: true })
        if (await button.getAttribute('aria-pressed') !== String(shown)) await button.click()
        await expect(button).toHaveAttribute('aria-pressed', String(shown))
        await expect(button).toHaveText(s.name)
        await expect(button.locator('svg')).toHaveCount(1)
        await expect(button.locator('span')).toHaveCount(1)
        const layout = await button.evaluate(e => {
          const style = getComputedStyle(e)
          const swatch = e.querySelector('svg')!.getBoundingClientRect()
          const label = e.querySelector('span')!.getBoundingClientRect()
          return {
            width: e.getBoundingClientRect().width,
            content: swatch.width + label.width + parseFloat(style.columnGap) + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth),
            before: getComputedStyle(e, '::before').content,
            after: getComputedStyle(e, '::after').content,
          }
        })
        expect(Math.abs(layout.width - layout.content)).toBeLessThan(1)
        expect([layout.before, layout.after]).toEqual(['none', 'none'])
        await expect(graph.locator(`${s.selector} .recharts-line-curve[d]`)).toHaveCount(shown ? 1 : 0)
      }
      await graph.screenshot({ path: info.outputPath(`no-glyphs-${appearance}-${width}-${shown ? 'on' : 'off'}.png`) })
    }
    await page.reload()
    for (const s of series) {
      const button = graph.getByRole('button', { name: s.name, exact: true })
      await expect(button).toHaveAttribute('aria-pressed', 'false')
      await expect(button).toHaveText(s.name)
      await button.click()
    }
  }
})

async function rawGeometry(graph: Locator) {
  return graph.evaluate(e => [...e.querySelectorAll('.recharts-scatter-symbol')].map(p => ({ d: p.getAttribute('d'), transform: p.getAttribute('transform') })))
}

test('compact chart key independently toggles complete derived series without changing raw observations', async ({ page }) => {
  const graph = await seed(page)
  await expect(graph.locator('.recharts-scatter-symbol')).toHaveCount(fixture.length)
  const original = await rawGeometry(graph)
  const scores = await page.evaluate(() => localStorage.getItem('times-tables.scores'))
  for (const s of series) await expect(graph.getByRole('button', { name: s.name, exact: true })).toHaveAttribute('aria-pressed', 'true')
  for (const s of series) {
    await graph.getByRole('button', { name: s.name, exact: true }).click()
    await expect(graph.getByRole('button', { name: s.name, exact: true })).toHaveAttribute('aria-pressed', 'false')
    await expect(graph.locator(`${s.selector} .recharts-line-curve[d], ${s.dot}`)).toHaveCount(0)
    expect(await rawGeometry(graph)).toEqual(original)
  }
  await graph.locator('.progress-perfect .recharts-scatter-symbol').last().hover()
  await expect(graph.locator('.progress-tooltip-duration')).toHaveText('0s')
  await expect(graph.locator('.progress-tooltip dt')).toHaveText(['Run', 'Accuracy', 'Answered'])
  for (const s of series) await graph.getByRole('button', { name: s.name, exact: true }).click()
  for (const s of series) await expect(graph.locator(`${s.selector} .recharts-line-curve[d]`)).toHaveCount(1)
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(scores)
})

test('rapid independent patches remain visible before settlement and survive immediate held-lock reload', async ({ page, context }) => {
  const source = ' { "mode":"ordered", "size":2, "axisMode":"time", "showAverage10":false, "showAverage100":true, "future":{"kept":[1,2]} } '
  const graph = await seed(page, 'dark', fixture, source)
  const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  const holder = await context.newPage()
  await holder.goto('/')
  await holder.evaluate(async () => {
    let acquired!: () => void
    const ready = new Promise<void>(resolve => { acquired = resolve })
    void navigator.locks.request('times-tables.progress', () => new Promise<void>(resolve => { Object.assign(window, { releaseLegendLock: resolve }); acquired() }))
    await ready
  })
  await graph.getByRole('group', { name: 'Chart series' }).evaluate(e => e.querySelectorAll('button').forEach(b => b.click()))
  for (const s of series) await expect(graph.getByRole('button', { name: s.name, exact: true })).toHaveAttribute('aria-pressed', 'false')
  // Reload immediately: do not wait for the locked primary to be written.
  await page.reload({ waitUntil: 'commit' })
  await holder.evaluate(() => (window as unknown as { releaseLegendLock: () => void }).releaseLegendLock())
  for (const s of series) await expect(graph.getByRole('button', { name: s.name, exact: true })).toHaveAttribute('aria-pressed', 'false')
  const after = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  expect(after['times-tables.scores']).toBe(before['times-tables.scores'])
  expect(after['times-tables.settings']).toBe(before['times-tables.settings'])
  expect(JSON.parse(after['times-tables.progress'])).toEqual({ ...JSON.parse(source), version: 1, showAverage5: false, showAverage25: false, showRecord: false })
  expect(JSON.parse(after['times-tables.progress.backup.vunversioned'])).toEqual([source])
  const intents = Object.entries(after).filter(([key]) => key.startsWith('times-tables.progress.intent.'))
  expect(intents).toHaveLength(3)
  expect(intents.map(([, value]) => JSON.parse(value).payload.change)).toEqual(expect.arrayContaining(series.map(s => ({ [s.flag]: false }))))
  for (const [key, value] of intents) {
    expect(JSON.parse(after[key.replace('.intent.', '.receipt.')])).toBeTruthy()
    expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(value)
  }
  await page.getByRole('link', { name: 'Practice', exact: true }).click()
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await graph.getByRole('button', { name: 'Runs', exact: true }).click()
  const size = page.getByRole('combobox', { name: /^(Stats|Progress) size$/, exact: false })
  await chooseFilter(size, '3')
  for (const s of series) await expect(graph.getByRole('button', { name: s.name, exact: true })).toHaveAttribute('aria-pressed', 'false')
  await chooseFilter(size, '2')
  await page.reload()
  for (const s of series) await expect(graph.getByRole('button', { name: s.name, exact: true })).toHaveAttribute('aria-pressed', 'false')
  await holder.close()
})
