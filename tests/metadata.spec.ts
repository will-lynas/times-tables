import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const site = 'https://times-tables.lynas.dev/'

test('delivers consistent static metadata on direct application routes', async ({ page }) => {
  for (const route of ['/', '/stats', '/settings', '/about']) {
    const response = await page.goto(route)
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle('Times tables')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', site)
    const description = await page.locator('meta[name="description"]').getAttribute('content')
    expect(description).toContain('preset grids or custom factors')
    expect(description).not.toContain('12 × 12')
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', site)
    for (const name of ['title', 'description', 'image', 'image:alt']) {
      expect(await page.locator(`meta[name="twitter:${name}"]`).getAttribute('content'))
        .toBe(await page.locator(`meta[property="og:${name}"]`).getAttribute('content'))
    }
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
  }
})

test('serves the exact public PNG with declared dimensions', async ({ page, request }) => {
  const response = await request.get('/social-preview.png')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('image/png')
  expect(await response.body()).toEqual(readFileSync('public/social-preview.png'))
  await page.goto('/')
  const size = await page.evaluate(async () => {
    const image = new Image()
    image.src = '/social-preview.png'
    await image.decode()
    return [image.naturalWidth, image.naturalHeight]
  })
  expect(size).toEqual([1200, 630])
})
