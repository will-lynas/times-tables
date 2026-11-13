import type { Mode } from './game'

const SETTINGS_KEY = 'times-tables.settings'
export type Settings = { mode: Mode; size: number; scoreMode: Mode | 'all'; scoreSize: number | 'all' }

export function loadSettings(): Settings {
  const defaults: Settings = { mode: 'shuffled', size: 12, scoreMode: 'all', scoreSize: 'all' }
  try {
    const data: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
    if (typeof data !== 'object' || data === null) return defaults
    const { mode, size, scoreMode, scoreSize } = data as Record<string, unknown>
    return {
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
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Keep this page usable when browser storage is unavailable.
  }
}
