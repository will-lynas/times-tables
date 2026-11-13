import { canonicalFactors, factorOption } from './factors'
import { scoreFactors, type Score } from './scores'
import type { Mode } from './game'

export type RunStart = { id: string; mode: Mode; factors: number[] }
export type RunStarts = { starts: RunStart[]; incomplete: boolean; warning: string | null }

export const RUN_META_KEY = 'times-tables.run-tracking'
export const RUN_START_PREFIX = 'times-tables.run-start.'
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>
const browserStorage: StorageAccess = () => window.localStorage
const readWarning = 'Run tracking could not be read. Original data has been kept; started totals are unavailable.'

// One immutable key per run avoids read/modify/write counters losing starts across tabs.
export function loadRunStarts(scores: Score[], getStorage = browserStorage): RunStarts {
  try {
    const storage = getStorage()
    const raw = storage.getItem(RUN_META_KEY)
    let incomplete = scores.length > 0
    if (raw !== null) {
      const meta = JSON.parse(raw)
      if (!meta || meta.version !== 1 || typeof meta.incomplete !== 'boolean') throw new Error('Invalid tracking')
      incomplete = meta.incomplete
    }
    const starts: RunStart[] = []
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (!key?.startsWith(RUN_START_PREFIX)) continue
      const id = key.slice(RUN_START_PREFIX.length)
      const run = JSON.parse(storage.getItem(key) ?? 'null')
      const factors = canonicalFactors(run?.factors)
      if (!id || !run || run.version !== 1 || !['ordered', 'shuffled'].includes(run.mode) || !Array.isArray(run.factors) || factors.length === 0 || factors.length !== run.factors.length || factors.some((factor, i) => factor !== run.factors[i])) throw new Error('Invalid start')
      starts.push({ id, mode: run.mode, factors })
    }
    if (raw === null && starts.length) throw new Error('Missing tracking metadata')
    return { starts, incomplete, warning: null }
  } catch {
    return { starts: [], incomplete: true, warning: readWarning }
  }
}

export function recordRunStart(run: RunStart, scores: Score[], getStorage = browserStorage): RunStarts {
  const current = loadRunStarts(scores, getStorage)
  if (current.warning) return current
  try {
    const storage = getStorage()
    if (storage.getItem(RUN_META_KEY) === null) storage.setItem(RUN_META_KEY, JSON.stringify({ version: 1, incomplete: current.incomplete }))
    const key = RUN_START_PREFIX + run.id
    if (storage.getItem(key) === null) storage.setItem(key, JSON.stringify({ version: 1, mode: run.mode, factors: canonicalFactors(run.factors) }))
    return loadRunStarts(scores, getStorage)
  } catch {
    return { ...current, warning: 'Run start not saved: browser storage is unavailable or full. Started totals are unavailable.' }
  }
}

export function summarizeRuns(scores: Score[], tracking: RunStarts, mode: Mode | 'all', selection: string) {
  const matches = (run: Pick<RunStart, 'mode' | 'factors'>) => (mode === 'all' || run.mode === mode) && (selection === 'all' || factorOption(run.factors) === selection)
  const selected = [...new Map(scores.filter(score => matches({ ...score, factors: scoreFactors(score) })).map(score => [score.id, score])).values()]
  const started = new Set([...tracking.starts.filter(matches).map(run => run.id), ...selected.map(score => score.id)]).size
  const completed = selected.filter(score => score.status === 'complete' && score.attempted === score.total)
  return { started: tracking.warning ? null : started, completed: completed.length, perfect: completed.filter(score => score.correct === score.total).length, incomplete: tracking.incomplete }
}
