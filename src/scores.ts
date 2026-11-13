import type { Mode } from './game'
import { canonicalFactors, factorKey, presetFactors } from './factors'

export const SCORE_KEY = 'times-tables.scores'
import { backup, browserStorage, lockedWrite, mergeRecord, object } from './storage'

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

function readScores(raw: string | null) {
  if (raw === null) return { data: { version: 4, scores: [] } as Record<string, unknown>, scores: [] as Score[] }
  const data: unknown = JSON.parse(raw)
  if (!object(data) || ![1, 2, 3, 4].includes(data.version as number) || !Array.isArray(data.scores)) throw new Error('Unsupported scores')
  let records = data.scores
  // Explicit additive steps. Reserved fields present in a legacy record must
  // agree with the migration, otherwise preserve the source rather than repair it.
  for (let version = data.version as number; version < 4; version++) {
    records = records.map(value => {
      if (!object(value)) throw new Error('Invalid record')
      const additions = version === 1 ? { size: 12 }
        : version === 2 ? { status: 'complete', attempted: value.total }
        : { factors: presetFactors(value.size as number) }
      return mergeRecord(value, additions)
    })
  }
  if (!records.every(isScore)) throw new Error('Invalid score data')
  const ids = new Set(records.map(score => score.id))
  if (ids.size !== records.length) throw new Error('Duplicate record IDs')
  return { data, scores: records }
}

export function loadScores(getStorage = browserStorage): { scores: Score[]; warning: string | null } {
  try {
    return { scores: readScores(getStorage().getItem(SCORE_KEY)).scores, warning: null }
  } catch {
    return { scores: [], warning: 'Saved scores could not be read. Original data has been kept; you can still play on this page.' }
  }
}

// Append/union, never replacement. All app writers participate in Web Locks.
export async function saveScores(scores: Score[], getStorage = browserStorage): Promise<string | null> {
  const warning = await lockedWrite(SCORE_KEY, () => {
    const storage = getStorage()
    const raw = storage.getItem(SCORE_KEY)
    const existing = readScores(raw)
    const records = [...existing.scores]
    for (const score of scores) {
      const incoming = score.factors === undefined ? { ...score, factors: presetFactors(score.size) } : score
      if (!isScore(incoming)) throw new Error('Invalid score')
      const index = records.findIndex(item => item.id === incoming.id)
      if (index < 0) records.push(incoming)
      else records[index] = mergeRecord(records[index], incoming) as Score
    }
    if (raw !== null && existing.data.version !== 4) backup(storage, SCORE_KEY, existing.data.version as number, raw)
    storage.setItem(SCORE_KEY, JSON.stringify({ ...existing.data, version: 4, scores: records }))
  })
  return warning ? `Score not saved: ${warning}` : null
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
