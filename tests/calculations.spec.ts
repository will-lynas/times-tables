import { expect, test, type Page } from '@playwright/test'
import { chooseFilter } from './helpers'
import type { Score } from '../src/scores'

function fixture(id: string, factors = [6, 9], answers = ['36', '54', '0', ''], mode: Score['mode'] = 'ordered'): Score {
  const cells = factors.flatMap((row, rowIndex) => factors.map((column, columnIndex) => {
    const index = rowIndex * factors.length + columnIndex, answer = answers[index], product = row * column
    return { index, rowIndex, columnIndex, row, column, answer, product, status: answer === '' ? 'unanswered' as const : Number(answer) === product ? 'correct' as const : 'incorrect' as const }
  }))
  const attempted = cells.filter(cell => cell.status !== 'unanswered').length
  return { id, factors, size: factors.length, mode, status: attempted === cells.length ? 'complete' : 'partial', attempted, total: cells.length,
    correct: cells.filter(cell => cell.status === 'correct').length, elapsedMs: 1234, completedAt: '2026-01-01T00:00:00Z', calculations: { version: 1, cells } }
}

async function readScores(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores') ?? '{"scores":[]}').scores) }

async function seed(page: Page, mode = 'ordered') {
  await page.addInitScript(mode => {
    if (!localStorage.getItem('times-tables.settings')) localStorage.setItem('times-tables.settings', JSON.stringify({ version: 1, mode, size: 2, choice: 'custom', customFactors: [6, 9] }))
  }, mode)
  await page.goto('/')
}

test('a submitted partial run retains only final answers and actual ordered cell identities across reload', async ({ page }) => {
  await seed(page)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox', { name: '6 × 6', exact: true }).fill('3')
  await page.getByRole('textbox', { name: '6 × 6', exact: true }).fill('036')
  await page.getByRole('textbox', { name: '6 × 9', exact: true }).fill('54')
  await page.getByRole('textbox', { name: '9 × 6', exact: true }).fill('0')
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  await page.reload()
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores')!).scores)
  expect(stored).toHaveLength(1)
  expect(stored[0]).toMatchObject({ status: 'partial', attempted: 3, correct: 2, calculations: { version: 1, cells: [
    { index: 0, rowIndex: 0, columnIndex: 0, row: 6, column: 6, answer: '036', product: 36, status: 'correct' },
    { index: 1, rowIndex: 0, columnIndex: 1, row: 6, column: 9, answer: '54', product: 54, status: 'correct' },
    { index: 2, rowIndex: 1, columnIndex: 0, row: 9, column: 6, answer: '0', product: 54, status: 'incorrect' },
    { index: 3, rowIndex: 1, columnIndex: 1, row: 9, column: 9, answer: '', product: 81, status: 'unanswered' },
  ] } })
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await page.getByRole('link', { name: 'Calculations', exact: true }).click()
  const table = page.getByRole('table', { name: 'Incorrect calculations' })
  await expect(table.getByRole('row')).toHaveCount(2)
  await expect(table.getByRole('row').nth(1)).toContainText('9 × 6')
  await expect(table.getByRole('row').nth(1)).toContainText('100%')
  await expect(page.getByText('Detail coverage: 1 / 1 runs · 3 answered')).toBeVisible()
  await page.reload()
  await expect(table).toBeVisible()
})

test('coverage across all settings and directional counts use final detailed answers only', async ({ page }) => {
  const { calculations: _, ...old } = fixture('old')
  const scores = [old, fixture('partial'), fixture('complete', [6, 9], ['36', '0', '54', '81']),
    fixture('more', [6, 9], ['0', '', '0', '']), fixture('different-set', [5, 9], ['0', '0', '0', '0']),
    fixture('shuffled', [6, 9], ['0', '0', '0', '0'], 'shuffled')]
  await page.addInitScript(scores => { if (!localStorage.getItem('times-tables.scores')) localStorage.setItem('times-tables.scores', JSON.stringify({ version: 4, scores })) }, scores)
  await seed(page)
  await page.goto('/stats/calculations')
  // Shared selection from Practice, not an independently persisted analytics filter.
  await expect(page.getByRole('radio', { name: 'Ordered', exact: true })).toBeChecked()
  await chooseFilter(page.getByRole('combobox', { name: 'Stats size', exact: true }), 'set:6,9')
  const table = page.getByRole('table', { name: 'Incorrect calculations' })
  await expect(page.getByText('Detail coverage: 5 / 6 runs · 17 answered')).toBeVisible()
  const rows = table.getByRole('row')
  await expect(rows).toHaveCount(8)
  await expect(rows.nth(1).getByRole('rowheader')).toHaveText('9 × 6')
  await expect(rows.nth(1).getByRole('cell').nth(0)).toHaveText('3')
  await expect(rows.nth(1).getByRole('cell').nth(1)).toHaveText('4')
  await expect(rows.nth(1).getByRole('cell').nth(2)).toHaveText('75%')
  await expect(rows.nth(2).getByRole('rowheader')).toHaveText('6 × 6')
  await expect(rows.nth(3).getByRole('rowheader')).toHaveText('6 × 9')
  await rows.nth(1).getByText('Answers', { exact: true }).click()
  await expect(rows.nth(1)).toContainText('Correct: 54')
  await expect(rows.nth(1)).toContainText('0 (3)')
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await page.goBack()
  await expect(table).toBeVisible()
  await page.goForward()
  await expect(page.getByRole('table', { name: 'Score history', exact: true })).toBeVisible()
})

test('shuffled axes are captured as displayed and synchronous repeated submission captures once', async ({ page }) => {
  await seed(page, 'shuffled')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const fields = page.getByRole('textbox')
  const labels = await fields.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')))
  for (let index = 0; index < labels.length; index++) {
    const [row, column] = labels[index]!.split(' × ').map(Number)
    await fields.nth(index).fill(String(row * column))
  }
  await fields.first().evaluate(node => {
    let count = 0
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) { if (key === 'times-tables.scores') count++; return original.call(this, key, value) }
    Object.assign(window, { scoreWrites: () => count })
    for (let index = 0; index < 3; index++) node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
  })
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  const scores = await readScores(page)
  expect(scores).toHaveLength(1)
  expect(scores[0].calculations.cells.map((cell: { row: number; column: number }) => `${cell.row} × ${cell.column}`)).toEqual(labels)
  expect(await page.evaluate(() => (window as unknown as { scoreWrites: () => number }).scoreWrites())).toBe(1)
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('times-tables.scores.intent.')).length)).toBe(1)
  await page.goto('/stats/calculations')
  await expect(page.getByText('No incorrect answers in recorded details.')).toBeVisible()
})

test('empty, invalid and cancelled rounds create no detailed submitted records', async ({ page }) => {
  await seed(page)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.keyboard.press('Shift+Enter')
  expect(await readScores(page)).toEqual([])
  await page.getByRole('textbox').first().fill('1e2')
  await expect(page.getByRole('textbox').first()).toHaveValue('')
  await page.getByRole('textbox').first().fill('0')
  await page.keyboard.press('Escape')
  expect(await readScores(page)).toEqual([])
  await page.goto('/stats/calculations')
  await expect(page.getByText('Detail coverage: 0 / 0 runs · 0 answered')).toBeVisible()
  await expect(page.getByText('No calculation details yet.')).toBeVisible()
})

for (const close of [false, true]) test(`detailed intent survives immediate ${close ? 'tab close' : 'reload'} under a held score lock`, async ({ page, context }) => {
  await seed(page)
  const holder = await context.newPage()
  await holder.goto('/')
  await holder.evaluate(async () => {
    let acquired!: () => void
    const ready = new Promise<void>(resolve => { acquired = resolve })
    void navigator.locks.request('times-tables.scores', () => new Promise<void>(resolve => { Object.assign(window, { releaseScoreLock: resolve }); acquired() }))
    await ready
  })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox', { name: '9 × 6', exact: true }).fill('0')
  await page.getByRole('button', { name: 'Finish early', exact: true }).click()
  if (close) await page.close()
  else await page.reload({ waitUntil: 'commit' })
  await holder.evaluate(() => (window as unknown as { releaseScoreLock: () => void }).releaseScoreLock())
  const recovered = close ? await context.newPage() : page
  if (close) await recovered.goto('/stats/calculations')
  else await recovered.getByRole('link', { name: 'Stats', exact: true }).click()
  if (!close) await recovered.getByRole('link', { name: 'Calculations', exact: true }).click()
  await expect.poll(async () => (await readScores(recovered)).length).toBe(1)
  await expect(recovered.getByRole('table', { name: 'Incorrect calculations' })).toContainText('9 × 6')
  expect((await readScores(recovered))[0].calculations.cells[2].answer).toBe('0')
  await holder.close()
})

test('calculation navigation and Settings preserve active answers, timer and score identity', async ({ page }) => {
  await seed(page)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox', { name: '9 × 6', exact: true }).fill('5')
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await page.getByRole('link', { name: 'Calculations', exact: true }).click()
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.press('Escape')
  expect(await readScores(page)).toEqual([])
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.waitForTimeout(150)
  await page.goBack()
  await expect(page.getByRole('link', { name: 'Calculations', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('link', { name: 'Practice', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '9 × 6', exact: true })).toHaveValue('5')
  await expect(page.getByRole('timer')).not.toHaveText('0:00.0')
  await page.getByRole('textbox', { name: '9 × 6', exact: true }).focus()
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  const scores = await readScores(page)
  const starts = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('times-tables.run-start.')))
  expect(starts).toEqual([`times-tables.run-start.${scores[0].id}`])
  expect(scores[0].calculations.cells[2].answer).toBe('5')
})

test('saving results are not presented as recorded calculation details before commit', async ({ page, context }) => {
  await seed(page)
  const holder = await context.newPage()
  await holder.goto('/')
  await holder.evaluate(async () => {
    let acquired!: () => void
    const ready = new Promise<void>(resolve => { acquired = resolve })
    void navigator.locks.request('times-tables.scores', () => new Promise<void>(resolve => { Object.assign(window, { releaseScoreLock: resolve }); acquired() }))
    await ready
  })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('0')
  await page.keyboard.press('Shift+Enter')
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await page.getByRole('link', { name: 'Calculations', exact: true }).click()
  await expect(page.getByText('No calculation details yet.')).toBeVisible()
  await holder.evaluate(() => (window as unknown as { releaseScoreLock: () => void }).releaseScoreLock())
  await expect(page.getByRole('table', { name: 'Incorrect calculations' })).toContainText('6 × 6')
  await holder.close()
})

test('stale cooperating tabs union detailed submissions without losing either run', async ({ page, context }) => {
  await seed(page)
  const second = await context.newPage()
  await second.goto('/')
  for (const target of [page, second]) {
    await target.getByRole('button', { name: 'Start', exact: true }).click()
    await target.getByRole('textbox', { name: '9 × 6', exact: true }).fill('0')
  }
  await Promise.all([page.keyboard.press('Shift+Enter'), second.keyboard.press('Shift+Enter')])
  for (const target of [page, second]) await expect(target.getByRole('region', { name: 'Round result' })).toBeVisible()
  const scores = await readScores(page)
  expect(scores).toHaveLength(2)
  expect(new Set(scores.map((score: Score) => score.id)).size).toBe(2)
  expect(scores.every((score: Score) => score.calculations!.cells[2].answer === '0')).toBe(true)
  await page.goto('/stats/calculations')
  await expect(page.getByText('Detail coverage: 2 / 2 runs · 2 answered')).toBeVisible()
  const cells = page.getByRole('table', { name: 'Incorrect calculations' }).getByRole('row').nth(1).getByRole('cell')
  await expect(cells.nth(0)).toHaveText('2')
  await expect(cells.nth(1)).toHaveText('2')
  await second.close()
})

for (const theme of ['dark', 'light']) for (const width of [1024, 1440]) test(`calculation table readable in ${theme} at ${width}`, async ({ page }) => {
  const { calculations: _, ...historical } = fixture('historical')
  await page.addInitScript(({ theme, scores }) => {
    localStorage.setItem('times-tables.theme', theme)
    localStorage.setItem('times-tables.scores', JSON.stringify({ version: 4, scores }))
  }, { theme, scores: [historical, fixture('wrong'), fixture('right', [6, 9], ['36', '54', '54', '81'])] })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()) })
  await page.setViewportSize({ width, height: 1000 })
  await seed(page)
  await page.goto('/stats/calculations')
  const table = page.getByRole('table', { name: 'Incorrect calculations' })
  await expect(table).toBeVisible()
  await table.getByLabel('Incorrect answers for 9 × 6', { exact: true }).click()
  await expect(table.getByText('Correct: 54')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const contrast = await page.locator('.calculation-wrong, .calculation-correct, .detail-coverage').evaluateAll(nodes => {
    function luminance(color: string) {
      const values = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => { const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4 })
      return values[0] * .2126 + values[1] * .7152 + values[2] * .0722
    }
    const background = luminance(getComputedStyle(document.querySelector('.radix-themes')!).backgroundColor)
    return nodes.map(node => { const foreground = luminance(getComputedStyle(node).color); return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) })
  })
  expect(contrast.every(value => value >= 4.5)).toBe(true)
  await page.screenshot({ path: `artifacts/calculations/${theme}-${width}.png`, fullPage: true })
  expect(errors).toEqual([])
})

for (const failure of ['future', 'quota']) test(`${failure} storage never fabricates recorded error history`, async ({ page }) => {
  const raw = ' {"version":99,"scores":[],"future":["keep"]}\n'
  await page.addInitScript(({ failure, raw }) => {
    if (failure === 'future') localStorage.setItem('times-tables.scores', raw)
    else {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function(key, value) { if (key.startsWith('times-tables.scores')) throw new DOMException('Full', 'QuotaExceededError'); return original.call(this, key, value) }
    }
  }, { failure, raw })
  await seed(page)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('0')
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await page.getByRole('link', { name: 'Calculations', exact: true }).click()
  await expect(page.getByText('Calculation details unavailable.')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(failure === 'future' ? raw : null)
})
