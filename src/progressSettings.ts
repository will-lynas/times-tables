import type { ProgressSelection } from './progress'
import { canonicalFactors } from './factors'
import { browserStorage, readPreferences, STORAGE_WARNING, preferenceWriter } from './storage'
import { durableWrite, recoverWrites } from './writeJournal'

const KEY = 'times-tables.progress'

export function loadProgressSelection(fallback: ProgressSelection): ProgressSelection {
  try {
    const { raw, data } = readPreferences(browserStorage(), KEY)
    if (raw === null) return fallback
    if (!validSelection(data)) return { ...fallback, warning: STORAGE_WARNING }
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
    return { ...fallback, warning: STORAGE_WARNING }
  }
}

function validSelection(data: Record<string, unknown>): boolean {
  try {
    if (Object.keys(data).length === 0) return true
    if (data.mode !== 'ordered' && data.mode !== 'shuffled') return false
    if (data.factors !== undefined) return canonicalFactors(data.factors).length === data.size
    return Number.isInteger(data.size) && (data.size as number) >= 2 && (data.size as number) <= 12
  } catch { return false }
}

export function recoverProgressSelection() {
  return recoverWrites(KEY, preferenceWriter(KEY, validSelection), browserStorage)
}

export function saveProgressSelection(change: Partial<ProgressSelection>, defaults?: ProgressSelection): Promise<string | null> {
  return durableWrite(KEY, { change, defaults: defaults ?? {} }, preferenceWriter(KEY, validSelection), browserStorage)
}
