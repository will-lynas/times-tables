import { factorOption, presetFactors, settingLabel } from './factors'

export function FactorSetOptions({ sets }: { sets: readonly (readonly number[])[] }) {
  const unique = new Map<string, readonly number[]>()
  for (const factors of [...Array.from({ length: 11 }, (_, index) => presetFactors(index + 2)), ...sets]) {
    if (factors.length > 0) unique.set(factorOption(factors), factors)
  }
  return <>{[...unique].map(([value, factors]) => <option key={value} value={value}>{settingLabel(factors)}</option>)}</>
}
