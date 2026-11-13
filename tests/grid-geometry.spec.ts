import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { chooseGridSize } from './helpers'

async function expectSquareGrid(page: Page, size: number) {
  const geometry = await page.locator('.answer-grid').evaluate(table => {
    const rect = (element: Element) => {
      const { x, y, width, height, right, bottom } = element.getBoundingClientRect()
      return { x, y, width, height, right, bottom }
    }
    return {
      table: rect(table), stage: rect(table.parentElement!),
      practice: rect(document.querySelector('.practice')!),
      cells: Array.from(table.querySelectorAll('td')).map(rect),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    }
  })
  expect(geometry.cells).toHaveLength(size * size)
  expect(geometry.table.width).toBeGreaterThanOrEqual(300)
  expect(geometry.table.width).toBeLessThanOrEqual(625)
  expect(Math.abs(geometry.table.width - geometry.table.height)).toBeLessThan(3)
  expect(Math.abs(geometry.stage.width - geometry.table.width)).toBeLessThan(1)
  expect(Math.abs(geometry.table.x + geometry.table.width / 2 - geometry.practice.x - geometry.practice.width / 2)).toBeLessThan(1)
  expect(geometry.overflow).toBe(false)
  for (const cell of geometry.cells) {
    expect(cell.width).toBeGreaterThanOrEqual(46)
    expect(cell.width / cell.height).toBeGreaterThan(0.95)
    expect(cell.width / cell.height).toBeLessThan(1.05)
  }
  return geometry.table
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true })
}

for (const width of [1024, 1440]) {
  for (const palette of ['dark', 'light'] as const) {
    for (const size of [2, 6, 12]) {
      test(`${size} × ${size} stays compact and square at ${width}px in ${palette} mode`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 1000 })
        await page.addInitScript(theme => localStorage.setItem('times-tables.theme', theme), palette)
        await page.goto('/')
        await page.getByRole('radio', { name: 'Ordered', exact: true }).click()
        await chooseGridSize(page, size)
        const ready = await expectSquareGrid(page, size)
        const start = page.getByRole('button', { name: 'Start', exact: true })
        const button = (await start.boundingBox())!
        const hint = (await page.locator('#start-hint').boundingBox())!
        expect(button.width).toBeGreaterThanOrEqual(180)
        expect(button.x).toBeGreaterThan(ready.x)
        expect(button.x + button.width).toBeLessThan(ready.right)
        expect(hint.y + hint.height).toBeLessThan(ready.bottom)
        await capture(page, info, 'ready')

        await start.click()
        const cells = page.getByRole('textbox')
        await cells.first().fill('1')
        await cells.nth(1).fill('2')
        await cells.nth(size).fill('2')
        await cells.last().fill('0')
        await expectSquareGrid(page, size)
        await capture(page, info, 'active')
        const footer = (await page.locator('.grid-footer').boundingBox())!
        expect(footer.y + footer.height).toBeLessThanOrEqual(1000)

        await page.getByRole('button', { name: /Finish/ }).click()
        await expect(cells.last()).toHaveAccessibleDescription(`Incorrect. Correct: ${size * size}`)
        await expectSquareGrid(page, size)
        const feedback = await cells.last().locator('..').evaluate(cell => {
          const correction = cell.querySelector('.answer-correction')!
          const text = Array.from(correction.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).flatMap(node => {
            const range = document.createRange()
            range.selectNodeContents(node)
            return Array.from(range.getClientRects()).map(rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }))
          })
          const labelNode = Array.from(correction.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.includes('Correct:'))!
          const label = document.createRange()
          label.setStart(labelNode, 0)
          label.setEnd(labelNode, 'Correct:'.length)
          const parent = cell.getBoundingClientRect()
          const input = cell.querySelector('input')!.getBoundingClientRect()
          return {
            labelLines: label.getClientRects().length,
            parent: { left: parent.left, right: parent.right, top: parent.top, bottom: parent.bottom },
            inputBottom: input.bottom,
            text,
          }
        })
        expect(feedback.labelLines).toBe(1)
        expect(feedback.text.length).toBeGreaterThan(0)
        for (const rect of feedback.text) {
          expect(rect.left).toBeGreaterThanOrEqual(feedback.parent.left)
          expect(rect.right).toBeLessThanOrEqual(feedback.parent.right)
          expect(rect.top).toBeGreaterThanOrEqual(feedback.inputBottom - 1)
          expect(rect.bottom).toBeLessThanOrEqual(feedback.parent.bottom)
        }
        await capture(page, info, 'incorrect-result')
      })
    }
  }
}

test('every selectable size uses the same square geometry without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.goto('/')
  for (let size = 2; size <= 12; size++) {
    await chooseGridSize(page, size)
    await expectSquareGrid(page, size)
  }
})
