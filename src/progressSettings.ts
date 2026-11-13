import type { ProgressSelection } from './progress'

const KEY = 'times-tables.progress'

export function loadProgressSelection(fallback: ProgressSelection): ProgressSelection {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (typeof data !== 'object' || data === null) return fallback
    const { mode, size } = data as Record<string, unknown>
    return (mode === 'ordered' || mode === 'shuffled') && typeof size === 'number' && Number.isInteger(size) && size >= 2 && size <= 12
      ? { mode, size } : fallback
  } catch {
    return fallback
  }
}

export function saveProgressSelection(selection: ProgressSelection) {
  try {
    localStorage.setItem(KEY, JSON.stringify(selection))
  } catch {
    // Keep controls usable when browser storage is unavailable.
  }
}
