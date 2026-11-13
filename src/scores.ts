import type { Mode } from './game'

export const SCORE_KEY = 'times-tables.scores'
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem'>
const browserStorage: StorageAccess = () => window.localStorage

function isScore(value: unknown): value is Score {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  return typeof s.id === 'string' && s.id.length > 0
    && (s.mode === 'ordered' || s.mode === 'shuffled')
    && typeof s.size === 'number' && Number.isInteger(s.size) && s.size >= 2 && s.size <= 12
    && s.total === s.size * s.size
    && typeof s.attempted === 'number' && Number.isInteger(s.attempted) && s.attempted > 0 && s.attempted <= s.total
    && (s.status === 'complete' ? s.attempted === s.total : s.status === 'partial' && s.attempted < s.total)
    && typeof s.correct === 'number' && Number.isInteger(s.correct) && s.correct >= 0 && s.correct <= s.attempted
    && typeof s.elapsedMs === 'number' && Number.isFinite(s.elapsedMs) && s.elapsedMs >= 0
    && typeof s.completedAt === 'string' && Number.isFinite(Date.parse(s.completedAt))
}

export function loadScores(getStorage = browserStorage): { scores: Score[]; warning: string | null } {
  try {
    const raw = getStorage().getItem(SCORE_KEY)
    if (raw === null) return { scores: [], warning: null }
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null || !('version' in data) || (data.version !== 1 && data.version !== 2 && data.version !== 3)
      || !('scores' in data) || !Array.isArray(data.scores)) {
      throw new Error('Invalid score data')
    }
    const scores: unknown[] = data.scores.map(value => {
      if (data.version === 3) return value
      if (typeof value !== 'object' || value === null) return null
      return { ...value, size: data.version === 1 ? 12 : value.size, status: 'complete', attempted: value.total }
    })
    if (!scores.every(isScore)) throw new Error('Invalid score data')
    return { scores, warning: null }
  } catch {
    return { scores: [], warning: 'Saved scores could not be read. You can still play; scores may not persist.' }
  }
}

export function saveScores(scores: Score[], getStorage = browserStorage): string | null {
  try {
    getStorage().setItem(SCORE_KEY, JSON.stringify({ version: 3, scores }))
    return null
  } catch {
    return 'Score not saved: browser storage is unavailable or full. This result is kept only on this page.'
  }
}

export type Score = {
  id: string
  mode: Mode
  size: number
  correct: number
  status: 'complete' | 'partial'
  attempted: number
  total: number
  elapsedMs: number
  completedAt: string
}

export function rankScores(scores: Score[], mode: Mode, size = 12): Score[] {
  return scores.filter(score => score.mode === mode && score.size === size && score.status === 'complete')
    .sort((a, b) => b.correct - a.correct || a.elapsedMs - b.elapsedMs)
}
