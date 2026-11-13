import { expect, type Page } from '@playwright/test'

export async function chooseGridSize(page: Page, size: number) {
  const trigger = page.getByRole('button', { name: 'Grid size', exact: true })
  await trigger.click()
  await page.getByRole('dialog', { name: 'Grid size options', exact: true })
    .getByRole('button', { name: `${size} × ${size}`, exact: true }).click()
  await expect(trigger).toHaveText(`${size} × ${size}`)
  await expect(page.getByRole('dialog', { name: 'Grid size options', exact: true })).toHaveCount(0)
  await expect(trigger).toBeFocused()
}
