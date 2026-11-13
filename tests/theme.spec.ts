import { expect, test } from '@playwright/test'

test('defaults to dark and remembers a light-mode choice without interrupting a round', async ({ page }) => {
  await page.goto('/')
  const theme = page.locator('.radix-themes')
  await expect(theme).toHaveClass(/dark/)
  await expect(theme).toHaveCSS('color-scheme', 'dark')
  const darkBackground = await theme.evaluate(element => getComputedStyle(element).backgroundColor)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('42')
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(theme).toHaveClass(/light/)
  await expect(theme).toHaveCSS('color-scheme', 'light')
  expect(await theme.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(darkBackground)
  await expect(page.getByRole('textbox').first()).toHaveValue('42')
  await expect(page.getByRole('timer')).not.toHaveText('0:00.0')
  const elapsed = await page.getByRole('timer').innerText()
  await expect(page.getByRole('timer')).not.toHaveText(elapsed)
  await page.reload()
  await expect(theme).toHaveClass(/light/)
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await page.reload()
  await expect(theme).toHaveClass(/dark/)
})

test('invalid saved theme falls back to dark', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('times-tables.theme', 'invalid'))
  await page.goto('/')
  await expect(page.locator('.radix-themes')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('.radix-themes')).toHaveClass(/light/)
})

test('denied storage still allows theme changes and a playable round', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', {
    get() { throw new DOMException('Blocked', 'SecurityError') },
  }))
  await page.goto('/')
  await expect(page.locator('.radix-themes')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('.radix-themes')).toHaveClass(/light/)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('42')
  await expect(page.getByRole('textbox').first()).toHaveValue('42')
  await page.reload()
  await expect(page.locator('.radix-themes')).toHaveClass(/dark/)
})

test('answers, muted text and warnings stay readable in both themes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('times-tables.scores', '{broken'))
  await page.goto('/')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  for (const appearance of ['dark', 'light']) {
    await expect(page.locator('.radix-themes')).toHaveClass(new RegExp(appearance))
    const contrasts = await page.evaluate(() => {
      function luminance(color: string) {
        const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
          const s = value / 255
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        })
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
      }
      return ['.answer-grid input', '.page-header p', '.storage-warning'].map(selector => {
        const element = document.querySelector(selector)!
        let ancestor: Element | null = element
        let background = 'rgba(0, 0, 0, 0)'
        while (ancestor && background === 'rgba(0, 0, 0, 0)') {
          background = getComputedStyle(ancestor).backgroundColor
          ancestor = ancestor.parentElement
        }
        const a = luminance(getComputedStyle(element).color)
        const b = luminance(background)
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      })
    })
    for (const contrast of contrasts) expect(contrast).toBeGreaterThanOrEqual(4.5)
    if (appearance === 'dark') await page.getByRole('button', { name: 'Switch to light mode' }).click()
  }
})
