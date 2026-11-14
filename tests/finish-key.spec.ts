import { expect, test, type Page } from '@playwright/test'
import { SCORE_KEY } from '../src/scores'
import { chooseFilter, chooseGridSize, showPractice, showStats } from './helpers'

async function startSmall(page: Page) {
  await page.goto('/')
  await chooseGridSize(page, 2)
  await page.getByRole('radio', { name: 'Ordered', exact: true }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
}

async function savedScores(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{"scores":[]}').scores, SCORE_KEY)
}

test('Shift+Enter on the page finishes a full grid once, then a new round still starts with Enter', async ({ page }) => {
  await startSmall(page)
  const cells = page.getByRole('textbox')
  for (const [index, value] of ['1', '2', '2', '4'].entries()) await cells.nth(index).fill(value)
  await page.locator('body').click({ position: { x: 8, y: 8 } })
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('heading', { name: 'Round complete', exact: true })).toBeVisible()
  await expect(page.getByText('4 / 4 correct', { exact: true })).toBeVisible()
  const history = page.getByRole('table', { name: 'Score history', exact: true })
  await showStats(page)
  await expect(history.getByRole('row')).toHaveCount(2)
  await expect(history.getByRole('row').last()).toContainText('Complete4 / 44 / 4100%')
  const saved = await savedScores(page)
  expect(saved).toMatchObject([{ status: 'complete', attempted: 4, correct: 4, total: 4 }])
  await showPractice(page)
  await page.locator('body').click({ position: { x: 8, y: 8 } })
  await page.keyboard.press('Enter')
  await cells.last().press('Enter')
  expect(await savedScores(page)).toEqual(saved)
  await page.getByRole('button', { name: 'New round', exact: true }).press('Enter')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(cells.first()).toBeFocused()
  await expect(cells.first()).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
  expect(await savedScores(page)).toEqual(saved)
})

test('ignores repeated, modified, composing and already-handled Enter without moving focus', async ({ page }) => {
  await startSmall(page)
  const cell = page.getByRole('textbox').first()
  await cell.fill('1')
  for (const target of ['cell', 'page']) {
    for (const flag of ['repeat', 'altKey', 'ctrlKey', 'metaKey', 'isComposing', 'keyCode', 'defaultPrevented']) {
      await cell.focus()
      const prevented = await page.evaluate(({ target, flag }) => {
        const event = new KeyboardEvent('keydown', {
          key: 'Enter', shiftKey: true, [flag]: flag === 'keyCode' ? 229 : true, bubbles: true, cancelable: true,
        })
        if (flag === 'defaultPrevented') event.preventDefault()
        ;(target === 'cell' ? document.querySelector('td input')! : document.body).dispatchEvent(event)
        return event.defaultPrevented
      }, { target, flag })
      expect(prevented, `${target}: ${flag}`).toBe(flag === 'defaultPrevented')
      await expect(cell).toBeFocused()
      await expect(cell).not.toHaveAttribute('readonly')
      await expect(page.getByRole('region', { name: 'Round result' })).toHaveCount(0)
      expect(await savedScores(page)).toEqual([])
    }
  }
  await cell.press('Shift+Enter')
  await expect(page.getByRole('heading', { name: 'Partial result', exact: true })).toBeVisible()
})

test('leaves buttons, links, settings and history filters to their native Enter behavior', async ({ page }) => {
  await startSmall(page)
  await page.getByRole('textbox').first().fill('1')
  for (const html of [
    '<button><span>Button</span></button>', '<a href="#history"><span>History</span></a>',
    '<input aria-label="History filter">', '<textarea></textarea>', '<select><option>All</option></select>',
    '<details><summary>History</summary></details>',
    '<div contenteditable="true"><span>Editable</span></div>',
    '<div role="button"><span>Custom button</span></div>',
    '<div role="link"><span>Custom link</span></div>',
    '<div role="combobox"><span>Custom filter</span></div>',
    '<div tabindex="0"><span>Other control</span></div>',
  ]) {
    const prevented = await page.evaluate(html => {
      const fixture = document.createElement('div')
      fixture.innerHTML = html
      document.body.append(fixture)
      const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })
      ;(fixture.querySelector('span, summary') ?? fixture.firstElementChild!).dispatchEvent(event)
      fixture.remove()
      return event.defaultPrevented
    }, html)
    expect(prevented, html).toBe(false)
    await expect(page.getByRole('region', { name: 'Round result' })).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).press('Enter')
  await expect(page.getByRole('button', { name: 'Switch to dark mode', exact: true })).toBeVisible()
  expect(await savedScores(page)).toEqual([])
  await page.getByRole('button', { name: 'Finish early', exact: true }).press('Enter')
  await expect(page.getByRole('heading', { name: 'Partial result', exact: true })).toBeVisible()
  expect(await savedScores(page)).toHaveLength(1)
})

test('synchronous duplicate Shift+Enter and Finish events persist exactly once', async ({ page }) => {
  await startSmall(page)
  await page.getByRole('textbox').first().fill('1')
  await page.evaluate(key => {
    const original = Storage.prototype.setItem
    const writes: string[] = []
    Storage.prototype.setItem = function (name, value) {
      if (name === key) writes.push(value)
      original.call(this, name, value)
    }
    Object.assign(window, { readScoreWrites: () => { Storage.prototype.setItem = original; return writes } })
    const cell = document.querySelector('td input')!
    const finish = Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Finish early')!
    for (let index = 0; index < 2; index++) {
      cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }))
    }
    finish.click()
  }, SCORE_KEY)
  // Keep the probe installed through actual asynchronous commit, not just dispatch.
  await expect(page.getByRole('heading', { name: 'Partial result', exact: true })).toBeVisible()
  const writes = await page.evaluate(() => (window as unknown as { readScoreWrites: () => string[] }).readScoreWrites())
  expect(writes).toHaveLength(1)
  expect(JSON.parse(writes[0]).scores).toHaveLength(1)
  expect(await savedScores(page)).toEqual(JSON.parse(writes[0]).scores)
  await page.getByRole('button', { name: 'New round', exact: true }).click()
  await page.keyboard.press('Enter')
  await page.getByRole('textbox').first().fill('2')
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('heading', { name: 'Partial result', exact: true })).toBeVisible()
  expect(await savedScores(page)).toHaveLength(2)
})

test('does not finish behind a visible popup but allows Shift+Enter after it closes', async ({ page }) => {
  await startSmall(page)
  await page.getByRole('textbox').first().fill('1')
  for (const html of [
    '<dialog open>Settings</dialog>', '<div popover>Settings</div>',
    '<div role="dialog">Settings</div>', '<div role="alertdialog">Confirm</div>',
    '<div role="menu">Options</div>', '<div role="listbox">History filters</div>',
  ]) {
    const prevented = await page.evaluate(html => {
      const fixture = document.createElement('div')
      fixture.innerHTML = html
      document.body.append(fixture)
      const popup = fixture.firstElementChild as HTMLElement
      if (popup.hasAttribute('popover')) popup.showPopover()
      const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })
      document.body.dispatchEvent(event)
      fixture.remove()
      return event.defaultPrevented
    }, html)
    expect(prevented, html).toBe(false)
    await expect(page.getByRole('region', { name: 'Round result' })).toHaveCount(0)
    expect(await savedScores(page)).toEqual([])
  }
  await page.evaluate(() => {
    const closed = document.createElement('div')
    closed.innerHTML = '<dialog>Closed</dialog><div role="menu" hidden>Hidden</div><div role="listbox" style="visibility:hidden">Hidden</div>'
    document.body.append(closed)
  })
  await page.locator('body').click({ position: { x: 8, y: 8 } })
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('heading', { name: 'Partial result', exact: true })).toBeVisible()
})

test('Shift+Enter completion keeps history filters independent and persists round settings across refresh', async ({ page }) => {
  await startSmall(page)
  const cells = page.getByRole('textbox')
  for (const [index, value] of ['1', '2', '2', '4'].entries()) await cells.nth(index).fill(value)
  await cells.last().press('Shift+Enter')
  await expect(page.getByRole('heading', { name: 'Round complete', exact: true })).toBeVisible()
  const original = await savedScores(page)
  await page.getByRole('button', { name: 'New round', exact: true }).click()
  await page.getByRole('radio', { name: 'Shuffled', exact: true }).click()
  await chooseGridSize(page, 3)
  await page.getByRole('button', { name: 'Start', exact: true }).press('Enter')
  await expect(cells).toHaveCount(9)
  await cells.first().fill('0')
  const order = page.getByRole('radiogroup', { name: 'Stats order', exact: true })
  const size = page.getByRole('combobox', { name: 'Stats size', exact: true })
  await showStats(page)
  await chooseFilter(order, 'ordered')
  await chooseFilter(size, '2')
  for (const filter of [size]) {
    const label = await filter.getAttribute('aria-label')
    await filter.press('Enter')
    const panel = page.getByRole('listbox', { name: `${label} options`, exact: true })
    await expect(panel).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(panel).toHaveCount(0)
    await expect(filter).toBeFocused()
  }
  await showPractice(page)
  await expect(page.getByRole('region', { name: 'Round result' })).toHaveCount(0)
  expect(await savedScores(page)).toEqual(original)
  await cells.first().press('Shift+Enter')
  await expect(page.getByRole('heading', { name: 'Partial result', exact: true })).toBeVisible()
  const saved = await savedScores(page)
  expect(saved).toHaveLength(2)
  expect(saved[0]).toEqual(original[0])
  expect(saved[1]).toMatchObject({ mode: 'shuffled', size: 3, status: 'partial', attempted: 1, correct: 0, total: 9 })
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Shuffled', exact: true })).toBeChecked()
  await expect(page.getByRole('button', { name: 'Grid size', exact: true })).toHaveText('3 × 3')
  await showStats(page)
  await expect(order).toHaveAttribute('data-value', 'ordered')
  await expect(size).toHaveAttribute('data-value', '2')
  await expect(page.getByRole('table', { name: 'Score history', exact: true }).getByRole('row')).toHaveCount(2)
  await expect(page.getByRole('table', { name: 'Score history', exact: true }).getByRole('row').filter({ has: page.getByRole('cell', { name: 'Partial', exact: true }) })).toHaveCount(0)
  await chooseFilter(order, 'shuffled')
  await chooseFilter(size, '3')
  await expect(page.getByRole('table', { name: 'Score history', exact: true }).getByRole('row')).toHaveCount(2)
  await expect(page.getByRole('table', { name: 'Score history', exact: true })).toContainText('Partial')
  expect(await savedScores(page)).toEqual(saved)
})

test('advertises Shift+Enter finish and preserves the navigation and cancel keyboard clues', async ({ page }) => {
  await startSmall(page)
  await expect(page.getByText('Shift + Enter finish · Tab next · Esc cancel · Shift + Tab back · Arrow keys move · Click to edit', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Finish', exact: true })).toHaveAttribute('aria-keyshortcuts', 'Shift+Enter')
})

test('empty Enter and a held start Enter cannot finish or advance the round', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await page.locator('body').click({ position: { x: 8, y: 8 } })
  await page.keyboard.down('Enter')
  const cell = page.getByRole('textbox').first()
  await expect(cell).toBeFocused()
  await expect(cell).not.toHaveAttribute('readonly')
  await cell.fill('1')
  await page.keyboard.down('Enter')
  await expect(cell).toBeFocused()
  await expect(cell).not.toHaveAttribute('readonly')
  expect(await savedScores(page)).toEqual([])
  await page.keyboard.up('Enter')
  await cell.fill('')
  await cell.press('Shift+Enter')
  await expect(cell).toBeFocused()
  await page.locator('body').click({ position: { x: 8, y: 8 } })
  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: 'Round result' })).toHaveCount(0)
  await page.clock.runFor(1500)
  await expect(page.getByRole('timer')).not.toHaveText('0:00.0')
  expect(await savedScores(page)).toEqual([])
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeFocused()
  expect(await savedScores(page)).toEqual([])
})

test('Shift+Enter finishes a partial round in place and freezes the saved answers and timer', async ({ page }) => {
  await page.clock.install()
  await startSmall(page)
  const cells = page.getByRole('textbox')
  await cells.first().fill('0')
  await page.clock.runFor(1500)
  await cells.first().press('Shift+Enter')
  await expect(page.getByRole('heading', { name: 'Partial result', exact: true })).toBeVisible()
  await expect(cells.first()).toBeFocused()
  await expect(cells.first()).toHaveAttribute('readonly', '')
  await expect(page.getByText('1 / 4 attempted', { exact: true })).toBeVisible()
  await expect(page.getByText('0 / 1 correct', { exact: true })).toBeVisible()
  await expect(cells.nth(1)).toHaveValue('')
  await showStats(page)
  await expect(page.getByRole('table', { name: 'Score history', exact: true }).getByRole('row')).toHaveCount(2)
  const partials = page.getByRole('table', { name: 'Score history', exact: true })
  await expect(partials.getByRole('row')).toHaveCount(2)
  await expect(partials.getByRole('row').last().getByRole('cell')).toHaveText([/now|ago/, 'Partial', '1 / 4', '0 / 1', '0%', /\d+:\d{2}\.\d/])
  expect(await savedScores(page)).toMatchObject([{ status: 'partial', attempted: 1, correct: 0, total: 4, size: 2 }])
  await showPractice(page)
  const elapsed = await page.getByRole('timer').innerText()
  const saved = await savedScores(page)
  await cells.first().press('9')
  await cells.first().press('Enter')
  await page.clock.runFor(2000)
  await expect(cells.first()).toHaveValue('0')
  await expect(page.getByRole('timer')).toHaveText(elapsed)
  expect(await savedScores(page)).toEqual(saved)
})
