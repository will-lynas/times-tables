export const FACTOR_OPTIONS = Array.from({ length: 20 }, (_, index) => index + 1)

// Reject invalid members before canonicalizing: never silently drop a saved value.
export function canonicalFactors(value: unknown, allowEmpty = false): number[] {
  if (!Array.isArray(value) || value.some(factor => !Number.isInteger(factor) || factor < 1 || factor > 20)
    || (!allowEmpty && value.length === 0)) throw new Error('Select factors from 1 to 20.')
  return [...new Set<number>(value)].sort((a, b) => a - b)
}

export function presetFactors(size: number): number[] {
  if (!Number.isInteger(size) || size < 2 || size > 12) throw new Error('Grid size must be a whole number from 2 to 12.')
  return FACTOR_OPTIONS.slice(0, size)
}

export function factorKey(factors: readonly number[]): string {
  return canonicalFactors(factors).join(',')
}

export function factorLabel(factors: readonly number[]): string {
  const values = canonicalFactors(factors, true)
  if (values.length === 0) return 'None'
  if (values.length > 1 && values.every((value, index) => value === index + 1)) return `1–${values.length}`
  return values.join(', ')
}

export function factorOption(factors: readonly number[]): string {
  const values = canonicalFactors(factors)
  return values.length >= 2 && values.length <= 12 && values.every((value, index) => value === index + 1)
    ? String(values.length) : `set:${factorKey(values)}`
}

export function factorsFromOption(value: string): number[] {
  return value.startsWith('set:') ? canonicalFactors(value.slice(4).split(',').map(Number)) : presetFactors(Number(value))
}

export function settingLabel(factors: readonly number[]): string {
  const values = canonicalFactors(factors)
  return factorOption(values) === String(values.length) ? `${values.length} × ${values.length}` : `{${factorLabel(values)}}`
}
