import type { ProgressSelection } from './progress'
import { canonicalFactors } from './factors'

const KEY = 'times-tables.progress'

export function loadProgressSelection(fallback: ProgressSelection): ProgressSelection {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (typeof data !== 'object' || data === null) return fallback
    const { mode, size, factors } = data as Record<string, unknown>
    if (factors !== undefined) {
      try {
        const values = canonicalFactors(factors)
        if ((mode !== 'ordered' && mode !== 'shuffled') || size !== values.length) throw new Error('Invalid selection')
        return { mode, size, factors: values }
      } catch {
        return { ...fallback, warning: 'Saved graph factors could not be read. Original selection has been kept; changes apply only on this page.' }
      }
    }
    return (mode === 'ordered' || mode === 'shuffled') && typeof size === 'number' && Number.isInteger(size) && size >= 2 && size <= 12
      ? { mode, size } : fallback
  } catch {
    return fallback
  }
}

export function saveProgressSelection(selection: ProgressSelection) {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw !== null) JSON.parse(raw)
    if (loadProgressSelection(selection).warning) return
    localStorage.setItem(KEY, JSON.stringify(selection))
  } catch {
    // Keep controls usable when browser storage is unavailable.
  }
}
