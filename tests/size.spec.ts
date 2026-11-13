import { expect, test } from '@playwright/test'
import { chooseGridSize } from './helpers'

for (const mode of ['Ordered', 'Shuffled']) {
  for (const size of [2, 7, 12]) {
    test(`starts a ${size} × ${size} ${mode.toLowerCase()} grid with only its selected factors`, async ({ page }) => {
      await page.goto('/')
      await chooseGridSize(page, size)
      await page.getByRole('radio', { name: mode, exact: true }).click()
      await page.getByRole('button', { name: 'Start', exact: true }).click()
      const table = page.getByRole('table', { name: 'Multiplication grid' })
      const expected = Array.from({ length: size }, (_, index) => String(index + 1))
      const rows = await table.getByRole('rowheader').allTextContents()
      const columns = await table.getByRole('columnheader').allTextContents()
      expect([...rows].sort((a, b) => Number(a) - Number(b))).toEqual(expected)
      expect(columns.slice(1).sort((a, b) => Number(a) - Number(b))).toEqual(expected)
      if (mode === 'Ordered') expect(rows).toEqual(expected)
      await expect(page.getByRole('textbox')).toHaveCount(size * size)
      await expect(page.getByRole('textbox').last()).toHaveAccessibleName(`${rows[size - 1]} × ${columns[size]}`)
      await expect(page.getByRole('textbox').first()).toBeFocused()
      await expect(page.getByRole('button', { name: 'Grid size', exact: true })).toBeDisabled()
      await expect(page.getByRole('radio', { name: 'Ordered', exact: true })).toBeDisabled()
      await expect(page.getByRole('radio', { name: 'Shuffled', exact: true })).toBeDisabled()
    })
  }
}

for (const size of [2, 7]) {
  test(`uses ${size} × ${size} keyboard navigation boundaries`, async ({ page }) => {
    await page.goto('/')
    await chooseGridSize(page, size)
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    const cells = page.getByRole('textbox')
    for (const [from, key, to] of [
      [0, 'ArrowDown', size], [size, 'ArrowUp', 0],
      [0, 'ArrowRight', 1], [1, 'ArrowLeft', 0],
      [0, 'ArrowLeft', 0], [0, 'ArrowUp', 0],
      [size - 1, 'ArrowRight', size - 1], [size, 'ArrowLeft', size],
      [size - 1, 'Space', size], [size * size - 1, 'Space', size * size - 1],
      [size * size - 1, 'ArrowDown', size * size - 1],
    ] as const) {
      await cells.nth(from).press(key)
      await expect(cells.nth(to)).toBeFocused()
    }
    await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeDisabled()
  })
}

for (const size of [2, 7]) {
  test(`finishes a complete grid with ${size * size} answers and saves the matching total`, async ({ page }) => {
    await page.goto('/')
    await chooseGridSize(page, size)
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    const cells = page.getByRole('textbox')
    const finish = page.getByRole('button', { name: 'Finish', exact: true })
    for (let index = 0; index < size * size; index++) {
      if (index === 0) await expect(finish).toBeDisabled()
      else await expect(page.getByRole('button', { name: 'Finish early', exact: true })).toBeEnabled()
      const [row, column] = (await cells.nth(index).getAttribute('aria-label'))!.split(' × ').map(Number)
      await cells.nth(index).fill(index === 0 ? '0' : String(row * column))
    }
    await expect(page.getByText(`${size * size} / ${size * size} filled`, { exact: true })).toBeVisible()
    await expect(finish).toBeEnabled()
    await expect(page.getByRole('heading', { name: 'Round complete', exact: true })).toHaveCount(0)
    await cells.last().fill('')
    await expect(page.getByRole('button', { name: 'Finish early', exact: true })).toBeEnabled()
    const [row, column] = (await cells.last().getAttribute('aria-label'))!.split(' × ').map(Number)
    await cells.last().fill(String(row * column))
    await finish.click()
    await expect(page.getByText(`${size * size - 1} / ${size * size} correct`, { exact: true })).toBeVisible()
    await expect(page.getByText(`${Number(((size * size - 1) / (size * size) * 100).toFixed(1))}% accuracy`, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Grid size', exact: true })).toBeDisabled()
    await expect(cells.first()).toHaveAttribute('readonly', '')
    const elapsed = await page.getByRole('timer').innerText()
    await page.waitForTimeout(150)
    await expect(page.getByRole('timer')).toHaveText(elapsed)
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores')!))
    expect(saved).toMatchObject({ version: 3, scores: [{ size, total: size * size, correct: size * size - 1, mode: 'shuffled' }] })
  })
}

test('filters scores independently by size and mode while preserving legacy rounds', async ({ page }) => {
  const legacy = { id: 'legacy', mode: 'ordered', correct: 143, total: 144, elapsedMs: 12345, completedAt: '2026-01-02T12:00:00.000Z' }
  await page.goto('/')
  await page.evaluate(score => localStorage.setItem('times-tables.scores', JSON.stringify({ version: 1, scores: [score] })), legacy)
  await page.reload()
  await page.getByRole('radio', { name: 'Ordered', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Score history', exact: true }).getByText('143 / 144', { exact: true })).toBeVisible()
  await chooseGridSize(page, 2)
  await expect(page.getByRole('table', { name: 'Score history', exact: true }).getByText('143 / 144', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Score history', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  for (const [index, answer] of ['1', '2', '2', '4'].entries()) {
    await page.getByRole('textbox').nth(index).fill(answer)
  }
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  const elapsed = await page.getByRole('timer').innerText()
  const scores = page.getByRole('table', { name: 'Score history', exact: true })
  await expect(scores.getByText('4 / 4', { exact: true })).toHaveCount(2)
  await expect(scores.getByText('100%', { exact: true })).toBeVisible()
  await expect(page.getByText(`Fastest perfect: ${elapsed}`, { exact: true })).toBeVisible()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('times-tables.scores')!))
  expect(saved.version).toBe(3)
  expect(saved.scores).toHaveLength(2)
  expect(saved.scores[0]).toEqual({ ...legacy, size: 12, status: 'complete', attempted: 144 })
  expect(saved.scores[1]).toMatchObject({ size: 2, mode: 'ordered', correct: 4, total: 4 })
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Ordered', exact: true })).toBeChecked()
  await expect(page.getByRole('button', { name: 'Grid size', exact: true })).toHaveText('2 × 2')
  await expect(scores.getByRole('row')).toHaveCount(3)
  await page.getByRole('combobox', { name: 'Score size' }).selectOption('12')
  await expect(scores.getByRole('row')).toHaveCount(2)
  await expect(scores.getByText('143 / 144', { exact: true })).toBeVisible()
  await expect(page.getByText(`Fastest perfect: ${elapsed}`, { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Score size' }).selectOption('2')
  await expect(scores.getByRole('row')).toHaveCount(2)
  await expect(scores.getByText('4 / 4', { exact: true })).toHaveCount(2)
  await expect(page.getByText(`Fastest perfect: ${elapsed}`, { exact: true })).toBeVisible()
  await page.getByRole('radio', { name: 'Shuffled', exact: true }).click()
  await expect(scores.getByRole('row')).toHaveCount(2)
  await expect(page.getByText('No perfect round yet', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Score order' }).selectOption('shuffled')
  await expect(scores).toHaveCount(0)
})

test('offers every grid size from 2 to 12, defaulting to 12 with hidden factors', async ({ page }) => {
  await page.goto('/')
  const selector = page.getByRole('button', { name: 'Grid size', exact: true })
  await expect(selector).toHaveText('12 × 12')
  for (let size = 2; size <= 12; size++) {
    await chooseGridSize(page, size)
    await expect(page.getByRole('textbox')).toHaveCount(size * size)
    await expect(page.getByRole('textbox').last()).toHaveAccessibleName(`Row ${size}, column ${size}`)
    await expect(page.getByRole('textbox').first()).toBeDisabled()
    await expect(page.getByRole('table', { name: 'Multiplication grid' }).getByRole('row')).toHaveCount(size + 1)
    await expect(page.getByText(`1–${size} / ${size * size} answers`, { exact: true })).toBeVisible()
    await expect(page.getByText(`0 / ${size * size} filled`, { exact: true })).toBeVisible()
    await expect(page.getByRole('columnheader').filter({ hasText: /^\d+$/ })).toHaveCount(0)
    await expect(page.getByRole('timer')).toHaveText('0:00.0')
  }
})
