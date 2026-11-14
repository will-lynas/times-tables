import { expect, test, type Page } from '@playwright/test'
import { chooseGridSize } from './helpers'

const finish = (page: Page) => page.getByRole('button', { name: /^Finish/, includeHidden: true })

async function ready(page: Page) {
  await page.goto('/')
  await chooseGridSize(page, 2)
  await page.getByRole('radio', { name: 'Ordered', exact: true }).click()
}

test('renders Finish only for an active visible Practice run', async ({ page }) => {
  await ready(page)
  await expect(finish(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Start', exact: true }).press('Enter')
  await expect(finish(page)).toBeVisible()
  await expect(finish(page)).toBeDisabled()
  const cells = page.getByRole('textbox')
  await cells.first().press('Shift+Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toHaveCount(0)
  await cells.first().fill('1')
  await expect(finish(page)).toHaveText('Finish early')
  await expect(finish(page)).toBeEnabled()
  for (const route of ['Stats', 'Settings', 'About']) {
    await page.getByRole('link', { name: route, exact: true }).click()
    await expect(finish(page)).toHaveCount(0)
    await page.keyboard.press('Shift+Enter')
    await page.getByRole('link', { name: 'Practice', exact: true }).click()
    await expect(cells.first()).toHaveValue('1')
    await expect(finish(page)).toBeEnabled()
  }
  await cells.first().fill('')
  await expect(finish(page)).toBeDisabled()
  await cells.first().fill('1')
  await finish(page).press('Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  await expect(finish(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'New round', exact: true }).click()
  await expect(finish(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  for (const [index, answer] of ['1', '2', '2', '4'].entries()) await cells.nth(index).fill(answer)
  await expect(finish(page)).toHaveText('Finish')
  await expect(page.getByRole('region', { name: 'Round result' })).toHaveCount(0)
  await cells.last().press('Shift+Enter')
  await expect(page.getByRole('heading', { name: 'Round complete', exact: true })).toBeVisible()
  await expect(finish(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'New round', exact: true }).click()
  for (const cancel of ['button', 'escape']) {
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await cells.first().fill('0')
    if (cancel === 'button') await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    else await cells.first().press('Escape')
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeFocused()
    await expect(finish(page)).toHaveCount(0)
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores')!).scores.length)).toBe(2)
})

test('removes Finish during a blocked save and retains failure feedback and reset', async ({ page, context }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('0')
  const holder = await context.newPage()
  await holder.goto('/')
  await holder.evaluate(async () => {
    await new Promise<void>(acquired => {
      void navigator.locks.request('times-tables.scores', () => new Promise<void>(release => {
        Object.assign(window, { releaseScoreLock: release })
        acquired()
      }))
    })
  })
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'times-tables.scores') throw new DOMException('Storage full', 'QuotaExceededError')
      original.call(this, key, value)
    }
  })
  await finish(page).click()
  await expect(finish(page)).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Round result' })).toHaveCount(0)
  await page.keyboard.press('Shift+Enter')
  await holder.close()
  await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText(/could not|unable|not saved|full/i)
  await expect(page.getByRole('textbox').first()).toHaveValue('0')
  await expect(finish(page)).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBeNull()
  await page.getByRole('button', { name: 'New round', exact: true }).press('Enter')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeFocused()
  await expect(finish(page)).toHaveCount(0)
})

for (const theme of ['dark', 'light']) for (const width of [1024, 1440]) {
  test(`Finish visibility in ${theme} at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await ready(page)
    if (theme === 'light') await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click()
    await expect(page.locator('.radix-themes')).toHaveClass(new RegExp(theme))
    await expect(finish(page)).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('ready.png'), fullPage: true })
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(finish(page)).toBeVisible()
    await expect(finish(page)).toBeDisabled()
    await page.screenshot({ path: testInfo.outputPath('active-empty.png'), fullPage: true })
    await page.getByRole('textbox').first().fill('0')
    await expect(finish(page)).toBeEnabled()
    await page.screenshot({ path: testInfo.outputPath('active-answered.png'), fullPage: true })
    await finish(page).click()
    await expect(page.getByRole('region', { name: 'Round result' })).toBeVisible()
    await expect(finish(page)).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('finished.png'), fullPage: true })
  })
}
