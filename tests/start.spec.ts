import { expect, test } from '@playwright/test'

for (const key of ['Enter', 'Space']) {
  test(`${key} on the page starts once, focuses the first cell and does not scroll`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 })
    await page.goto('/')
    await page.getByRole('heading', { name: 'Times tables', exact: true }).click()
    await page.keyboard.press(key)
    const cells = page.getByRole('textbox')
    await expect(cells.first()).toBeFocused()
    await expect(cells.first()).toHaveValue('')
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0)
    await expect(page.getByRole('timer')).not.toHaveText('0:00.0')
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    const grid = page.getByRole('table', { name: 'Multiplication grid' })
    const headers = await grid.getByRole('columnheader').allTextContents()
    await cells.first().fill('12')
    await cells.first().press('Space')
    await expect(cells.nth(1)).toBeFocused()
    await page.getByRole('heading', { name: 'Times tables', exact: true }).click()
    await page.keyboard.press(key)
    await expect(cells.first()).toHaveValue('12')
    await expect(grid.getByRole('columnheader')).toHaveText(headers)
    await expect(page.getByRole('heading', { name: 'Partial result', exact: true })).toHaveCount(key === 'Enter' ? 1 : 0)
  })
}

test('ignores repeated, modified, composing and already-handled start keys', async ({ page }) => {
  await page.goto('/')
  for (const key of ['Enter', ' ']) {
    for (const flag of ['repeat', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'isComposing', 'defaultPrevented']) {
      const prevented = await page.evaluate(({ key, flag }) => {
        const event = new KeyboardEvent('keydown', { key, [flag]: true, bubbles: true, cancelable: true })
        if (flag === 'defaultPrevented') event.preventDefault()
        document.body.dispatchEvent(event)
        return event.defaultPrevented
      }, { key, flag })
      expect(prevented, `${key}: ${flag}`).toBe(flag === 'defaultPrevented')
      await expect(page.getByRole('textbox').first()).toBeDisabled()
    }
  }
})

test('leaves settings and other interactive targets to their own keyboard behaviour', async ({ page }) => {
  await page.goto('/')
  const ordered = page.getByRole('radio', { name: 'Ordered', exact: true })
  for (const key of ['Enter', 'Space']) {
    await ordered.focus()
    await page.keyboard.press(key)
    await expect(page.getByRole('textbox').first()).toBeDisabled()
  }
  // DOM fixtures cover controls future settings can introduce without adding UI to the app.
  for (const html of [
    '<button><span>Button</span></button>', '<a href="#example"><span>Link</span></a>',
    '<input>', '<textarea></textarea>', '<select><option>Option</option></select>',
    '<div contenteditable="true"><span>Editable</span></div>',
    '<div role="button" tabindex="0"><span>Custom button</span></div>',
    '<div role="combobox" tabindex="0">Custom setting</div>',
  ]) {
    for (const key of ['Enter', ' ']) {
      const prevented = await page.evaluate(({ html, key }) => {
        const fixture = document.createElement('div')
        fixture.innerHTML = html
        document.body.append(fixture)
        const control = fixture.firstElementChild as HTMLElement
        control.focus()
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
        ;(control.querySelector('span') ?? control).dispatchEvent(event)
        fixture.remove()
        return event.defaultPrevented
      }, { html, key })
      expect(prevented, `${key} on ${html}`).toBe(false)
      await expect(page.getByRole('textbox').first()).toBeDisabled()
    }
  }
})

test('does not start behind an open popup but ignores closed popups', async ({ page }) => {
  await page.goto('/')
  for (const html of [
    '<dialog open>Settings</dialog>', '<div popover>Settings</div>',
    '<div role="dialog">Settings</div>', '<div role="alertdialog">Confirm</div>',
    '<div role="menu">Options</div>', '<div role="listbox">Choices</div>',
  ]) {
    for (const key of ['Enter', ' ']) {
      const prevented = await page.evaluate(({ html, key }) => {
        const fixture = document.createElement('div')
        fixture.innerHTML = html
        document.body.append(fixture)
        const popup = fixture.firstElementChild as HTMLElement
        if (popup.hasAttribute('popover')) popup.showPopover()
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
        document.body.dispatchEvent(event)
        fixture.remove()
        return event.defaultPrevented
      }, { html, key })
      expect(prevented, `${key} with ${html}`).toBe(false)
      await expect(page.getByRole('textbox').first()).toBeDisabled()
    }
  }
  await page.evaluate(() => {
    const closed = document.createElement('div')
    closed.innerHTML = '<dialog>Closed</dialog><div role="menu" hidden>Hidden</div><div role="listbox" style="visibility:hidden">Hidden</div>'
    document.body.append(closed)
  })
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox').first()).toBeFocused()
})

test('Space advances during a round without inserting text or scrolling and clamps at the last cell', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 })
  await page.goto('/')
  await page.keyboard.press('Enter')
  const cells = page.getByRole('textbox')
  await cells.first().fill('12')
  await cells.first().press('Space')
  await expect(cells.nth(1)).toBeFocused()
  await expect(cells.first()).toHaveValue('12')
  await expect(cells.nth(1)).toHaveValue('')
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await cells.nth(143).fill('144')
  const scroll = await page.evaluate(() => window.scrollY)
  await cells.nth(143).press('Space')
  await expect(cells.nth(143)).toBeFocused()
  await expect(cells.nth(143)).toHaveValue('144')
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scroll)
  await expect(page.getByRole('heading', { name: 'Round complete', exact: true })).toHaveCount(0)
})

test('keeps native keyboard activation of the Start button', async ({ page }) => {
  for (const key of ['Enter', 'Space']) {
    await page.goto('/')
    await page.getByRole('button', { name: 'Start', exact: true }).focus()
    await page.keyboard.press(key)
    await expect(page.getByRole('textbox').first()).toBeFocused()
    await expect(page.getByRole('textbox').first()).toHaveValue('')
  }
})

test('does not restart a completed round with Enter or Space', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Ordered', exact: true }).click()
  await page.getByRole('heading', { name: 'Times tables', exact: true }).click()
  await page.keyboard.press('Enter')
  const cells = page.getByRole('textbox')
  await expect(cells.first()).toHaveAttribute('aria-label', '1 × 1')
  for (let index = 0; index < 144; index++) await cells.nth(index).fill('1')
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  const elapsed = await page.getByRole('timer').innerText()
  for (const key of ['Enter', 'Space']) {
    await page.getByRole('heading', { name: 'Times tables', exact: true }).click()
    await page.keyboard.press(key)
    await expect(page.getByRole('heading', { name: 'Round complete', exact: true })).toBeVisible()
    await expect(cells.first()).toHaveAttribute('readonly', '')
    await expect(cells.first()).toHaveValue('1')
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0)
    await expect(page.getByRole('timer')).toHaveText(elapsed)
  }
})

test('offers one prominent Start centred over the disabled grid', async ({ page }) => {
  await page.goto('/')
  const start = page.getByRole('button', { name: 'Start', exact: true })
  await expect(start).toHaveCount(1)
  await expect(page.getByText('Enter or Space to start', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Round controls' }).getByRole('button', { name: 'Start', exact: true })).toHaveCount(0)
  const grid = page.getByRole('table', { name: 'Multiplication grid' })
  await expect(grid.getByRole('textbox').first()).toBeDisabled()
  const gridBox = (await grid.boundingBox())!
  const startBox = (await start.boundingBox())!
  expect(startBox.width).toBeGreaterThanOrEqual(160)
  expect(startBox.height).toBeGreaterThanOrEqual(48)
  expect(Math.abs(startBox.x + startBox.width / 2 - gridBox.x - gridBox.width / 2)).toBeLessThan(2)
  expect(Math.abs(startBox.y + startBox.height / 2 - gridBox.y - gridBox.height / 2)).toBeLessThan(32)
  await start.click()
  await expect(start).toHaveCount(0)
  await expect(page.getByText('Enter or Space to start', { exact: true })).toHaveCount(0)
  await expect(grid.getByRole('textbox').first()).toBeFocused()
})
