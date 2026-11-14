import type { Mode } from './game'
import { scoreFactors, type Score } from './scores'
import { factorKey, presetFactors } from './factors'

export type ProgressSelection = { mode: Mode; size: number; factors?: number[]; axisMode?: 'time' | 'runs'; warning?: string }
export type ProgressPoint = Score & {
  runNumber: number
  x: number
  timestamp: number
  seconds: number
  perfect: boolean
  accuracy: number
  averageSeconds: number | null
  averageCount: number
  average100Seconds: number | null
  average100Count: number
  bestSeconds: number | null
  isRecord: boolean
}

export function buildProgress(scores: readonly Score[], selection: ProgressSelection) {
  const key = factorKey(selection.factors ?? presetFactors(selection.size))
  // Undated records have no honest x coordinate. Omit only from this derived view;
  // never substitute a date or alter the stored source.
  const selected = scores.filter(score => score.mode === selection.mode && factorKey(scoreFactors(score)) === key
    && Number.isFinite(Date.parse(score.completedAt)))
    .sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt))
  const window: number[] = []
  let perfectCount = 0
  let bestSeconds: number | null = null
  const points: ProgressPoint[] = selected.map((score, index) => {
    const perfect = score.status === 'complete' && score.total === scoreFactors(score).length ** 2
      && score.attempted === score.total && score.correct === score.total
    const isRecord = perfect && (bestSeconds === null || score.elapsedMs / 1000 < bestSeconds)
    if (isRecord) bestSeconds = score.elapsedMs / 1000
    if (perfect) {
      perfectCount++
      window.push(score.elapsedMs / 1000)
      if (window.length > 100) window.shift()
    }
    const recent10 = window.slice(-10)
    const averageSeconds = perfect ? recent10.reduce((sum, seconds) => sum + seconds, 0) / recent10.length : null
    const average100Seconds = perfect ? window.reduce((sum, seconds) => sum + seconds, 0) / window.length : null
    return { ...score, runNumber: index + 1, x: selection.axisMode === 'runs' ? index + 1 : Date.parse(score.completedAt),
      timestamp: Date.parse(score.completedAt), seconds: score.elapsedMs / 1000,
      perfect, accuracy: score.attempted === 0 ? 0 : score.correct / score.attempted * 100,
      averageSeconds, averageCount: perfect ? recent10.length : 0,
      average100Seconds, average100Count: perfect ? window.length : 0, bestSeconds, isRecord }
  })
  return { points, perfectCount }
}

export function progressTimeDomain(points: readonly ProgressPoint[]): [number, number] {
  if (points.length === 0) return [0, 1]
  const first = points[0].timestamp
  const last = points[points.length - 1].timestamp
  return first === last ? [first - 60000, last + 60000] : [first, last]
}

export function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds * 100) / 100
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor(rounded / 60) % 60
  const rest = Math.round((rounded % 60) * 100) / 100
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', rest || rounded === 0 ? `${rest}s` : ''].filter(Boolean).join(' ')
}
