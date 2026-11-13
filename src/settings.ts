import type { Mode } from './game'
import { canonicalFactors, factorOption, factorsFromOption } from './factors'
import { browserStorage, readPreferences, STORAGE_WARNING, writePreferences } from './storage'

const SETTINGS_KEY = 'times-tables.settings'
export type Settings = { mode: Mode; size: number; scoreMode: Mode | 'all'; scoreSize: number | 'all';
  choice?: 'preset' | 'custom'; customFactors?: number[]; scoreFactors?: string; warning?: string }

export function loadSettings(): Settings {
  const defaults: Settings = { mode: 'shuffled', size: 12, scoreMode: 'all', scoreSize: 'all' }
  try {
    const { data } = readPreferences(browserStorage(), SETTINGS_KEY)
    const { mode, size, scoreMode, scoreSize, choice, customFactors, scoreFactors } = data as Record<string, unknown>
    let custom: Partial<Settings> = {}
    if (customFactors !== undefined || choice === 'custom') {
      try { custom = { customFactors: canonicalFactors(customFactors, true) } }
      catch { custom = { customFactors: [], warning: 'Saved custom factors could not be read. Original settings have been kept; changes apply only on this page.' } }
    }
    let filter: Partial<Settings> = {}
    if (typeof scoreFactors === 'string') {
      try { filter = { scoreFactors: factorOption(factorsFromOption(scoreFactors)) } } catch { /* Ignore an invalid filter, not round factors. */ }
    }
    return {
      ...custom, ...filter,
      ...(!validSettings(data) && !custom.warning ? { warning: STORAGE_WARNING } : {}),
      ...(choice === 'custom' || choice === 'preset' ? { choice } : {}),
      mode: mode === 'ordered' || mode === 'shuffled' ? mode : defaults.mode,
      size: typeof size === 'number' && Number.isInteger(size) && size >= 2 && size <= 12 ? size : defaults.size,
      scoreMode: scoreMode === 'ordered' || scoreMode === 'shuffled' ? scoreMode : 'all',
      scoreSize: typeof scoreSize === 'number' && Number.isInteger(scoreSize) && scoreSize >= 2 && scoreSize <= 12 ? scoreSize : 'all',
    }
  } catch {
    return { ...defaults, warning: STORAGE_WARNING }
  }
}

function validSettings(data: Record<string, unknown>): boolean {
  try {
    if ('mode' in data && data.mode !== 'ordered' && data.mode !== 'shuffled') return false
    if ('scoreMode' in data && !['all', 'ordered', 'shuffled'].includes(data.scoreMode as string)) return false
    for (const key of ['size', 'scoreSize']) {
      const value = data[key]
      if (value !== undefined && !(key === 'scoreSize' && value === 'all') && !(Number.isInteger(value) && (value as number) >= 2 && (value as number) <= 12)) return false
    }
    if ('choice' in data && data.choice !== 'preset' && data.choice !== 'custom') return false
    if ('customFactors' in data) canonicalFactors(data.customFactors, true)
    if (data.choice === 'custom' && !('customFactors' in data)) return false
    if (data.scoreFactors !== undefined) factorsFromOption(data.scoreFactors as string)
    return true
  } catch { return false }
}

// Pass only intentional changes, not a stale UI snapshot.
export function saveSettings(change: Partial<Settings>): Promise<string | null> {
  return writePreferences(SETTINGS_KEY, change, validSettings)
}
