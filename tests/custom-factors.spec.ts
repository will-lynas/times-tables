import { expect, test, type Page } from '@playwright/test'
import { chooseFilter, chooseGridSize, showStats } from './helpers'

const example = [7, 8, 9, 11, 13]
test('history, PB and graph distinguish same-cardinality factor sets, including partial and inaccurate points', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('custom-seeded')) return
    const factors = [7, 8, 9, 11, 13]
    const common = { mode: 'ordered', size: 5, factors, status: 'complete', attempted: 25, correct: 25, total: 25 }
    localStorage.setItem('times-tables.settings', JSON.stringify({ mode: 'ordered', size: 5, choice: 'custom', customFactors: factors, scoreMode: 'all', scoreSize: 'all' }))
    localStorage.setItem('times-tables.scores', JSON.stringify({ version: 4, scores: [
      { ...common, id: 'a', elapsedMs: 4000, completedAt: '2026-01-01T00:00:00Z' },
      { ...common, id: 'b', factors: [1, 3, 5, 7, 9], elapsedMs: 1000, completedAt: '2026-01-02T00:00:00Z' },
      { ...common, id: 'partial', status: 'partial', attempted: 1, correct: 1, elapsedMs: 500, completedAt: '2026-01-03T00:00:00Z' },
      { ...common, id: 'wrong', correct: 24, elapsedMs: 2000, completedAt: '2026-01-04T00:00:00Z' },
      { ...common, id: 'a2', elapsedMs: 6000, completedAt: '2026-01-05T00:00:00Z' },
    ] }))
    localStorage.setItem('custom-seeded', 'true')
  })
  await page.goto('/')
  await showStats(page)
  await expect(page.locator('.score-heading')).toHaveText('Score history')
  const history = page.getByRole('table', { name: 'Score history', exact: true })
  await expect(history.getByRole('row')).toHaveCount(6)
  await expect(history).toContainText('{1, 3, 5, 7, 9}')
  const filter = page.getByRole('combobox', { name: 'Score size', exact: true })
  await chooseFilter(filter, { label: '{7, 8, 9, 11, 13}' })
  await expect(history.getByRole('row')).toHaveCount(5)
  await expect(history).not.toContainText('{1, 3, 5, 7, 9}')
  await chooseFilter(filter, { label: '{1, 3, 5, 7, 9}' })
  await expect(history.getByRole('row')).toHaveCount(2)
  await expect(page.locator('.score-heading')).toHaveText('Score history')
  const graph = page.getByRole('region', { name: 'Progress', exact: true })
  await expect(graph.locator('.progress-perfect .recharts-scatter-symbol')).toHaveCount(2)
  await expect(graph.locator('.progress-other .recharts-scatter-symbol')).toHaveCount(2)
  const data = graph.getByRole('table', { name: 'Progress data' })
  await graph.locator('.progress-perfect .recharts-scatter-symbol').last().hover()
  await expect(graph.locator('.progress-tooltip dd')).toHaveText(['100%', '25 / 25', '5s'])
  const rawLine = await graph.locator('.progress-results .recharts-line-curve').getAttribute('d')
  expect([...rawLine!.matchAll(/[ML]/g)]).toHaveLength(4)
  await expect(data.getByRole('row')).toHaveCount(5)
  const graphFilter = graph.getByRole('combobox', { name: 'Progress size', exact: true })
  await chooseFilter(graphFilter, { label: '{1, 3, 5, 7, 9}' })
  await expect(graph.locator('.progress-perfect .recharts-scatter-symbol')).toHaveCount(1)
  await expect(graph.locator('.progress-other .recharts-scatter-symbol')).toHaveCount(0)
  await graph.locator('.progress-perfect .recharts-scatter-symbol').hover()
  await expect(graph.locator('.progress-tooltip dd')).toHaveText(['100%', '25 / 25', '1s'])
  await expect(graph.locator('.progress-results .recharts-line-curve')).toHaveCount(0)
  await page.reload()
  await expect(graphFilter).toHaveAttribute('data-value', 'set:1,3,5,7,9')
  await expect(filter).toHaveAttribute('data-value', 'set:1,3,5,7,9')
  await expect(page.locator('.score-heading')).toHaveText('Score history')
})

for (const appearance of ['dark', 'light'] as const) {
  for (const width of [1024, 1440]) {
    for (const factors of [[20], Array.from({ length: 20 }, (_, i) => i + 1)]) {
      test(`long answers/corrections and custom popup fit ${factors.length} factors at ${width}px in ${appearance}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 1100 })
        await page.goto('/')
        if (appearance === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click()
        await page.getByRole('radio', { name: 'Ordered', exact: true }).click()
        await chooseCustom(page, factors)
        await trigger(page).click()
        const popup = panel(page)
        await expect(popup.getByRole('group', { name: 'Factors', exact: true }).getByRole('button')).toHaveCount(20)
        for (const option of await popup.getByRole('button').all()) await expect(option).toBeInViewport({ ratio: 1 })
        await page.screenshot({ path: info.outputPath('custom-popup.png'), fullPage: true })
        await page.keyboard.press('Escape')
        await expect(popup).toHaveCount(0)
        await expect(trigger(page)).toBeFocused()
        await page.getByRole('button', { name: 'Start', exact: true }).click()
        const input = page.getByRole('textbox', { name: '20 × 20', exact: true })
        await input.fill('400')
        const measure = () => input.evaluate(element => {
          const style = getComputedStyle(element)
          const context = document.createElement('canvas').getContext('2d')!
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
          const box = element.getBoundingClientRect()
          const cell = element.closest('td')!.getBoundingClientRect()
          return { text: context.measureText((element as HTMLInputElement).value).width,
            available: box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), fontSize: parseFloat(style.fontSize),
            width: cell.width, height: cell.height, board: element.closest('table')!.getBoundingClientRect().width,
            overflow: document.documentElement.scrollWidth > innerWidth }
        })
        const active = await measure()
        expect(active.available).toBeGreaterThanOrEqual(active.text)
        expect(active.fontSize).toBeGreaterThanOrEqual(18)
        expect(Math.abs(active.width - active.height)).toBeLessThan(2)
        expect(active.board).toBeLessThanOrEqual(841)
        expect(active.overflow).toBe(false)
        await page.screenshot({ path: info.outputPath('active-400.png'), fullPage: true })
        await input.fill('999')
        await page.keyboard.press('Shift+Enter')
        await expect(input).toHaveAccessibleDescription('Incorrect. Correct: 400')
        const corrected = await measure()
        expect(corrected.available).toBeGreaterThanOrEqual(corrected.text)
        const feedback = await input.locator('..').evaluate(cell => {
          const bounds = cell.getBoundingClientRect()
          const input = cell.querySelector('input')!.getBoundingClientRect()
          const correction = cell.querySelector('.answer-correction')!
          const texts = Array.from(correction.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).flatMap(n => {
            const range = document.createRange(); range.selectNodeContents(n)
            return [...range.getClientRects()].map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }))
          })
          return { bounds: { left: bounds.left, right: bounds.right, bottom: bounds.bottom }, inputBottom: input.bottom, texts }
        })
        for (const text of feedback.texts) {
          expect(text.left).toBeGreaterThanOrEqual(feedback.bounds.left)
          expect(text.right).toBeLessThanOrEqual(feedback.bounds.right)
          expect(text.bottom).toBeLessThanOrEqual(feedback.bounds.bottom)
          expect(text.top).toBeGreaterThanOrEqual(feedback.inputBottom - 1)
        }
        await page.screenshot({ path: info.outputPath('corrected-400.png'), fullPage: true })
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores')!).scores[0])
        expect(saved).toMatchObject({ factors, size: factors.length, total: factors.length ** 2, attempted: 1, correct: 0, status: factors.length === 1 ? 'complete' : 'partial' })
      })
    }
  }
}

test('shuffled custom axes independently permute exactly the chosen set', async ({ page }) => {
  await page.addInitScript(() => {
    let seed = 37
    Math.random = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646
    localStorage.setItem('times-tables.settings', JSON.stringify({ mode: 'shuffled', size: 5, choice: 'custom', customFactors: [7, 8, 9, 11, 13] }))
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const grid = page.getByRole('table', { name: 'Multiplication grid' })
  const rows = (await grid.getByRole('rowheader').allTextContents()).map(Number)
  const columns = (await grid.getByRole('columnheader').allTextContents()).slice(1).map(Number)
  expect([...rows].sort((a, b) => a - b)).toEqual(example)
  expect([...columns].sort((a, b) => a - b)).toEqual(example)
  expect(rows).not.toEqual(columns)
  await grid.getByRole('textbox').first().fill(String(rows[0] * columns[0]))
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toContainText('1 / 1 correct')
  const score = await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores')!).scores[0])
  expect(score).toMatchObject({ mode: 'shuffled', factors: example, attempted: 1, status: 'partial' })
})

test('malformed score/settings bytes survive play and warnings remain real', async ({ page }) => {
  await page.goto('/')
  const corrupt = JSON.stringify({ version: 4, scores: [{ factors: [7, '8', 13] }] })
  const settings = JSON.stringify({ mode: 'ordered', size: 5, choice: 'custom', customFactors: [7, '8', 13] })
  await page.evaluate(({ corrupt, settings }) => {
    localStorage.setItem('times-tables.scores', corrupt)
    localStorage.setItem('times-tables.settings', settings)
  }, { corrupt, settings })
  await page.reload()
  await expect(page.getByRole('alert').filter({ hasText: 'Saved custom factors could not be read' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled()
  await chooseCustom(page, [20])
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox', { name: '20 × 20', exact: true }).fill('400')
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('alert').filter({ hasText: 'Score not saved' })).toBeVisible()
  await expect(page.getByText('Score saved in this browser.', { exact: true })).toHaveCount(0)
  const stored = await page.evaluate(() => ({ scores: localStorage.getItem('times-tables.scores'), settings: localStorage.getItem('times-tables.settings') }))
  expect(stored).toEqual({ scores: corrupt, settings })
})

const trigger = (page: Page) => page.getByRole('button', { name: 'Grid size', exact: true })
const panel = (page: Page) => page.getByRole('dialog', { name: 'Grid size options', exact: true })
async function chooseCustom(page: Page, values: number[]) {
  await trigger(page).click()
  await panel(page).getByRole('button', { name: 'Custom', exact: true }).click()
  for (let value = 1; value <= 20; value++) {
    const button = panel(page).getByRole('button', { name: String(value), exact: true })
    if ((await button.getAttribute('aria-pressed') === 'true') !== values.includes(value)) await button.click()
  }
  await panel(page).getByRole('button', { name: 'Done', exact: true }).click()
  await expect(panel(page)).toHaveCount(0)
  await expect(trigger(page)).toBeFocused()
}

test('selects exact factors with toggle buttons, persists across presets/reload, locks the round and saves products', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Ordered', exact: true }).click()
  await chooseCustom(page, example)
  await expect(page.getByText('7, 8, 9, 11, 13', { exact: true })).toBeVisible()
  await chooseGridSize(page, 2)
  await page.reload()
  await expect(trigger(page)).toHaveText('2 × 2')
  await trigger(page).click()
  await panel(page).getByRole('button', { name: 'Custom', exact: true }).click()
  for (const value of example) await expect(panel(page).getByRole('button', { name: String(value), exact: true })).toHaveAttribute('aria-pressed', 'true')
  await panel(page).getByRole('button', { name: 'Done', exact: true }).click()
  await expect(panel(page)).toHaveCount(0)
  await expect(trigger(page)).toBeFocused()
  await page.reload()
  await expect(trigger(page)).toHaveText('Custom')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const grid = page.getByRole('table', { name: 'Multiplication grid' })
  await expect(grid.getByRole('rowheader')).toHaveText(example.map(String))
  await expect(grid.getByRole('columnheader')).toHaveText(['×', ...example.map(String)])
  await expect(trigger(page)).toBeDisabled()
  const inputs = grid.getByRole('textbox')
  for (const input of await inputs.all()) {
    const [a, b] = (await input.getAttribute('aria-label'))!.split(' × ').map(Number)
    await input.fill(String(a * b))
  }
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('heading', { name: 'Round complete', exact: true })).toBeVisible()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores')!))
  expect(saved).toMatchObject({ version: 4, scores: [{ factors: example, size: 5, attempted: 25, total: 25, correct: 25, status: 'complete' }] })
})

test('Custom keyboard toggles never start a round; empty selection blocks button and page shortcuts', async ({ page }) => {
  await page.goto('/')
  await trigger(page).press('Enter')
  const custom = panel(page).getByRole('button', { name: 'Custom', exact: true })
  await page.keyboard.press('End')
  await expect(custom).toBeFocused()
  await page.keyboard.press('Space')
  await expect(panel(page).getByRole('button', { name: '1', exact: true })).toBeFocused()
  const thirteen = panel(page).getByRole('button', { name: '13', exact: true })
  await thirteen.focus()
  await page.keyboard.press('Space')
  await expect(thirteen).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Enter')
  await expect(thirteen).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('ArrowRight')
  await expect(panel(page).getByRole('button', { name: '14', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await expect(trigger(page)).toBeFocused()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await chooseCustom(page, [])
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled()
  await page.locator('body').click({ position: { x: 8, y: 8 } })
  await page.keyboard.press('Enter')
  await page.keyboard.press('Space')
  await expect(page.getByRole('timer')).toHaveText('0:00.0')
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled()
})
