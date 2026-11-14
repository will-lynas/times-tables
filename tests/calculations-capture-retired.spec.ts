import { expect, test, type Page } from '@playwright/test'

const old = {
  id: 'archived-detail', mode: 'shuffled', size: 2, factors: [9, 6], status: 'partial', attempted: 3,
  correct: 2, total: 4, elapsedMs: 4321.125, completedAt: '2026-01-01T12:00:00Z', unknown: { keep: ['001', null] },
  calculations: { version: 1, unknown: { immutable: [true] }, cells: [
    { index: 0, rowIndex: 0, columnIndex: 0, row: 9, column: 6, product: 54, answer: '054', status: 'correct', unknown: { exact: ['000'] } },
    { index: 1, rowIndex: 0, columnIndex: 1, row: 9, column: 9, product: 81, answer: '8', status: 'incorrect' },
    { index: 2, rowIndex: 1, columnIndex: 0, row: 6, column: 6, product: 36, answer: '036', status: 'correct' },
    { index: 3, rowIndex: 1, columnIndex: 1, row: 6, column: 9, product: 54, answer: '', status: 'unanswered' },
  ], timing: { version: 1, unknown: { nested: ['timing'] }, cells: [
    { index: 0, answerEntryMs: 0, focusedMs: 1200.25, visits: 3, edits: 2, unknown: { keep: [false] } },
    { index: 1, answerEntryMs: 15.75, focusedMs: 30, visits: 1, edits: 1 },
    { index: 2, answerEntryMs: 500, focusedMs: 600, visits: 2, edits: 4 },
    { index: 3, answerEntryMs: null, focusedMs: 50, visits: 1, edits: 2 },
  ] } },
}
const raw = '  ' + JSON.stringify({ version: 4, scores: [old], unknown: { envelope: ['retain'] } }) + '\n'
async function seed(page: Page, mode = 'ordered', custom = false, source = raw) {
  await page.addInitScript(({ mode, custom, source }) => {
    if (localStorage.getItem('retirement.seeded')) return
    localStorage.setItem('retirement.seeded', 'yes')
    localStorage.setItem('times-tables.settings', JSON.stringify({ version: 1, mode, size: 2, ...(custom ? { choice: 'custom', customFactors: [6, 9] } : {}) }))
    localStorage.setItem('times-tables.scores', source)
  }, { mode, custom, source })
  await page.goto('/')
}
async function saved(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores')!)) }

for (const close of [false, true]) test(`rich historical detail survives ordinary intent and immediate ${close ? 'close' : 'reload'} behind held lock`, async ({ page, context }) => {
  await seed(page)
  const holder = await context.newPage()
  await holder.goto('/')
  await holder.evaluate(async () => {
    let acquired!: () => void
    const ready = new Promise<void>(resolve => { acquired = resolve })
    void navigator.locks.request('times-tables.scores', () => new Promise<void>(resolve => { Object.assign(window, { releaseRetirementLock: resolve }); acquired() }))
    await ready
  })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('1')
  await page.keyboard.press('Shift+Enter')
  if (close) await page.close()
  else await page.reload({ waitUntil: 'commit' })
  const pending = await holder.evaluate(() => {
    const key = Object.keys(localStorage).find(key => key.startsWith('times-tables.scores.intent.'))!
    return { key, raw: localStorage.getItem(key)!, primary: localStorage.getItem('times-tables.scores') }
  })
  expect(pending.primary).toBe(raw)
  expect(JSON.parse(pending.raw).payload[0]).not.toHaveProperty('calculations')
  await holder.evaluate(() => (window as unknown as { releaseRetirementLock: () => void }).releaseRetirementLock())
  const restored = close ? await context.newPage() : page
  if (close) await restored.goto('/stats')
  await expect.poll(async () => (await saved(restored)).scores.length).toBe(2)
  expect((await saved(restored)).scores).toEqual([old, JSON.parse(pending.raw).payload[0]])
  expect(await restored.evaluate(key => localStorage.getItem(key), pending.key)).toBe(pending.raw)
  await holder.close()
})

test('failed ordinary save retries from unchanged intent without enriching old or new cells', async ({ page }) => {
  await seed(page)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('1')
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'times-tables.scores') throw new DOMException('Full', 'QuotaExceededError')
      original.call(this, key, value)
    }
  })
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('alert').first()).toContainText('not saved')
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(raw)
  const intent = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(key => key.startsWith('times-tables.scores.intent.'))!
    return { key, raw: localStorage.getItem(key)! }
  })
  expect(JSON.parse(intent.raw).payload[0]).not.toHaveProperty('calculations')
  await page.reload()
  await expect.poll(async () => (await saved(page)).scores.length).toBe(2)
  expect((await saved(page)).scores).toEqual([old, JSON.parse(intent.raw).payload[0]])
  expect(await page.evaluate(key => localStorage.getItem(key), intent.key)).toBe(intent.raw)
})

for (const mode of ['ordered', 'shuffled']) for (const custom of [false, true]) for (const partial of [false, true]) {
  test(`ordinary ${mode} ${custom ? 'custom' : 'preset'} ${partial ? 'partial' : 'complete'} save has no new cell detail`, async ({ page }) => {
    await seed(page, mode, custom)
    await expect(page.getByRole('alert')).toHaveCount(0)
    for (const name of ['Stats', 'About', 'Settings', 'Practice']) await page.getByRole('link', { name, exact: true }).click()
    expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(raw)
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    const fields = page.getByRole('textbox')
    const count = partial ? 2 : 4
    for (let index = 0; index < count; index++) {
      const label = await fields.nth(index).getAttribute('aria-label')
      const [row, column] = label!.split(' × ').map(Number)
      await fields.nth(index).fill(index === 0 ? '0' : String(row * column))
    }
    // Final correction and an unedited revisit must remain ordinary gameplay only.
    const [row, column] = (await fields.first().getAttribute('aria-label'))!.split(' × ').map(Number)
    await fields.first().fill(String(row * column).padStart(3, '0'))
    await fields.nth(1).focus(); await fields.first().focus()
    await page.getByRole('link', { name: 'Stats', exact: true }).click()
    await expect(page.getByRole('combobox', { name: 'Stats size', exact: true })).toBeDisabled()
    await page.getByRole('link', { name: 'Practice', exact: true }).click()
    await expect(fields.first()).toHaveValue(String(row * column).padStart(3, '0'))
    await fields.first().focus(); await page.keyboard.press('Shift+Enter')
    await expect(page.getByRole('region', { name: 'Round result' })).toContainText('100% accuracy')
    const data = await saved(page)
    expect(data.version).toBe(4)
    expect(data.unknown).toEqual({ envelope: ['retain'] })
    expect(data.scores).toHaveLength(2)
    expect(data.scores[0]).toEqual(old)
    expect(data.scores[1]).toEqual({ id: expect.any(String), mode, size: 2, factors: custom ? [6, 9] : [1, 2],
      status: partial ? 'partial' : 'complete', attempted: count, correct: count, total: 4, elapsedMs: expect.any(Number), completedAt: expect.any(String) })
    await page.reload()
    expect((await saved(page)).scores).toEqual(data.scores)
  })
}

test('cancel and retry preserve old detail and save only the retried ordinary score', async ({ page }) => {
  await seed(page)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('0')
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(raw)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('1')
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  const data = await saved(page)
  expect(data.scores).toHaveLength(2)
  expect(data.scores[0]).toEqual(old)
  expect(data.scores[1]).not.toHaveProperty('calculations')
})

for (const kind of ['future detail', 'malformed timing']) test(`${kind} remains byte-identical after ordinary save attempt`, async ({ page }) => {
  const invalid = structuredClone(old)
  if (kind === 'future detail') invalid.calculations.version = 99
  else invalid.calculations.timing.cells[0].answerEntryMs = -1
  const source = ' ' + JSON.stringify({ version: 4, scores: [invalid] }) + '\n'
  await seed(page, 'ordered', false, source)
  await expect(page.getByRole('alert').first()).toContainText('could not be read')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('1')
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  await expect(page.getByRole('alert').first()).toContainText('not saved')
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(source)
})

for (const appearance of ['dark', 'light']) for (const width of [1024, 1440]) test(`retired capture visual ${appearance} ${width}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 })
  await seed(page)
  if (appearance === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('.radix-themes')).toHaveClass(new RegExp(appearance))
  await page.screenshot({ path: testInfo.outputPath(`ready-${appearance}-${width}.png`) })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('0')
  await page.screenshot({ path: testInfo.outputPath(`active-${appearance}-${width}.png`) })
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toContainText('0% accuracy')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath(`incorrect-${appearance}-${width}.png`) })
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Score history', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath(`stats-${appearance}-${width}.png`) })
})
