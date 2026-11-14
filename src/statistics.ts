import { parsePreserved } from './preservedJson'
import { canonicalFactors, factorOption } from './factors'
import { scoreFactors, type Score } from './scores'
import type { Mode } from './game'
import { mergeRecord, object } from './storage'
import { durableWrite, recoverWrites, type JournalStorage } from './writeJournal'

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
      const meta = parsePreserved(raw)
      if (!object(meta) || meta.version !== 1 || typeof meta.incomplete !== 'boolean') throw new Error('Invalid tracking')
      incomplete = meta.incomplete
    }
    const starts: RunStart[] = []
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (!key?.startsWith(RUN_START_PREFIX)) continue
      const id = key.slice(RUN_START_PREFIX.length)
      const run = parsePreserved(storage.getItem(key) ?? 'null')
      if (!object(run)) throw new Error('Invalid start')
      const rawFactors = run.factors
      const factors = canonicalFactors(rawFactors)
      if (!id || run.version !== 1 || !['ordered', 'shuffled'].includes(run.mode as string) || !Array.isArray(rawFactors) || factors.length === 0 || factors.length !== rawFactors.length || factors.some((factor, i) => factor !== rawFactors[i])) throw new Error('Invalid start')
      starts.push({ id, mode: run.mode as Mode, factors })
    }
    if (raw === null && starts.length) throw new Error('Missing tracking metadata')
    return { starts, incomplete, warning: null }
  } catch {
    return { starts: [], incomplete: true, warning: readWarning }
  }
}

function applyRunStart(storage: JournalStorage, payload: unknown) {
  if (!object(payload) || !object(payload.run) || typeof payload.incomplete !== 'boolean') throw new Error('Invalid start intent')
  const run = payload.run
  const current = loadRunStarts([], () => storage)
  if (current.warning) throw new Error('Unsupported tracking')
  if (typeof run.id !== 'string' || !run.id || !['ordered', 'shuffled'].includes(run.mode as string)) throw new Error('Invalid run')
  const factors = canonicalFactors(run.factors)
  if (JSON.stringify(factors) !== JSON.stringify(run.factors)) throw new Error('Invalid factors')
  const key = RUN_START_PREFIX + run.id
  const raw = storage.getItem(key)
  const { id: _id, ...fields } = run
  const event = { ...fields, version: 1 }
  if (raw !== null) {
    const original = parsePreserved(raw)
    if (!object(original)) throw new Error('Invalid start')
    const merged = mergeRecord(original, event)
    if (JSON.stringify(merged) !== JSON.stringify(original)) storage.setItem(key, JSON.stringify(merged))
    return
  }
  if (storage.getItem(RUN_META_KEY) === null) storage.setItem(RUN_META_KEY, JSON.stringify({ version: 1, incomplete: payload.incomplete }))
  storage.setItem(key, JSON.stringify(event))
}
export function recoverRunStarts(getStorage = browserStorage) { return recoverWrites(RUN_META_KEY, applyRunStart, getStorage) }
export function recordRunStart(run: RunStart, scores: Score[], getStorage = browserStorage): Promise<RunStarts> {
  const current = loadRunStarts(scores, getStorage)
  if (current.warning) return Promise.resolve(current)
  return durableWrite(RUN_META_KEY, { run, incomplete: current.incomplete }, applyRunStart, getStorage).then(warning =>
    warning ? { ...current, warning: `Run start not saved: ${warning}` } : loadRunStarts(scores, getStorage))
}

export function summarizeRuns(scores: Score[], tracking: RunStarts, mode: Mode | 'all', selection: string) {
  const matches = (run: Pick<RunStart, 'mode' | 'factors'>) => (mode === 'all' || run.mode === mode) && (selection === 'all' || factorOption(run.factors) === selection)
  const selected = [...new Map(scores.filter(score => matches({ ...score, factors: scoreFactors(score) })).map(score => [score.id, score])).values()]
  const started = new Set([...tracking.starts.filter(matches).map(run => run.id), ...selected.map(score => score.id)]).size
  const completed = selected.filter(score => score.status === 'complete' && score.attempted === score.total)
  const perfect = completed.filter(score => score.correct === score.total)
  const fastestSeconds = perfect.length ? Math.min(...perfect.map(score => score.elapsedMs / 1000)) : null
  return { finished: selected.length, fastestSeconds, started: tracking.warning ? null : started, completed: completed.length, perfect: perfect.length, incomplete: tracking.incomplete }
}
