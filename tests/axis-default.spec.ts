import { expect, test } from '@playwright/test'

for (const source of [null, '{"mode":"ordered","size":2}', '{"version":1,"mode":"ordered","size":2,"factors":[2,7]}']) {
  test(`Runs is the left default without rewriting absent/legacy axis preferences: ${source}`, async ({ page }) => {
    await page.goto('/')
    if (source !== null) await page.evaluate(source => localStorage.setItem('times-tables.progress', source), source)
    await page.goto('/stats')
    const axis = page.getByRole('group', { name: 'Graph x-axis', exact: true })
    await expect(axis.getByRole('button')).toHaveText(['Runs', 'Time'])
    await expect(axis.getByRole('button', { name: 'Runs', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => localStorage.getItem('times-tables.progress'))).toBe(source)
    await axis.getByRole('button', { name: 'Time', exact: true }).click()
    await page.reload()
    await expect(axis.getByRole('button', { name: 'Time', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.progress')!).axisMode)).toBe('time')
  })
}
