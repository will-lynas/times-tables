import { expect, test } from 'vitest'
import * as timing from './calculationTiming'
import { historicalTimedDetails } from './testFixtures/historicalCalculations'

test('retired timing module has no collector; historical validation remains available', () => {
  expect(timing).not.toHaveProperty('CalculationTimer')
  const details = historicalTimedDetails()
  expect(timing.validTiming(details.timing, details.cells)).toBe(true)
})

test('historical zero, blank and unknown timing metadata validate without mutation', () => {
  const details = historicalTimedDetails()
  const original = JSON.stringify(details)
  expect(timing.validTiming(details.timing, details.cells)).toBe(true)
  expect(JSON.stringify(details)).toBe(original)
  expect(details.timing!.cells[0].answerEntryMs).toBe(0)
  expect(details.timing!.cells[1].answerEntryMs).toBeNull()
})
