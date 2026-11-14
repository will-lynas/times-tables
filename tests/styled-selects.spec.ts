import { expect, test } from '@playwright/test'
import { chooseFilter } from './helpers'

for (const appearance of ['dark', 'light']) for (const width of [1024, 1440]) {
  test(`bounded readable custom-set menus in ${appearance} at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.addInitScript(({ appearance }) => {
      localStorage.setItem('times-tables.theme', appearance)
      const sets = Array.from({ length: 36 }, (_, index) => Array.from({ length: 20 }, (_, i) => i + 1).filter(value => value !== index % 20 + 1 && value !== Math.floor(index / 20) + 2))
      localStorage.setItem('times-tables.scores', JSON.stringify({ version: 4, scores: sets.map((factors, index) => ({ id: `set-${index}`, factors, mode: 'ordered', size: factors.length, total: factors.length ** 2, correct: 1, attempted: 1, status: 'partial', elapsedMs: 1000, completedAt: '2026-01-01T00:00:00Z' })) }))
    }, { appearance })
    await page.goto('/stats')
    for (const name of names) {
      const trigger = page.getByRole('combobox', { name, exact: true })
      await trigger.click()
      const panel = page.getByRole('listbox', { name: `${name} options`, exact: true })
      await expect(panel).toBeVisible()
      await expect(panel).toBeInViewport({ ratio: 1 })
      const box = await panel.boundingBox()
      expect(box!.height).toBeLessThanOrEqual(420)
      await page.screenshot({ path: info.outputPath(`${name.replaceAll(' ', '-')}.png`), fullPage: false })
      if (name.endsWith('size')) {
        const last = panel.getByRole('option').last()
        await page.keyboard.press('End')
        await expect(last).toBeFocused()
        await expect(last).toBeInViewport({ ratio: 1 })
        const geometry = await last.evaluate(element => ({ height: element.getBoundingClientRect().height, clipped: element.scrollWidth > element.clientWidth, whiteSpace: getComputedStyle(element).whiteSpace }))
        expect(geometry.clipped).toBe(false)
        expect(geometry.whiteSpace).toBe('normal')
        expect(geometry.height).toBeGreaterThan(36)
        await page.screenshot({ path: info.outputPath(`${name.replaceAll(' ', '-')}-scrolled.png`), fullPage: false })
      }
      await page.keyboard.press('Escape')
      await expect(panel).toHaveCount(0)
      await expect(trigger).toBeFocused()
    }
    const score = page.getByRole('combobox', { name: 'Score size', exact: true })
    await chooseFilter(score, '2')
    await chooseFilter(score, 'all')
    await expect(score).toHaveAttribute('data-value', 'all')
    await page.reload()
    await expect(score).toHaveAttribute('data-value', 'all')
    await expect(page.locator('select:visible')).toHaveCount(0)
  })
}


const names = ['Score order', 'Score size', 'Progress order', 'Progress size']

test('keyboard selection and Tab dismissal preserve independent persisted values without playing a round', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('1')
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  const choices = ['ordered', '2', 'shuffled', '12']
  for (const [index, name] of names.entries()) {
    const trigger = page.getByRole('combobox', { name, exact: true })
    await trigger.focus()
    await page.keyboard.press(index % 2 ? 'Space' : 'Enter')
    const panel = page.getByRole('listbox', { name: `${name} options`, exact: true })
    await expect(panel).toBeVisible()
    await page.keyboard.press('End')
    await expect(panel.getByRole('option').last()).toBeFocused()
    await page.keyboard.press('Home')
    await expect(panel.getByRole('option').first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(panel.getByRole('option').nth(1)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(panel.getByRole('option').first()).toBeFocused()
    if (name === 'Progress order') {
      await page.keyboard.type('shu')
      await expect(panel.getByRole('option', { name: 'Shuffled', exact: true })).toBeFocused()
    }
    else if (name === 'Progress size') await page.keyboard.press('End')
    else await page.keyboard.press('ArrowDown')
    await expect(panel.locator(`[role="option"][data-value="${choices[index]}"]`)).toBeFocused()
    await page.keyboard.press(index % 2 ? 'Space' : 'Enter')
    await expect(panel).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('data-value', choices[index])
    await trigger.press('Enter')
    await expect(panel).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(panel).toHaveCount(0)
    if (name === 'Score size') await expect(page.getByRole('region', { name: 'Run statistics', exact: true }).locator('dd').first()).toBeFocused()
    else if (index < names.length - 1) await expect(page.getByRole('combobox', { name: names[index + 1], exact: true })).toBeFocused()
    else await expect(page.getByRole('link', { name: 'Practice', exact: true })).toBeFocused()
    await trigger.press('Enter')
    await expect(panel).toBeVisible()
    await page.keyboard.press('Shift+Tab')
    await expect(panel).toHaveCount(0)
    if (name === 'Progress order') await expect(page.getByRole('button', { name: 'Runs', exact: true })).toBeFocused()
    else if (index > 0) await expect(page.getByRole('combobox', { name: names[index - 1], exact: true })).toBeFocused()
    else await expect(page.getByRole('button', { name: 'Switch to light mode', exact: true })).toBeFocused()
  }
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBeNull()
  await page.getByRole('link', { name: 'Practice', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox').first()).toHaveValue('1')
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await page.reload()
  for (const [index, name] of names.entries()) await expect(page.getByRole('combobox', { name, exact: true })).toHaveAttribute('data-value', choices[index])
})
test('all four filters use styled accessible option panels, not native selects', async ({ page }) => {
  await page.goto('/stats')
  await expect(page.locator('.score-heading')).toHaveText('Score history')
  await expect(page.getByRole('combobox', { name: 'Score order', exact: true })).toHaveAttribute('data-value', 'all')
  await expect(page.getByRole('combobox', { name: 'Score size', exact: true })).toHaveAttribute('data-value', 'all')
  for (const name of names) {
    const trigger = page.getByRole('combobox', { name, exact: true })
    await expect(trigger).toHaveJSProperty('tagName', 'BUTTON')
    await trigger.click()
    const panel = page.getByRole('listbox', { name: `${name} options`, exact: true })
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('option').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(trigger).toBeFocused()
  }
  await expect(page.locator('select:visible')).toHaveCount(0)
})
