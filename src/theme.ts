import { browserStorage, lockedWrite, STORAGE_WARNING } from './storage'
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
export function saveTheme(appearance: Appearance): Promise<string | null> {
  return lockedWrite(KEY, () => {
    readTheme() // Never replace unknown future formats with a fallback.
    browserStorage().setItem(KEY, appearance)
  })
}
