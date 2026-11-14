import { expect, test } from '@playwright/test'

for (const surface of ['start', 'body']) {
  for (const key of ['a', '7', ';', 'Shift+A', 'ArrowRight', 'Enter', 'Space']) {
    test(`${key} starts only once from ${surface}`, async ({ page }) => {
      await page.goto('/')
      const start = page.getByRole('button', { name: 'Start', exact: true })
      await expect(start).toBeFocused()
      if (surface === 'body') await page.locator('body').click({ position: { x: 8, y: 8 } })
      await page.keyboard.press(key)
      const cells = page.getByRole('textbox')
      await expect(cells.first()).toBeFocused()
      await expect(cells.first()).toHaveValue('')
      await expect(start).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'Round result' })).toHaveCount(0)
    })
  }
}


for (const key of ['7', 'ArrowRight']) {
  test(`held ${key} is consumed until release, then works normally`, async ({ page }) => {
    await page.goto('/')
    await page.keyboard.down(key)
    const cells = page.getByRole('textbox')
    await expect(cells.first()).toBeFocused()
    await page.keyboard.down(key)
    await page.keyboard.down(key)
    await expect(cells.first()).toBeFocused()
    await expect(cells.first()).toHaveValue('')
    await page.keyboard.up(key)
    await page.keyboard.press(key)
    if (key === '7') await expect(cells.first()).toHaveValue('7')
    else await expect(cells.nth(1)).toBeFocused()
  })
}

test('ready safety guards apply to ordinary keys on Start and body', async ({ page }) => {
  await page.goto('/')
  for (const target of ['button.start-button', 'body']) {
    for (const key of ['a', '7', ';', 'ArrowRight']) {
      for (const flag of ['repeat', 'altKey', 'ctrlKey', 'metaKey', 'isComposing', 'keyCode', 'defaultPrevented']) {
        const prevented = await page.evaluate(({ target, key, flag }) => {
          const event = new KeyboardEvent('keydown', { key, [flag]: flag === 'keyCode' ? 229 : true, bubbles: true, cancelable: true })
          if (flag === 'defaultPrevented') event.preventDefault()
          document.querySelector(target)!.dispatchEvent(event)
          return event.defaultPrevented
        }, { target, key, flag })
        expect(prevented, `${target}: ${key}: ${flag}`).toBe(flag === 'defaultPrevented')
        await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
      }
    }
  }
})

test('Tab, Shift+Tab, Escape and modifier-only keys retain ready state', async ({ page }) => {
  await page.goto('/')
  for (const key of ['Shift', 'Control', 'Meta', 'Alt', 'Escape']) {
    await page.keyboard.press(key)
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeFocused()
  }
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).not.toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeFocused()
})

for (const route of ['/settings', '/stats', '/about']) {
  test(`ordinary keys leave ${route} alone and active rounds survive navigation`, async ({ page }) => {
    await page.goto(route)
    await page.locator('body').click({ position: { x: 8, y: 8 } })
    for (const key of ['a', '7', 'ArrowRight', 'Enter', 'Space']) await page.keyboard.press(key)
    await page.getByRole('link', { name: 'Practice', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeFocused()
    await page.keyboard.press('7')
    const cells = page.getByRole('textbox')
    await cells.first().fill('12')
    const headers = await page.getByRole('table', { name: 'Multiplication grid' }).getByRole('columnheader').allTextContents()
    await page.getByRole('link', { name: route[1].toUpperCase() + route.slice(2), exact: true }).click()
    await page.locator('body').click({ position: { x: 8, y: 8 } })
    for (const key of ['a', '7', 'ArrowRight', 'Shift+Enter', 'Escape']) await page.keyboard.press(key)
    await page.getByRole('link', { name: 'Practice', exact: true }).click()
    await expect(cells.first()).toHaveValue('12')
    await expect(cells.first()).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Multiplication grid' }).getByRole('columnheader')).toHaveText(headers)
    await expect(page.getByRole('timer')).not.toHaveText('0:00.0')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeFocused()
    await page.keyboard.press('a')
    await expect(cells.first()).toBeFocused()
    await expect(cells.first()).toHaveValue('')
  })
}


test('held start-key suppression still leaves shortcuts and composition alone', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.down('7')
  await expect(page.getByRole('textbox').first()).toBeFocused()
  for (const flag of ['altKey', 'ctrlKey', 'metaKey', 'isComposing', 'keyCode']) {
    const prevented = await page.getByRole('textbox').first().evaluate((input, flag) => {
      const event = new KeyboardEvent('keydown', { key: '7', code: 'Digit7', repeat: true, [flag]: flag === 'keyCode' ? 229 : true, bubbles: true, cancelable: true })
      input.dispatchEvent(event)
      return event.defaultPrevented
    }, flag)
    expect(prevented, flag).toBe(false)
  }
  await page.keyboard.up('7')
})
