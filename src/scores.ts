import type { Mode } from './game'

export const SCORE_KEY = 'times-tables.scores'
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem'>
const browserStorage: StorageAccess = () => window.localStorage

function isScore(value: unknown): value is Score {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  return typeof s.id === 'string' && s.id.length > 0
    && (s.mode === 'ordered' || s.mode === 'shuffled')
    && typeof s.correct === 'number' && Number.isInteger(s.correct) && s.correct >= 0 && s.correct <= 144
    && s.total === 144
    && typeof s.elapsedMs === 'number' && Number.isFinite(s.elapsedMs) && s.elapsedMs >= 0
    && typeof s.completedAt === 'string' && Number.isFinite(Date.parse(s.completedAt))
}

export function loadScores(getStorage = browserStorage): { scores: Score[]; warning: string | null } {
  try {
    const raw = getStorage().getItem(SCORE_KEY)
    if (raw === null) return { scores: [], warning: null }
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null || !('version' in data) || data.version !== 1
      || !('scores' in data) || !Array.isArray(data.scores) || !data.scores.every(isScore)) {
      throw new Error('Invalid score data')
    }
    return { scores: data.scores, warning: null }
  } catch {
    return { scores: [], warning: 'Saved scores could not be read. You can still play; scores may not persist.' }
  }
}

export function saveScores(scores: Score[], getStorage = browserStorage): string | null {
  try {
    getStorage().setItem(SCORE_KEY, JSON.stringify({ version: 1, scores }))
    return null
  } catch {
    return 'Score not saved: browser storage is unavailable or full. This result is kept only on this page.'
  }
}

export type Score = {
  id: string
  mode: Mode
  correct: number
  total: 144
  elapsedMs: number
  completedAt: string
}

export function rankScores(scores: Score[], mode: Mode): Score[] {
  return scores.filter(score => score.mode === mode)
    .sort((a, b) => b.correct - a.correct || a.elapsedMs - b.elapsedMs)
}
