import type { Mode } from './game'
import { canonicalFactors, factorKey, presetFactors } from './factors'

export const SCORE_KEY = 'times-tables.scores'
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem'>
const browserStorage: StorageAccess = () => window.localStorage

function isScore(value: unknown): value is Score {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  return typeof s.id === 'string' && s.id.length > 0
    && (s.mode === 'ordered' || s.mode === 'shuffled')
    && typeof s.size === 'number' && Number.isInteger(s.size) && s.size >= 1 && s.size <= 20
    && Array.isArray(s.factors) && canonicalFactors(s.factors).length === s.size
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
    if (typeof data !== 'object' || data === null || !('version' in data) || (data.version !== 1 && data.version !== 2 && data.version !== 3 && data.version !== 4)
      || !('scores' in data) || !Array.isArray(data.scores)) {
      throw new Error('Invalid score data')
    }
    const scores: unknown[] = data.scores.map(value => {
      if (typeof value !== 'object' || value === null) return null
      if (data.version === 4) {
        const factors = canonicalFactors(value.factors)
        if (factors.length !== value.size) throw new Error('Inconsistent factors')
        return { ...value, factors }
      }
      const size = data.version === 1 ? 12 : value.size
      const factors = presetFactors(size)
      return { ...value, size, factors, ...(data.version === 3 ? {} : { status: 'complete', attempted: value.total }) }
    })
    if (!scores.every(isScore)) throw new Error('Invalid score data')
    return { scores, warning: null }
  } catch {
    return { scores: [], warning: 'Saved scores could not be read. You can still play; scores may not persist.' }
  }
}

export function saveScores(scores: Score[], getStorage = browserStorage): string | null {
  try {
    if (loadScores(getStorage).warning) return 'Score not saved: existing saved scores could not be read. Original data has been kept.'
    const normalized = scores.map(score => ({ ...score, factors: scoreFactors(score) }))
    if (!normalized.every(isScore)) throw new Error('Invalid scores')
    getStorage().setItem(SCORE_KEY, JSON.stringify({ version: 4, scores: normalized }))
    return null
  } catch {
    return 'Score not saved: browser storage is unavailable or full. This result is kept only on this page.'
  }
}

export type Score = {
  id: string
  mode: Mode
  size: number
  factors?: number[]
  correct: number
  status: 'complete' | 'partial'
  attempted: number
  total: number
  elapsedMs: number
  completedAt: string
}

// Optional only for source compatibility with legacy callers; loaded/new records carry factors.
export function scoreFactors(score: Pick<Score, 'size' | 'factors'>): number[] {
  return score.factors === undefined ? presetFactors(score.size) : canonicalFactors(score.factors)
}

export function rankScores(scores: Score[], mode: Mode, selection: number | readonly number[] = 12): Score[] {
  const key = factorKey(typeof selection === 'number' ? presetFactors(selection) : selection)
  return scores.filter(score => score.mode === mode && factorKey(scoreFactors(score)) === key && score.status === 'complete')
    .sort((a, b) => b.correct - a.correct || a.elapsedMs - b.elapsedMs)
}
