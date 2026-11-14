import { expect, test, type Page } from '@playwright/test'
import { chooseFilter } from './helpers'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

test('retired display modules and feature chunks are absent', () => {
  for (const path of ['src/CalculationStats.tsx', 'src/CalculationTimes.tsx', 'src/calculations.css']) expect(existsSync(path)).toBe(false)
  const assets = readdirSync('dist/assets')
  expect(assets.filter(name => /CalculationTimes|CalculationStats|calculations/i.test(name))).toEqual([])
  for (const file of assets.filter(name => /\.(js|css)$/.test(name))) {
    expect(readFileSync(`dist/assets/${file}`, 'utf8')).not.toMatch(/Incorrect calculations|Slow calculations|Timing coverage:|Detail coverage:|\.calculation-stats|\.timing-table/)
  }
})

for (const path of ['/calculations', '/stats/calculations']) test(`${path} retires to Stats on direct load, reload and client history`, async ({ page }) => {
  await page.goto(`${path}?retired=1#history`)
  await expect(page).toHaveURL(/\/stats\?retired=1#history$/)
  await expect(page.getByRole('link', { name: 'Stats', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Score history' })).toBeVisible()
  await page.getByRole('link', { name: 'About', exact: true }).click()
  await page.evaluate(path => {
    history.pushState(null, '', path)
    dispatchEvent(new PopStateEvent('popstate'))
  }, `${path}?client=1`)
  await expect(page).toHaveURL(/\/stats\?client=1$/)
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'About', exact: true })).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(/\/stats\?client=1$/)
  await expect(page.getByRole('heading', { name: 'Score history' })).toBeVisible()
})

test('host retires both legacy paths with temporary redirects rather than feature rewrites', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'))
  for (const source of ['/calculations', '/stats/calculations']) {
    expect(config.redirects).toContainEqual({ source, destination: '/stats', permanent: false })
    expect(config.rewrites.some((rule: { source: string }) => rule.source === source)).toBe(false)
  }
})

// Historical source observations remain supported, but never collected by these fixtures.
function detailed(id: string, answers: string[], timed = false, factors = [1, 2]) {
  const cells = factors.flatMap((row, rowIndex) => factors.map((column, columnIndex) => {
    const index = rowIndex * factors.length + columnIndex, answer = answers[index], product = row * column
    return { index, rowIndex, columnIndex, row, column, answer, product,
      status: answer === '' ? 'unanswered' : Number(answer) === product ? 'correct' : 'incorrect', unknown: { retain: ['001', null] } }
  }))
  const attempted = cells.filter(cell => cell.status !== 'unanswered').length
  return { id, factors, mode: 'ordered', size: factors.length, status: attempted === cells.length ? 'complete' : 'partial', attempted,
    total: cells.length, correct: cells.filter(cell => cell.status === 'correct').length, elapsedMs: 1234,
    completedAt: `2026-01-0${timed ? 3 : 2}T00:00:00Z`, unknown: { keep: [false] },
    calculations: { version: 1, cells, unknown: ['detail'], ...(timed ? { timing: { version: 1,
      cells: cells.map(cell => ({ index: cell.index, answerEntryMs: cell.answer === '' ? null : cell.index * 100,
        focusedMs: cell.index * 100 + 50, visits: 1, edits: 1, unknown: { keep: true } })), unknown: ['timing'] } } : {}) } }
}
const legacy = { id: 'legacy', mode: 'ordered', size: 2, factors: [1, 2], status: 'complete', attempted: 4, correct: 4,
  total: 4, elapsedMs: 999, completedAt: '2026-01-01T00:00:00Z', unknown: ['aggregate'] }
const historical = [legacy, detailed('detail', ['1', '2', '0', '4']), detailed('timed', ['1', '', '', ''], true),
  detailed('other-set', ['36', '54', '0', '81'], true, [6, 9]), { ...legacy, id: 'shuffled', mode: 'shuffled' }]
const values = {
  'times-tables.scores': ` {"version":4,"scores":${JSON.stringify(historical)},"unknown":{"retain":["source",null]}}\n`,
  'times-tables.settings': '{"version":1,"mode":"ordered","size":2,"choice":"preset","customFactors":[6,9],"unknown":{"keep":true}}',
  'times-tables.progress': ' {"version":1,"mode":"ordered","size":2,"axisMode":"time","unknown":["preserve"]}\n',
  'times-tables.theme': 'dark',
  'times-tables.run-tracking': '{"version":1,"incomplete":true,"unknown":"retain"}',
  'times-tables.calculations': ' {"unknown":["retain retired data"]}\n',
}
async function seed(page: Page, theme = 'dark') {
  const seeded = { ...values, 'times-tables.theme': theme }
  await page.addInitScript(seeded => {
    if (!localStorage.getItem('times-tables.settings')) for (const [key, value] of Object.entries(seeded)) localStorage.setItem(key, value)
  }, seeded)
  return seeded
}
const storage = (page: Page) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
const scores = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores') ?? '{"scores":[]}').scores)
async function clientLegacy(page: Page, path = '/calculations') {
  await page.evaluate(path => { history.pushState(null, '', path); dispatchEvent(new PopStateEvent('popstate')) }, path)
  await expect(page).toHaveURL(/\/stats$/)
}

test('retired URLs and remaining pages retain every historical byte and exact Stats identity', async ({ page }) => {
  await seed(page)
  await page.goto('/calculations')
  const rows = page.getByRole('table', { name: 'Score history', exact: true }).locator('tbody tr')
  await expect(rows).toHaveCount(3)
  expect(await rows.evaluateAll(rows => rows.map(row => row.getAttribute('data-score-id')))).toEqual(['timed', 'detail', 'legacy'])
  await expect(page.getByRole('alert')).toHaveCount(0)
  for (const name of ['Practice', 'About', 'Settings', 'Stats']) await page.getByRole('link', { name, exact: true }).click()
  await page.goto('/stats/calculations')
  await page.reload()
  await page.goBack()
  await page.goForward()
  expect(await storage(page)).toEqual(values)
  const picker = page.getByRole('combobox', { name: 'Stats size', exact: true })
  await chooseFilter(picker, 'set:6,9')
  await expect(rows).toHaveCount(1)
  await expect(rows).toHaveAttribute('data-score-id', 'other-set')
  await clientLegacy(page)
  await expect(picker).toHaveAttribute('data-value', 'set:6,9')
  await expect(rows).toHaveAttribute('data-score-id', 'other-set')
  await page.reload()
  await expect(picker).toHaveAttribute('data-value', 'set:6,9')
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(values['times-tables.scores'])
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.settings')!).unknown)).toEqual({ keep: true })
})

test('remaining routes and legacy history retain an active run, consumed ready key and whole-run elapsed time', async ({ page }) => {
  await seed(page)
  await page.addInitScript(() => {
    Object.assign(window, { navigationNow: 100 })
    performance.now = () => (window as unknown as { navigationNow: number }).navigationNow
  })
  const at = (now: number) => page.evaluate(now => Object.assign(window, { navigationNow: now }), now)
  await page.goto('/')
  await page.keyboard.press('7')
  const first = page.getByRole('textbox').first()
  await expect(first).toHaveValue('')
  await first.fill('1')
  for (const name of ['Stats', 'About', 'Settings']) {
    await page.getByRole('link', { name, exact: true }).click()
    await expect(page.getByRole('button', { name: /Finish/ })).toHaveCount(0)
    await page.locator('body').click({ position: { x: 2, y: 2 } })
    for (const key of ['7', 'Shift+Enter', 'Escape']) await page.keyboard.press(key)
    expect(await scores(page)).toEqual(historical)
  }
  await clientLegacy(page, '/stats/calculations')
  await expect(page.getByRole('combobox', { name: 'Stats size', exact: true })).toBeDisabled()
  await page.goBack()
  await page.goForward()
  await at(6000)
  await page.getByRole('link', { name: 'Practice', exact: true }).click()
  await expect(first).toHaveValue('1')
  await first.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toHaveCount(0)
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  const saved = await scores(page)
  expect(saved.slice(0, historical.length)).toEqual(historical)
  expect(saved.at(-1)).toMatchObject({ mode: 'ordered', factors: [1, 2], status: 'partial', correct: 1, attempted: 1, elapsedMs: 5900 })
  await clientLegacy(page)
  await page.getByRole('link', { name: 'Practice', exact: true }).click()
  await expect(first).toHaveValue('1')
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Finish/ })).toHaveCount(0)
})

for (const close of [false, true]) test(`historical rich records survive held-lock save and immediate ${close ? 'tab close' : 'reload'}`, async ({ page, context }) => {
  await seed(page)
  await page.goto('/')
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
  await clientLegacy(page)
  await expect(page.getByRole('combobox', { name: 'Stats size', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(values['times-tables.scores'])
  const intents = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('times-tables.scores.intent.'))))
  expect(Object.keys(intents)).toHaveLength(1)
  const intended = JSON.parse(Object.values(intents)[0]).payload[0]
  if (close) await page.close()
  else await page.reload({ waitUntil: 'commit' })
  await holder.evaluate(() => (window as unknown as { releaseScoreLock: () => void }).releaseScoreLock())
  const recovered = close ? await context.newPage() : page
  if (close) await recovered.goto('/stats/calculations')
  await expect.poll(async () => (await scores(recovered)).length).toBe(historical.length + 1)
  const saved = await scores(recovered)
  expect(saved.slice(0, historical.length)).toEqual(historical)
  expect(saved.at(-1)).toEqual(intended)
  await expect(recovered.getByRole('table', { name: 'Score history', exact: true }).locator('tbody tr')).toHaveCount(4)
  expect(await recovered.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('times-tables.scores.intent.'))))).toEqual(intents)
  await holder.close()
})

for (const failure of ['future', 'quota']) test(`${failure} save failure survives remaining routes without changing source bytes`, async ({ page }) => {
  await seed(page)
  const raw = failure === 'future' ? ' {"version":99,"scores":[],"unknown":["keep"]}\n' : values['times-tables.scores']
  await page.addInitScript(({ raw, failure }) => {
    localStorage.setItem('times-tables.scores', raw)
    if (failure === 'quota') {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function(key, value) { if (key.startsWith('times-tables.scores')) throw new DOMException('Full', 'QuotaExceededError'); return original.call(this, key, value) }
    }
  }, { raw, failure })
  await page.goto('/')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('0')
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  await clientLegacy(page)
  await expect(page.getByRole('alert').first()).toBeVisible()
  for (const name of ['Settings', 'About', 'Practice']) await page.getByRole('link', { name, exact: true }).click()
  await expect(page.getByRole('alert').first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Finish/ })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(raw)
})

for (const theme of ['dark', 'light']) for (const width of [1024, 1440]) test(`retired UI leaves Stats and practice intact in ${theme} at ${width}`, async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()) })
  await page.setViewportSize({ width, height: 1000 })
  const seeded = await seed(page, theme)
  await page.goto('/calculations')
  await expect(page.getByRole('region', { name: 'Progress', exact: true }).locator('.recharts-scatter-symbol')).toHaveCount(3)
  await expect(page.getByRole('table', { name: 'Score history', exact: true }).locator('tbody tr')).toHaveCount(3)
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText(['Practice', 'Stats', 'About', 'Settings'])
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await storage(page)).toEqual(seeded)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath(`stats-${theme}-${width}.png`), fullPage: true })
  await page.getByRole('link', { name: 'Practice', exact: true }).click()
  await page.screenshot({ path: info.outputPath(`ready-${theme}-${width}.png`), fullPage: true })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('0')
  await page.screenshot({ path: info.outputPath(`active-${theme}-${width}.png`), fullPage: true })
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  await page.screenshot({ path: info.outputPath(`complete-${theme}-${width}.png`), fullPage: true })
  expect((await scores(page)).slice(0, historical.length)).toEqual(historical)
  expect(errors).toEqual([])
})

test('stale cooperating tabs keep both new scores and every historical observation', async ({ page, context }) => {
  await seed(page)
  await page.goto('/')
  const second = await context.newPage()
  await second.goto('/')
  for (const target of [page, second]) {
    await target.getByRole('button', { name: 'Start', exact: true }).click()
    await target.getByRole('textbox').first().fill('0')
  }
  await Promise.all([page.keyboard.press('Shift+Enter'), second.keyboard.press('Shift+Enter')])
  for (const target of [page, second]) await expect(target.getByRole('region', { name: 'Round result' })).toBeVisible()
  const saved = await scores(page)
  expect(saved).toHaveLength(historical.length + 2)
  expect(saved.slice(0, historical.length)).toEqual(historical)
  expect(new Set(saved.map((score: { id: string }) => score.id)).size).toBe(saved.length)
  await clientLegacy(page)
  await expect(page.getByRole('table', { name: 'Score history', exact: true }).locator('tbody tr')).toHaveCount(5)
  await second.close()
})

test('cancelled and empty runs do not save, and synchronous repeated submission saves once', async ({ page }) => {
  await seed(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.keyboard.press('Shift+Enter')
  await page.getByRole('textbox').first().fill('1e2')
  await expect(page.getByRole('textbox').first()).toHaveValue('')
  await page.getByRole('textbox').first().fill('0')
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(values['times-tables.scores'])
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('1')
  await page.getByRole('textbox').first().evaluate(node => {
    let count = 0
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) { if (key === 'times-tables.scores') count++; return original.call(this, key, value) }
    Object.assign(window, { scoreWrites: () => count })
    for (let i = 0; i < 3; i++) node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
  })
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  const saved = await scores(page)
  expect(saved).toHaveLength(historical.length + 1)
  expect(saved.slice(0, historical.length)).toEqual(historical)
  expect(await page.evaluate(() => (window as unknown as { scoreWrites: () => number }).scoreWrites())).toBe(1)
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('times-tables.scores.intent.')).length)).toBe(1)
})

test('main navigation no longer exposes Calculations', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link')).toHaveText(['Practice', 'Stats', 'About', 'Settings'])
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Stats settings' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Run statistics' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Score history' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Stats views' })).toHaveCount(0)
  await expect(page.getByText(/Incorrect calculations|Slow calculations|Detail coverage|Timing coverage/)).toHaveCount(0)
})
