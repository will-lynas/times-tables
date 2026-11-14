import { Tooltip } from '@radix-ui/themes'
import type { Score } from './scores'
import type { Mode } from './game'
import { summarizeRuns, type RunStarts } from './statistics'
import { formatDuration } from './progress'
import './statistics.css'

export function StatsSummary({ scores, tracking, mode, selection, unavailable = false }: { scores: Score[]; tracking: RunStarts; mode: Mode; selection: string; unavailable?: boolean }) {
  const stats = summarizeRuns(scores, tracking, mode, selection)
  const percentage = stats.completed ? `${Number((stats.perfect / stats.completed * 100).toFixed(1))}%` : '—'
  const metrics = [
    { label: 'Finished', value: stats.finished.toLocaleString(), detail: 'Submitted rounds, including partial results. Excludes cancelled and unfinished rounds.' },
    { label: 'Fully filled', value: stats.completed.toLocaleString(), detail: 'Rounds with every answer filled, including incorrect answers.' },
    { label: 'Perfect', value: percentage, detail: stats.completed ? `${stats.perfect} of ${stats.completed} fully filled rounds fully correct.` : 'No fully filled rounds yet.' },
    { label: 'Fastest', value: stats.fastestSeconds === null ? '—' : formatDuration(stats.fastestSeconds), detail: 'Fastest fully correct, fully filled round.' },
  ]
  return <section className="run-statistics" aria-label="Run statistics" aria-description="Matching the selected exact settings.">
    {tracking.warning && !unavailable && <p className="storage-warning" role="alert">{tracking.warning}</p>}
    <dl>{metrics.map(metric => <div key={metric.label}><dt>{metric.label}</dt><Tooltip content={unavailable ? 'Saved scores unavailable.' : metric.detail}><dd tabIndex={0} aria-description={unavailable ? 'Saved scores unavailable.' : metric.detail}>{unavailable ? '—' : metric.value}</dd></Tooltip></div>)}</dl>
  </section>
}
