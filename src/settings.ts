import type { Mode } from './game'
import { canonicalFactors, factorOption, factorsFromOption } from './factors'

const SETTINGS_KEY = 'times-tables.settings'
export type Settings = { mode: Mode; size: number; scoreMode: Mode | 'all'; scoreSize: number | 'all';
  choice?: 'preset' | 'custom'; customFactors?: number[]; scoreFactors?: string; warning?: string }

export function loadSettings(): Settings {
  const defaults: Settings = { mode: 'shuffled', size: 12, scoreMode: 'all', scoreSize: 'all' }
  try {
    const data: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
    if (typeof data !== 'object' || data === null) return defaults
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
      ...(choice === 'custom' || choice === 'preset' ? { choice } : {}),
      mode: mode === 'ordered' || mode === 'shuffled' ? mode : defaults.mode,
      size: typeof size === 'number' && Number.isInteger(size) && size >= 2 && size <= 12 ? size : defaults.size,
      scoreMode: scoreMode === 'ordered' || scoreMode === 'shuffled' ? scoreMode : 'all',
      scoreSize: typeof scoreSize === 'number' && Number.isInteger(scoreSize) && scoreSize >= 2 && scoreSize <= 12 ? scoreSize : 'all',
    }
  } catch {
    return defaults
  }
}

export function saveSettings(settings: Settings) {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw !== null) JSON.parse(raw) // Never replace unreadable original bytes.
    if (loadSettings().warning) return
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Keep this page usable when browser storage is unavailable.
  }
}
