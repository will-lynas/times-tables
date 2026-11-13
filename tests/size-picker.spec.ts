import { expect, test } from '@playwright/test'
import { chooseGridSize } from './helpers'

// These also guard the existing Radix dismissal and gameplay lock behavior.
test('supports Tab and outside dismissal, then stays locked until the round resets', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Grid size', exact: true })
  const panel = page.getByRole('dialog', { name: 'Grid size options', exact: true })
  await expect(trigger).toHaveAccessibleDescription('12 × 12')
  await trigger.press('Enter')
  await page.keyboard.press('Shift+Tab')
  await expect(panel.getByRole('button', { name: '11 × 11', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(panel.getByRole('button', { name: '12 × 12', exact: true })).toBeFocused()
  await page.getByRole('heading', { name: 'Times tables', exact: true }).click()
  await expect(panel).toHaveCount(0)
  await expect(trigger).toHaveText('12 × 12')
  await chooseGridSize(page, 2)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(trigger).toBeDisabled()
  await page.getByRole('textbox').first().fill('1')
  await page.getByRole('button', { name: 'Finish early', exact: true }).click()
  await expect(trigger).toBeDisabled()
  await expect(panel).toHaveCount(0)
  await page.getByRole('button', { name: 'New round', exact: true }).click()
  await expect(trigger).toBeEnabled()
  await chooseGridSize(page, 3)
  await expect(page.getByRole('textbox')).toHaveCount(9)
})

for (const key of ['Enter', 'Space']) {
  test(`${key} opens and chooses a size without starting a round; arrows follow the option grid`, async ({ page }) => {
    await page.goto('/')
    const trigger = page.getByRole('button', { name: 'Grid size', exact: true })
    const panel = page.getByRole('dialog', { name: 'Grid size options', exact: true })
    await trigger.focus()
    await page.keyboard.press(key)
    await expect(panel.getByRole('button', { name: '12 × 12', exact: true })).toBeFocused()
    for (const [key, size] of [['Home', 2], ['ArrowDown', 5], ['ArrowRight', 6], ['ArrowUp', 3], ['End', 12], ['ArrowLeft', 11]] as const) {
      await page.keyboard.press(key)
      await expect(panel.getByRole('button', { name: `${size} × ${size}`, exact: true })).toBeFocused()
    }
    await page.keyboard.press(key)
    await expect(panel).toHaveCount(0)
    await expect(trigger).toHaveText('11 × 11')
    await expect(trigger).toBeFocused()
    await expect(page.getByRole('textbox').first()).toBeDisabled()
    await expect(page.getByRole('timer')).toHaveText('0:00.0')
    await expect(page.getByRole('region', { name: 'Round result' })).toHaveCount(0)
    await page.keyboard.press(key)
    await page.keyboard.press('Home')
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveText('11 × 11')
    await expect(page.getByRole('textbox').first()).toBeDisabled()
  })
}

for (const width of [1024, 1440]) {
  for (const theme of ['dark', 'light']) {
    test(`shows all sizes in a compact square-ish panel at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/')
      if (theme === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click()
      const trigger = page.getByRole('button', { name: 'Grid size', exact: true })
      await expect(trigger).toHaveText('12 × 12')
      await trigger.click()
      const panel = page.getByRole('dialog', { name: 'Grid size options', exact: true })
      const options = panel.getByRole('button')
      await expect(options).toHaveText(Array.from({ length: 11 }, (_, index) => `${index + 2} × ${index + 2}`))
      await expect(panel.getByRole('button', { name: '12 × 12', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(panel.getByRole('button', { name: '12 × 12', exact: true })).toBeFocused()
      const geometry = await panel.evaluate(element => {
        const box = element.getBoundingClientRect()
        return { width: box.width, height: box.height, scroll: element.scrollHeight > element.clientHeight,
          x: box.x, y: box.y, bottom: box.bottom, right: box.right }
      })
      expect(geometry.scroll).toBe(false)
      expect(geometry.width / geometry.height).toBeGreaterThan(0.8)
      expect(geometry.width / geometry.height).toBeLessThan(1.3)
      expect(geometry.width).toBeLessThan(300)
      expect(geometry.x).toBeGreaterThanOrEqual(0)
      expect(geometry.y).toBeGreaterThanOrEqual(0)
      expect(geometry.bottom).toBeLessThanOrEqual(800)
      expect(geometry.right).toBeLessThanOrEqual(width)
      for (const option of await options.all()) {
        await expect(option).toBeInViewport({ ratio: 1 })
        const box = (await option.boundingBox())!
        expect(box.height).toBeGreaterThanOrEqual(40)
      }
      await page.screenshot({ path: `artifacts/size-picker-${theme}-${width}.png` })
      await panel.getByRole('button', { name: '7 × 7', exact: true }).click()
      await expect(panel).toHaveCount(0)
      await expect(trigger).toHaveText('7 × 7')
      await expect(trigger).toBeFocused()
      await expect(page.getByRole('textbox')).toHaveCount(49)
      await expect(page.getByRole('textbox').first()).toBeDisabled()
      await trigger.click()
      await expect(panel.getByRole('button', { name: '7 × 7', exact: true })).toHaveAttribute('aria-pressed', 'true')
    })
  }
}
