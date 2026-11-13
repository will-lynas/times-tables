import type { Mode } from './game'
import type { Score } from './scores'

export type ProgressSelection = { mode: Mode; size: number }
export type ProgressPoint = Score & {
  timestamp: number
  seconds: number
  perfect: boolean
  accuracy: number
  averageSeconds: number | null
  averageCount: number
}

export function buildProgress(scores: readonly Score[], selection: ProgressSelection) {
  const selected = scores.filter(score => score.mode === selection.mode && score.size === selection.size)
    .sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt))
  const window: number[] = []
  let perfectCount = 0
  const points: ProgressPoint[] = selected.map(score => {
    const perfect = score.status === 'complete' && score.attempted === score.total && score.correct === score.total
    if (perfect) {
      perfectCount++
      window.push(score.elapsedMs / 1000)
      if (window.length > 10) window.shift()
    }
    const averageSeconds = perfect ? window.reduce((sum, seconds) => sum + seconds, 0) / window.length : null
    return { ...score, timestamp: Date.parse(score.completedAt), seconds: score.elapsedMs / 1000,
      perfect, accuracy: score.attempted === 0 ? 0 : score.correct / score.attempted * 100,
      averageSeconds, averageCount: perfect ? window.length : 0 }
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
