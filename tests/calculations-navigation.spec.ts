import { expect, test } from '@playwright/test'
import { chooseFilter } from './helpers'

test('Calculations is a top-level destination with canonical direct loads and history', async ({ page }) => {
  await page.goto('/calculations')
  const main = page.getByRole('navigation', { name: 'Main', exact: true })
  await expect(main.getByRole('link')).toHaveText(['Practice', 'Stats', 'Calculations', 'About', 'Settings'])
  const calculations = main.getByRole('link', { name: 'Calculations', exact: true })
  await expect(calculations).toHaveAttribute('href', '/calculations')
  await expect(calculations).toHaveAttribute('aria-current', 'page')
  await expect(main.getByRole('link', { name: 'Stats', exact: true })).not.toHaveAttribute('aria-current')
  await expect(page.getByRole('heading', { name: 'Incorrect calculations' })).toBeVisible()
  await page.reload()
  await expect(calculations).toHaveAttribute('aria-current', 'page')
  await main.getByRole('link', { name: 'Stats', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Score history' })).toBeVisible()
  await calculations.click()
  await expect(page).toHaveURL(/\/calculations$/)
  await page.goBack()
  await expect(main.getByRole('link', { name: 'Stats', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.goForward()
  await expect(calculations).toHaveAttribute('aria-current', 'page')
})

for (const path of ['/calculations', '/stats/calculations']) test(`${path} has its own layout without Stats controls`, async ({ page }) => {
  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'Incorrect calculations' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Stats settings' })).toHaveCount(0)
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'Ordered', exact: true })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Stats views' })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Calculations', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('radio', { name: 'Times', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Slow calculations' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Stats settings' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Incorrect calculations' })).toBeVisible()
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Stats settings' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Stats size', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Run statistics' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Score history' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Stats views' })).toHaveCount(0)
})

test('browsing both calculation routes preserves every storage byte and exact Stats selection', async ({ page }) => {
  const values = {
    'times-tables.scores': ' {"version":4,"scores":[{"id":"legacy","mode":"ordered","size":2,"factors":[1,2],"status":"complete","attempted":4,"correct":4,"total":4,"elapsedMs":1000,"completedAt":"2026-01-01T00:00:00Z","unknown":{"keep":[1,2]}}],"unknown":"retain"}\n',
    'times-tables.settings': '{"version":1,"mode":"ordered","size":2,"unknown":{"keep":true}}',
    'times-tables.progress': '{"version":1,"axisMode":"time","unknown":["preserve"]}',
    'times-tables.theme': 'dark',
    'times-tables.run-tracking': '{"version":1,"incomplete":true,"unknown":"retain"}',
  }
  await page.addInitScript(values => {
    if (!localStorage.getItem('times-tables.settings')) for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value)
  }, values)
  const snapshot = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  await page.goto('/calculations')
  await page.getByRole('radio', { name: 'Times', exact: true }).click()
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Score history', exact: true }).locator('tbody tr')).toHaveCount(1)
  await expect(page.getByRole('combobox', { name: 'Stats size', exact: true })).toHaveAttribute('data-value', '2')
  await page.getByRole('link', { name: 'Calculations', exact: true }).click()
  await page.goto('/stats/calculations')
  await page.reload()
  expect(await snapshot()).toEqual(values)
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await chooseFilter(page.getByRole('combobox', { name: 'Stats size', exact: true }), '3')
  await expect(page.getByRole('table', { name: 'Score history', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Calculations', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(values['times-tables.scores'])
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.settings')!).unknown)).toEqual({ keep: true })
})

test('top-level Calculations keeps active answers and whole-round time but pauses cell collection', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { navigationNow: 100 })
    performance.now = () => (window as unknown as { navigationNow: number }).navigationNow
    document.hasFocus = () => true
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible' })
    localStorage.setItem('times-tables.settings', '{"version":1,"mode":"ordered","size":2}')
  })
  const at = async (now: number) => page.evaluate(now => Object.assign(window, { navigationNow: now }), now)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await at(400)
  await page.getByRole('textbox').first().fill('1')
  await at(700)
  await page.getByRole('link', { name: 'Calculations', exact: true }).click()
  await expect(page.getByRole('button', { name: /Finish/ })).toHaveCount(0)
  await page.getByRole('radio', { name: 'Times', exact: true }).click()
  await page.locator('body').click({ position: { x: 2, y: 2 } })
  for (const key of ['7', 'Shift+Enter', 'Escape']) await page.keyboard.press(key)
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBeNull()
  await at(5700)
  await page.goBack()
  await expect(page.getByRole('textbox').first()).toHaveValue('1')
  await page.getByRole('textbox').first().focus()
  await at(5900)
  await page.getByRole('textbox').first().fill('01')
  await at(6000)
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  const score = await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores')!).scores[0])
  expect(score.elapsedMs).toBe(5900)
  expect(score.calculations.timing.cells[0]).toEqual({ index: 0, answerEntryMs: 800, focusedMs: 900, visits: 2, edits: 2 })
})
