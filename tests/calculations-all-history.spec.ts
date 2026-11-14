import { expect, test, type Page } from '@playwright/test'
import { createGrid, scoreAnswers } from '../src/game'
import type { Score } from '../src/scores'
import { chooseFilter } from './helpers'

function run(id: string, factors: number[], mode: Score['mode'], entryMs: number, wrong: string[] = []): Score {
  const grid = createGrid('ordered', Math.random, factors)
  const answers = factors.flatMap(row => factors.map(column => wrong.includes(`${row}:${column}`) ? '000' : String(row * column)))
  const result = scoreAnswers(grid, answers)
  return { id, factors, mode, size: factors.length, status: result.status, attempted: result.attempted, correct: result.correct,
    total: answers.length, elapsedMs: 12000, completedAt: '2026-01-01T00:00:00Z', calculations: { ...result.calculations,
      timing: { version: 1, cells: answers.map((_, index) => ({ index, answerEntryMs: entryMs, focusedMs: entryMs + 50, edits: 1, visits: 1 })) } } }
}

async function snapshot(page: Page) {
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('radio', { name: 'Errors', exact: true }).click()
  await expect(page.getByText('Detail coverage: 5 / 6 runs · 25 answered')).toBeVisible()
  const errors = page.getByRole('table', { name: 'Incorrect calculations', exact: true })
  const pair = errors.getByRole('row').filter({ has: page.getByRole('rowheader', { name: '1 × 2', exact: true }) })
  await expect(pair.getByRole('cell').nth(0)).toHaveText('2')
  await expect(pair.getByRole('cell').nth(1)).toHaveText('4')
  await expect(pair.getByRole('cell').nth(2)).toHaveText('50%')
  await pair.getByText('Answers', { exact: true }).click()
  await expect(pair).toContainText('000 (2)')
  const errorText = await errors.innerText()
  await page.getByRole('radio', { name: 'Times', exact: true }).click()
  await expect(page.getByText('Timing coverage: 4 / 6 runs · 21 measured answers · 4 missing')).toBeVisible()
  const times = page.getByRole('table', { name: 'Slow calculations', exact: true })
  const timedPair = times.locator(':scope > tbody > tr').filter({ has: page.getByRole('rowheader', { name: '1 × 2', exact: true }) })
  await expect(timedPair.locator(':scope > td').first()).toHaveText('3 s')
  await expect(timedPair).toContainText('2 correct · 1 incorrect · 1 missing')
  await timedPair.locator('summary').click()
  const samples = timedPair.getByRole('table', { name: 'Timing samples for 1 × 2', exact: true })
  expect(await samples.locator('tbody tr td:nth-child(2)').allTextContents()).toEqual(['0 ms', '2000 ms', '4000 ms'])
  await expect(times.getByRole('rowheader', { name: '2 × 1', exact: true })).toBeVisible()
  return { errors: errorText, times: await times.innerText() }
}

test('all committed error and timing history combines identical operands across settings while Stats stays exact', async ({ page }) => {
  const a = run('preset', [1, 2], 'ordered', 0, ['1:2'])
  const { timing: _, ...detail } = a.calculations!
  const { calculations: __, ...aggregate } = a
  const scores = [a, run('custom', [1, 2, 4], 'ordered', 2000), run('shuffled', [1, 2], 'shuffled', 4000, ['2:1']),
    run('unrelated', [6, 9], 'ordered', 9000, ['9:6']), { ...a, id: 'untimed', calculations: detail }, { ...aggregate, id: 'legacy' }]
  const raw = ` {"version":4,"scores":${JSON.stringify(scores)},"unknown":{"retain":[1,"source"]}}\n`
  await page.addInitScript(raw => {
    if (localStorage.getItem('times-tables.scores')) return
    localStorage.setItem('times-tables.scores', raw)
    localStorage.setItem('times-tables.settings', JSON.stringify({ version: 1, mode: 'ordered', size: 2, choice: 'preset', customFactors: [6, 9], unknown: ['keep'] }))
    localStorage.setItem('times-tables.progress', ' {"version":1,"mode":"ordered","size":2,"axisMode":"runs","unknown":["keep"]}\n')
  }, raw)
  await page.goto('/stats/calculations')
  const progress = await page.evaluate(() => localStorage.getItem('times-tables.progress'))
  const baseline = await snapshot(page)
  for (const selection of [
    { mode: 'ordered', size: '3', ids: [] },
    { mode: 'ordered', size: 'set:1,2,4', ids: ['custom'] },
    { mode: 'shuffled', size: '2', ids: ['shuffled'] },
    { mode: 'ordered', size: 'set:6,9', ids: ['unrelated'] },
    { mode: 'ordered', size: '2', ids: ['preset', 'untimed', 'legacy'] },
  ]) {
    await page.getByRole('link', { name: 'Stats', exact: true }).click()
    // Works on the old nested route until the independent navigation release lands.
    const overview = page.getByRole('link', { name: 'Overview', exact: true })
    if (await overview.isVisible()) await overview.click()
    await chooseFilter(page.getByRole('radiogroup', { name: 'Stats order', exact: true }), selection.mode)
    await chooseFilter(page.getByRole('combobox', { name: 'Stats size', exact: true }), selection.size)
    expect(await page.locator('table[aria-label="Score history"] tbody tr').evaluateAll(rows => rows.map(row => row.getAttribute('data-score-id')))).toEqual(selection.ids)
    if (!selection.ids.length) await expect(page.getByText('No rounds for these settings.')).toBeVisible()
    await page.getByRole('link', { name: 'Calculations', exact: true }).click()
    expect(await snapshot(page)).toEqual(baseline)
    expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(raw)
    expect(await page.evaluate(() => localStorage.getItem('times-tables.progress'))).toBe(progress)
  }
  await page.reload()
  expect(await snapshot(page)).toEqual(baseline)
  expect(await page.evaluate(() => localStorage.getItem('times-tables.scores'))).toBe(raw)
})
