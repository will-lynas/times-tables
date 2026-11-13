import { expect, type Page } from '@playwright/test'

export async function showStats(page: Page) {
  const link = page.getByRole('link', { name: 'Stats', exact: true })
  if (await link.getAttribute('aria-current') !== 'page') await link.click()
  await expect(link).toHaveAttribute('aria-current', 'page')
}

export async function showPractice(page: Page) {
  const link = page.getByRole('link', { name: 'Practice', exact: true })
  if (await link.getAttribute('aria-current') !== 'page') await link.click()
  await expect(link).toHaveAttribute('aria-current', 'page')
}

export async function chooseGridSize(page: Page, size: number) {
  const trigger = page.getByRole('button', { name: 'Grid size', exact: true })
  await trigger.click()
  const presets = page.getByRole('button', { name: 'Presets', exact: true })
  if (await presets.isVisible()) await presets.click()
  await page.getByRole('dialog', { name: 'Grid size options', exact: true })
    .getByRole('button', { name: `${size} × ${size}`, exact: true }).click()
  await expect(trigger).toHaveText(`${size} × ${size}`)
  await expect(page.getByRole('dialog', { name: 'Grid size options', exact: true })).toHaveCount(0)
  await expect(trigger).toBeFocused()
}
