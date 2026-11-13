import { Tooltip } from '@radix-ui/themes'
import type { Score } from './scores'
import type { Mode } from './game'
import { summarizeRuns, type RunStarts } from './statistics'
import './statistics.css'

export function StatsSummary({ scores, tracking, mode, selection, unavailable = false }: { scores: Score[]; tracking: RunStarts; mode: Mode | 'all'; selection: string; unavailable?: boolean }) {
  const stats = summarizeRuns(scores, tracking, mode, selection)
  const startedDetail = stats.incomplete
    ? 'At least this many runs started. Older cancelled or abandoned runs were not recorded.'
    : 'Runs started, including cancelled and abandoned runs.'
  const perfectDetail = stats.completed ? `${stats.perfect} of ${stats.completed} completed runs fully correct.` : 'No completed runs yet.'
  const percentage = stats.completed ? `${Number((stats.perfect / stats.completed * 100).toFixed(1))}%` : '—'
  const metrics = [
    { label: 'Started', value: unavailable || stats.started === null ? '—' : `${stats.incomplete ? '≥' : ''}${stats.started.toLocaleString()}`, detail: unavailable || tracking.warning ? 'Started total unavailable because saved data could not be read or written.' : startedDetail },
    { label: 'Completed', value: unavailable ? '—' : stats.completed.toLocaleString(), detail: 'Runs with every answer filled, including incorrect answers.' },
    { label: 'Perfect', value: unavailable ? '—' : percentage, detail: unavailable ? 'Saved scores unavailable.' : perfectDetail },
  ]
  return <section className="run-statistics" aria-label="Run statistics" aria-description="All time in this browser, matching the Score filters.">
    {tracking.warning && !unavailable && <p className="storage-warning" role="alert">{tracking.warning}</p>}
    <dl>{metrics.map(metric => <div key={metric.label}><dt>{metric.label}</dt><Tooltip content={metric.detail}><dd tabIndex={0} aria-description={metric.detail}>{metric.value}</dd></Tooltip></div>)}</dl>
  </section>
}
