import { expect, test } from '@playwright/test'

test('Escape cancels an active round without saving and allows a fresh keyboard start', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await page.keyboard.press('Enter')
  await page.getByRole('textbox').first().fill('42')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText('0:00.0')
  await expect(page.getByRole('textbox').first()).toHaveValue('')
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBeNull()
  await page.keyboard.press('Space')
  await expect(page.getByRole('textbox').first()).toBeFocused()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
})
