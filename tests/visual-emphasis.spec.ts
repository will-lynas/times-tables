import { expect, test } from '@playwright/test'

for (const palette of ['dark', 'light'] as const) {
  test(`only truly perfect completed rows retain primary emphasis in ${palette}`, async ({ page }, info) => {
    await page.addInitScript(palette => {
      if (localStorage.getItem('times-tables.scores')) return
      localStorage.setItem('times-tables.theme', palette)
      localStorage.setItem('times-tables.settings', JSON.stringify({ mode: 'ordered', size: 2, scoreMode: 'all', scoreSize: 'all' }))
      const complete = { mode: 'ordered', status: 'complete', size: 2, total: 4, attempted: 4, elapsedMs: 12000 }
      localStorage.setItem('times-tables.scores', JSON.stringify({ version: 3, scores: [
        { ...complete, id: 'perfect', correct: 4, completedAt: '2026-01-02T12:00:00Z' },
        { ...complete, id: 'latest', correct: 3, completedAt: '2026-01-04T12:00:00Z' },
        { ...complete, id: 'large', mode: 'shuffled', size: 12, total: 144, attempted: 144, correct: 143, completedAt: '2026-01-03T12:00:00Z' },
        { ...complete, id: 'older', size: 3, total: 9, attempted: 9, correct: 9, completedAt: '2026-01-01T12:00:00Z' },
        { ...complete, id: 'partial', status: 'partial', attempted: 1, correct: 1, elapsedMs: 100, completedAt: '2026-01-05T12:00:00Z' },
      ] }))
    }, palette)
    await page.goto('/')
    const complete = page.getByRole('table', { name: 'Score history', exact: true })
    const rows = complete.locator('tbody tr')
    await expect(rows).toHaveCount(5)
    await expect(rows.nth(0).getByRole('cell')).toHaveText(['Partial', 'Ordered', '2 × 2', '1 / 4', '1 / 1', '100%', '0:00.1'])
    await expect(rows.nth(1)).toContainText('3 / 4')
    await expect(rows.nth(2)).toContainText('143 / 144')
    await expect(rows.nth(3)).toContainText('4 / 4')
    await expect(rows.nth(4)).toContainText('9 / 9')
    for (let index = 0; index < 5; index++) {
      await expect(rows.nth(index)).toHaveAttribute('data-perfect', String(index >= 3))
    }
    await expect(page.getByRole('heading', { name: 'Partial results', exact: true })).toHaveCount(0)
    await expect(page.locator('.score-table')).toHaveCount(1)
    const contrast = await complete.evaluate(table => {
      const theme = table.closest('.radix-themes')!
      const probe = document.createElement('span')
      theme.append(probe)
      const token = (name: string) => {
        probe.style.color = `var(${name})`
        return getComputedStyle(probe).color
      }
      const primary = token('--gray-12')
      const muted = token('--gray-11')
      const background = token('--color-background')
      probe.remove()
      const luminance = (color: string) => {
        const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map(value => {
          const channel = Number(value) / 255
          return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
        })
        return .2126 * r + .7152 * g + .0722 * b
      }
      const bg = luminance(background)
      return { primary, muted, rows: Array.from(table.querySelectorAll('tbody tr')).map(row => {
        const colors = Array.from(row.querySelectorAll('td')).map(cell => getComputedStyle(cell).color)
        return { colors, ratios: colors.map(color => {
          const fg = luminance(color)
          return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05)
        }) }
      }) }
    })
    expect(contrast.muted).not.toBe(contrast.primary)
    for (const [index, row] of contrast.rows.entries()) {
      expect(row.colors.every(color => color === (index < 3 ? contrast.muted : contrast.primary))).toBe(true)
      expect(Math.min(...row.ratios)).toBeGreaterThanOrEqual(4.5)
    }
    const partial = rows.filter({ has: page.getByRole('cell', { name: 'Partial', exact: true }) })
    await expect(partial).toContainText('100%')
    await expect(partial).toHaveAttribute('data-perfect', 'false')
    await expect(page.locator('.score-heading')).toContainText('Fastest perfect: 0:12.0')
    await page.screenshot({ path: info.outputPath('mixed-history.png'), fullPage: true })
    await page.getByRole('combobox', { name: 'Score order', exact: true }).selectOption('shuffled')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('143 / 144')
    await page.getByRole('combobox', { name: 'Score order', exact: true }).selectOption('all')
    await page.getByRole('combobox', { name: 'Score size', exact: true }).selectOption('2')
    await expect(rows).toHaveCount(3)
    await expect(rows.first()).toContainText('Partial')
    await expect(rows.nth(1)).toContainText('3 / 4')
    await expect(rows.last()).toContainText('4 / 4')
    const stored = await page.evaluate(() => localStorage.getItem('times-tables.scores'))
    await page.reload()
    await expect(page.getByRole('combobox', { name: 'Score order', exact: true })).toHaveValue('all')
    await expect(page.getByRole('combobox', { name: 'Score size', exact: true })).toHaveValue('2')
    await expect(rows).toHaveCount(3)
    await expect(partial).toHaveAttribute('data-perfect', 'false')
    await expect(page.locator('.score-heading')).toContainText('Fastest perfect: 0:12.0')
    expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(stored)
  })
}

for (const palette of ['dark', 'light'] as const) {
  for (const size of [2, 12]) {
    test(`${size} × ${size} numerals scale with cells without clipping in ${palette}`, async ({ page }, info) => {
      await page.addInitScript(({ palette, size }) => {
        localStorage.setItem('times-tables.theme', palette)
        localStorage.setItem('times-tables.settings', JSON.stringify({ mode: 'ordered', size, scoreMode: 'all', scoreSize: 'all' }))
      }, { palette, size })
      await page.goto('/')
      await page.getByRole('button', { name: 'Start', exact: true }).click()
      const answers = page.getByRole('textbox')
      await answers.first().fill('1')
      await answers.last().fill(String(size * size))
      const active = await page.locator('.answer-grid').evaluate(table => {
        const header = table.querySelector('th')!
        const input = table.querySelector('input')!
        const rect = table.getBoundingClientRect()
        return { header: parseFloat(getComputedStyle(header).fontSize), answer: parseFloat(getComputedStyle(input).fontSize), width: rect.width, height: rect.height }
      })
      expect(active.header).toBeGreaterThanOrEqual(size === 2 ? 31 : 16)
      expect(active.answer).toBeGreaterThanOrEqual(size === 2 ? 35 : 18)
      expect(Math.abs(active.width - active.height)).toBeLessThan(3)
      expect(active.width).toBe(size === 2 ? 300 : 624)
      await page.screenshot({ path: info.outputPath('active.png'), fullPage: true })
      await answers.last().fill('999')
      await page.getByRole('button', { name: /Finish/ }).click()
      await expect(answers.last()).toHaveAccessibleDescription(`Incorrect. Correct: ${size * size}`)
      const fit = await answers.last().evaluate(element => {
        const input = element as HTMLInputElement
        const style = getComputedStyle(input)
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')!
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
        const glyphs = context.measureText(input.value)
        const box = input.getBoundingClientRect()
        const cell = input.parentElement!.getBoundingClientRect()
        const correction = input.parentElement!.querySelector('.answer-correction')!
        const rects = Array.from(correction.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).flatMap(node => {
          const range = document.createRange()
          range.selectNodeContents(node)
          return Array.from(range.getClientRects()).map(rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }))
        })
        return { glyphWidth: glyphs.width, glyphHeight: glyphs.actualBoundingBoxAscent + glyphs.actualBoundingBoxDescent,
          availableWidth: box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth),
          availableHeight: box.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth),
          inputBottom: box.bottom, cell: { left: cell.left, right: cell.right, bottom: cell.bottom }, rects }
      })
      expect(fit.glyphWidth, JSON.stringify(fit)).toBeLessThanOrEqual(fit.availableWidth)
      expect(fit.glyphHeight).toBeLessThanOrEqual(fit.availableHeight)
      expect(fit.rects.length).toBeGreaterThan(0)
      for (const rect of fit.rects) {
        expect(rect.left).toBeGreaterThanOrEqual(fit.cell.left)
        expect(rect.right).toBeLessThanOrEqual(fit.cell.right)
        expect(rect.top).toBeGreaterThanOrEqual(fit.inputBottom - 1)
        expect(rect.bottom).toBeLessThanOrEqual(fit.cell.bottom)
      }
      await page.screenshot({ path: info.outputPath('incorrect.png'), fullPage: true })
    })
  }
}
