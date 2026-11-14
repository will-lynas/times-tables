import { browserStorage, STORAGE_WARNING, type StoragePort } from './storage'
import { durableWrite, recoverWrites } from './writeJournal'
const KEY = 'times-tables.theme'
type Appearance = 'light' | 'dark'
function readTheme() {
  const raw = browserStorage().getItem(KEY)
  if (raw !== null && raw !== 'light' && raw !== 'dark') throw new Error('Unsupported theme')
  return raw ?? 'dark'
}
export function loadTheme(): { appearance: Appearance; warning: string | null } {
  try { return { appearance: readTheme(), warning: null } }
  catch { return { appearance: 'dark', warning: STORAGE_WARNING } }
}
function applyTheme(storage: StoragePort, appearance: unknown) {
  const raw = storage.getItem(KEY)
  if ((raw !== null && raw !== 'light' && raw !== 'dark') || (appearance !== 'light' && appearance !== 'dark')) throw new Error('Unsupported theme')
  storage.setItem(KEY, appearance)
}
export function recoverTheme() { return recoverWrites(KEY, applyTheme, browserStorage) }
export function saveTheme(appearance: Appearance): Promise<string | null> {
  return durableWrite(KEY, appearance, applyTheme, browserStorage)
}
