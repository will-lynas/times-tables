import { expect, test } from '@playwright/test'
import { SCORE_KEY } from '../src/scores'
import { chooseGridSize } from './helpers'

test('plain Enter and Space preserve active answer focus and values, even when full', async ({ page }) => {
  await page.goto('/')
  await chooseGridSize(page, 2)
  await page.getByRole('radio', { name: 'Ordered', exact: true }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).press('Enter')
  const cells = page.getByRole('textbox')
  for (const key of ['Enter', 'Space', 'Shift+Enter']) {
    await cells.first().press(key)
    await expect(cells.first()).toBeFocused()
    await expect(cells.first()).toHaveValue('')
    await expect(cells.first()).not.toHaveAttribute('readonly')
  }
  for (const [index, answer] of ['1', '2', '2', '4'].entries()) {
    await cells.nth(index).fill(answer)
    for (const key of ['Enter', 'Space']) {
      await cells.nth(index).press(key)
      await expect(cells.nth(index)).not.toHaveAttribute('readonly')
      await expect(cells.nth(index)).toBeFocused()
      await expect(cells.nth(index)).toHaveValue(answer)
      expect(await page.evaluate(key => localStorage.getItem(key), SCORE_KEY)).toBeNull()
    }
  }
  await cells.last().press('Shift+Enter')
  await expect(page.getByRole('heading', { name: 'Round complete', exact: true })).toBeVisible()
})

test('Tab and Shift+Tab retain native grid boundaries without implicitly finishing', async ({ page }) => {
  await page.goto('/')
  await chooseGridSize(page, 2)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const cells = page.getByRole('textbox')
  await cells.first().fill('1')
  await cells.first().press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(cells.first()).toBeFocused()
  for (let index = 1; index < 4; index++) {
    await page.keyboard.press('Tab')
    await expect(cells.nth(index)).toBeFocused()
  }
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Finish early', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(cells.last()).toBeFocused()
  await expect(page.getByRole('region', { name: 'Round result' })).toHaveCount(0)
  expect(await page.evaluate(key => localStorage.getItem(key), SCORE_KEY)).toBeNull()
  await cells.last().press('Shift+Enter')
  await expect(page.getByRole('heading', { name: 'Partial result', exact: true })).toBeVisible()
})

test('answer Enter cannot trigger native implicit form submission', async ({ page }) => {
  await page.goto('/')
  await chooseGridSize(page, 2)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('textbox').first().fill('1')
  await page.evaluate(() => {
    const form = document.createElement('form')
    form.id = 'implicit-submit-fixture'
    document.body.append(form)
    document.querySelectorAll('td input').forEach(input => input.setAttribute('form', form.id))
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.textContent = 'Implicit submit fixture'
    form.append(submit)
    form.dataset.submissions = '0'
    form.addEventListener('submit', event => {
      event.preventDefault()
      form.dataset.submissions = String(Number(form.dataset.submissions) + 1)
    })
  })
  const cell = page.getByRole('textbox').first()
  await cell.press('Enter')
  await cell.press('Space')
  await expect(cell).toBeFocused()
  await expect(cell).toHaveValue('1')
  await expect(page.locator('form')).toHaveAttribute('data-submissions', '0')
  await cell.press('Shift+Enter')
  await expect(page.getByRole('heading', { name: 'Partial result', exact: true })).toBeVisible()
  await expect(page.locator('form')).toHaveAttribute('data-submissions', '0')
})
