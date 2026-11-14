import { expect, test } from '@playwright/test'
import { SCORE_KEY } from '../src/scores'
import { chooseGridSize } from './helpers'

test('Space advances across the grid without changing answers or finishing at the last cell', async ({ page }) => {
  await page.goto('/')
  await chooseGridSize(page, 2)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const cells = page.getByRole('textbox')
  await cells.first().press('Space')
  await expect(cells.nth(1)).toBeFocused()
  await expect(cells.first()).toHaveValue('')
  for (const [index, answer] of ['1', '2', '2', '4'].entries()) {
    await cells.nth(index).fill(answer)
    await cells.nth(index).press('Space')
    await expect(cells.nth(Math.min(index + 1, 3))).toBeFocused()
    await expect(cells.nth(index)).toHaveValue(answer)
  }
  await expect(page.getByRole('region', { name: 'Round result' })).toHaveCount(0)
  expect(await page.evaluate(key => localStorage.getItem(key), SCORE_KEY)).toBeNull()
  await cells.last().press('Enter')
  await expect(cells.last()).toBeFocused()
  await expect(cells.last()).not.toHaveAttribute('readonly')
  await cells.last().press('Shift+Enter')
  await expect(page.getByRole('heading', { name: 'Round complete', exact: true })).toBeVisible()
})
