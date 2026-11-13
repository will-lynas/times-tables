import { expect, test } from '@playwright/test'

for (const width of [1024, 1440]) {
  for (const appearance of ['dark', 'light']) {
    test(`compact unbranded header at ${width}px in ${appearance} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.addInitScript(theme => localStorage.setItem('times-tables.theme', theme), appearance)
      await page.goto('/')
      await expect(page).toHaveTitle('Times tables')
      const heading = page.getByRole('heading', { name: 'Times tables', exact: true })
      await expect(heading).toHaveCount(1)
      const headingBox = (await heading.boundingBox())!
      expect(headingBox.width).toBeLessThanOrEqual(1)
      expect(headingBox.height).toBeLessThanOrEqual(1)
      const header = page.locator('.page-header')
      await expect(header).toHaveText('PracticeStatsAbout')
      const nav = page.getByRole('navigation', { name: 'Main' })
      await expect(nav).toBeVisible()
      const headerBox = (await header.boundingBox())!
      const navBox = (await nav.boundingBox())!
      expect(headerBox.y).toBeLessThanOrEqual(24)
      expect(headerBox.height).toBeLessThanOrEqual(40)
      expect(navBox.x).toBeCloseTo(headerBox.x, 0)
      expect((await page.getByRole('region', { name: 'Round controls' }).boundingBox())!.y).toBeLessThanOrEqual(80)
      await expect(page.getByRole('button', { name: 'Grid size', exact: true })).toBeVisible()
      const nextTheme = appearance === 'dark' ? 'light' : 'dark'
      await page.getByRole('button', { name: `Switch to ${nextTheme} mode` }).click()
      await expect(page.getByRole('button', { name: `Switch to ${appearance} mode` })).toBeVisible()
      await nav.getByRole('link', { name: 'Stats', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Progress', exact: true })).toBeVisible()
      await expect(header).toHaveText('PracticeStatsAbout')
      await nav.getByRole('link', { name: 'Practice', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
    })
  }
}
