import { expect, test, type Page } from '@playwright/test'

async function seed(page: Page) {
  await page.addInitScript(() => {
    Object.assign(window, { timingNow: 100, timingFocused: true, timingVisible: true })
    const state = window as unknown as { timingNow: number; timingFocused: boolean; timingVisible: boolean }
    performance.now = () => state.timingNow
    document.hasFocus = () => state.timingFocused
    Object.defineProperty(document, 'visibilityState', { get: () => state.timingVisible ? 'visible' : 'hidden' })
    if (!localStorage.getItem('times-tables.settings')) localStorage.setItem('times-tables.settings', JSON.stringify({ version: 1, mode: 'ordered', size: 2, choice: 'custom', customFactors: [6, 9] }))
  })
  await page.goto('/')
}
async function at(page: Page, now: number) { await page.evaluate(now => { Object.assign(window, { timingNow: now }) }, now) }
async function scores(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores') ?? '{"scores":[]}').scores) }

test('final edits, revisits, clear, skips and finish wait save only ordinary results', async ({ page }) => {
  await seed(page)
  await page.keyboard.down('7')
  const fields = page.getByRole('textbox')
  await expect(fields.first()).toBeFocused()
  await page.keyboard.down('7') // held initiating key is not an edit
  await page.keyboard.up('7')
  await expect(fields.first()).toHaveValue('')
  await at(page, 400); await fields.first().fill('3')
  await at(page, 600); await fields.first().fill('036')
  await at(page, 700); await fields.nth(1).focus()
  await at(page, 1000); await fields.nth(1).fill('54')
  await at(page, 1100); await fields.first().focus()
  await at(page, 1300); await fields.nth(2).focus()
  await at(page, 1500); await fields.nth(2).fill('5')
  await at(page, 1600); await fields.nth(2).fill('')
  await at(page, 1800); await fields.nth(2).fill('54')
  await at(page, 2800); await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  const [score] = await scores(page)
  expect(score.elapsedMs).toBe(2700)
  expect(score).toMatchObject({ status: 'partial', attempted: 3, correct: 3, total: 4 })
  expect(score).not.toHaveProperty('calculations')
  await page.reload()
  expect((await scores(page))[0]).toEqual(score)
})

test('hidden, window blur and offroute time preserve whole-run elapsed and edited answers without cell capture', async ({ page }) => {
  await seed(page)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await at(page, 200)
  await page.evaluate(() => { Object.assign(window, { timingVisible: false }); document.dispatchEvent(new Event('visibilitychange')) })
  await at(page, 1200)
  await page.evaluate(() => { Object.assign(window, { timingVisible: true }); document.dispatchEvent(new Event('visibilitychange')) })
  await at(page, 1400)
  await page.evaluate(() => { Object.assign(window, { timingFocused: false }); window.dispatchEvent(new Event('blur')) })
  await at(page, 2400)
  await page.evaluate(() => { Object.assign(window, { timingFocused: true }); window.dispatchEvent(new Event('focus')) })
  await at(page, 2600); await page.getByRole('textbox').first().fill('36')
  await at(page, 2700); await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await at(page, 5700); await page.getByRole('link', { name: 'Practice', exact: true }).click()
  await page.getByRole('textbox').first().focus()
  await at(page, 5900); await page.getByRole('textbox').first().fill('036')
  await at(page, 6000); await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  const [score] = await scores(page)
  expect(score.elapsedMs).toBe(5900)
  expect(score).toMatchObject({ status: 'partial', attempted: 1, correct: 1 })
  expect(score).not.toHaveProperty('calculations')
})

test('zero-duration runs, cleared answers and cancel/retry do not collect cell details', async ({ page }) => {
  await seed(page)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('36')
  await page.keyboard.press('Escape')
  expect(await scores(page)).toEqual([])
  await at(page, 9000)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('36')
  await page.getByRole('textbox').nth(1).fill('54')
  await page.getByRole('textbox').nth(1).fill('')
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  const [score] = await scores(page)
  expect(score).toMatchObject({ elapsedMs: 0, status: 'partial', attempted: 1, correct: 1 })
  expect(score).not.toHaveProperty('calculations')
})

for (const close of [false, true]) test(`ordinary immutable intent survives immediate ${close ? 'tab close' : 'reload'} under a held score lock`, async ({ page, context }) => {
  await seed(page)
  const holder = await context.newPage()
  await holder.goto('/')
  await holder.evaluate(async () => {
    let acquired!: () => void
    const ready = new Promise<void>(resolve => { acquired = resolve })
    void navigator.locks.request('times-tables.scores', () => new Promise<void>(resolve => { Object.assign(window, { releaseTimingLock: resolve }); acquired() }))
    await ready
  })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await at(page, 400); await page.getByRole('textbox').first().fill('36')
  await at(page, 600); await page.keyboard.press('Shift+Enter')
  if (close) await page.close()
  else await page.reload({ waitUntil: 'commit' })
  const pending = await holder.evaluate(() => {
    const key = Object.keys(localStorage).find(key => key.startsWith('times-tables.scores.intent.'))!
    return { key, raw: localStorage.getItem(key)!, primary: localStorage.getItem('times-tables.scores') }
  })
  expect(pending.primary).toBeNull()
  expect(JSON.parse(pending.raw).payload[0]).toMatchObject({ elapsedMs: 500, status: 'partial', attempted: 1, correct: 1 })
  expect(JSON.parse(pending.raw).payload[0]).not.toHaveProperty('calculations')
  await holder.evaluate(() => (window as unknown as { releaseTimingLock: () => void }).releaseTimingLock())
  const recovered = close ? await context.newPage() : page
  if (close) await recovered.goto('/stats')
  else await recovered.getByRole('link', { name: 'Stats', exact: true }).click()
  await expect.poll(async () => (await scores(recovered)).length).toBe(1)
  expect((await scores(recovered))[0]).toEqual(JSON.parse(pending.raw).payload[0])
  expect(await recovered.evaluate(key => localStorage.getItem(key), pending.key)).toBe(pending.raw)
  await holder.close()
})

test('ordinary save keeps selection locked until settlement with only one score intent', async ({ page, context }) => {
  await seed(page)
  const holder = await context.newPage()
  await holder.goto('/')
  await holder.evaluate(async () => {
    let acquired!: () => void
    const ready = new Promise<void>(resolve => { acquired = resolve })
    void navigator.locks.request('times-tables.scores', () => new Promise<void>(resolve => { Object.assign(window, { releaseTimingLock: resolve }); acquired() }))
    await ready
  })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await at(page, 400); await page.getByRole('textbox').first().fill('36')
  await page.keyboard.press('Shift+Enter')
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Stats size', exact: true })).toBeDisabled()
  expect(await scores(page)).toEqual([])
  await holder.evaluate(() => (window as unknown as { releaseTimingLock: () => void }).releaseTimingLock())
  await expect(page.getByRole('combobox', { name: 'Stats size', exact: true })).toBeEnabled()
  const [score] = await scores(page)
  expect(score).toMatchObject({ status: 'partial', attempted: 1, correct: 1 })
  expect(score).not.toHaveProperty('calculations')
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('times-tables.scores.intent.')).length)).toBe(1)
  await holder.close()
})

test('stale cooperating tabs preserve ordinary scores and duplicate finish journals only once', async ({ page, context }) => {
  await seed(page)
  const second = await context.newPage()
  await seed(second)
  for (const target of [page, second]) {
    await target.getByRole('button', { name: 'Start', exact: true }).click()
    await at(target, 200); await target.getByRole('textbox').first().fill('36')
    await at(target, 400)
  }
  await Promise.all([page, second].map(target => target.getByRole('textbox').first().evaluate(node => {
    for (let index = 0; index < 3; index++) node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
  })))
  for (const target of [page, second]) await expect(target.getByRole('region', { name: 'Round result' })).toBeVisible()
  const saved = await scores(page)
  expect(saved).toHaveLength(2)
  expect(new Set(saved.map((score: { id: string }) => score.id)).size).toBe(2)
  for (const score of saved) {
    expect(score).toMatchObject({ elapsedMs: 300, status: 'partial', attempted: 1, correct: 1 })
    expect(score).not.toHaveProperty('calculations')
  }
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('times-tables.scores.intent.')).length)).toBe(2)
  await second.close()
})

test('Tab, reverse Tab, arrows, optional Space and last-cell boundary retain focus identity', async ({ page }) => {
  await seed(page)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('switch', { name: 'Space to advance' }).click()
  await page.getByRole('link', { name: 'Practice', exact: true }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const fields = page.getByRole('textbox')
  await at(page, 200); await fields.first().fill('36')
  await at(page, 300); await page.keyboard.press('Tab')
  await at(page, 400); await fields.nth(1).fill('54')
  await at(page, 500); await page.keyboard.press('Shift+Tab')
  await at(page, 600); await page.keyboard.press('ArrowDown')
  await at(page, 700); await fields.nth(2).fill('54')
  await at(page, 800); await page.keyboard.press('ArrowDown')
  await expect(fields.nth(2)).toBeFocused()
  await at(page, 900); await page.keyboard.press('Space')
  await at(page, 1000); await fields.nth(3).fill('81')
  await at(page, 2000); await page.keyboard.press('Space')
  await expect(fields.nth(3)).toBeFocused()
  await at(page, 3000); await page.keyboard.press('Enter')
  expect(await scores(page)).toEqual([])
  await at(page, 4000); await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  const [score] = await scores(page)
  expect(score).toMatchObject({ elapsedMs: 3900, status: 'complete', attempted: 4, correct: 4 })
  expect(score).not.toHaveProperty('calculations')
})
