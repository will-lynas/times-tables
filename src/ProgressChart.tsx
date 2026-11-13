import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { buildProgress, formatDuration, progressTimeDomain, type ProgressPoint, type ProgressSelection } from './progress'
import { loadProgressSelection, saveProgressSelection } from './progressSettings'
import type { Score } from './scores'
import './progress.css'

const dateTime = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' })

export default function ProgressChart({ scores, initialSelection }: { scores: readonly Score[]; initialSelection: ProgressSelection }) {
  const [selection, setSelection] = useState(() => loadProgressSelection(initialSelection))
  const progress = useMemo(() => buildProgress(scores, selection), [scores, selection])
  const perfect = progress.points.filter(point => point.perfect)
  const other = progress.points.filter(point => !point.perfect)
  const domain = progressTimeDomain(progress.points)
  const shortRange = domain[1] - domain[0] <= 86400000
  const tickDate = new Intl.DateTimeFormat(undefined, shortRange ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', year: '2-digit' })
  const settingLabel = `${selection.mode === 'ordered' ? 'Ordered' : 'Shuffled'} · ${selection.size} × ${selection.size}`
  const latest = perfect.at(-1)

  function choose(change: Partial<ProgressSelection>) {
    const next = { ...selection, ...change }
    setSelection(next)
    saveProgressSelection(next)
  }

  return <section className="progress" aria-labelledby="progress-heading">
    <div className="progress-heading">
      <h2 id="progress-heading">Progress</h2>
      <span>{settingLabel}</span>
    </div>
    <div className="progress-controls" role="group" aria-label="Progress settings">
      <label className="grid-size">Progress order <select value={selection.mode} onChange={event => choose({ mode: event.currentTarget.value as ProgressSelection['mode'] })}>
        <option value="ordered">Ordered</option><option value="shuffled">Shuffled</option>
      </select></label>
      <label className="grid-size">Progress size <select value={selection.size} onChange={event => choose({ size: Number(event.currentTarget.value) })}>
        {Array.from({ length: 11 }, (_, index) => index + 2).map(size => <option key={size} value={size}>{size} × {size}</option>)}
      </select></label>
    </div>
    {progress.points.length === 0 ? <p className="progress-empty">No rounds for {settingLabel}.</p> : <>
      <p id="progress-summary" className="progress-summary">
        {progress.points.length} {progress.points.length === 1 ? 'round' : 'rounds'} · {progress.perfectCount} perfect
        {latest && <> · Average {formatDuration(latest.averageSeconds!)}{progress.perfectCount < 10 && <> · Warm-up: {latest.averageCount}/10 perfect rounds</>}</>}
        {!latest && <> · No perfect complete rounds</>}
      </p>
      <div className="progress-plot" role="img" aria-label={`Duration by date: ${settingLabel}`} aria-describedby="progress-summary progress-method">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ScatterChart margin={{ top: 16, right: 24, bottom: 20, left: 8 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--gray-5)" />
            <XAxis type="number" dataKey="timestamp" scale="time" domain={domain} tickFormatter={value => tickDate.format(value)} tickCount={6}
              tickLine={false} axisLine={false} minTickGap={45} padding={{ left: 12, right: 12 }} tick={{ fill: 'var(--gray-11)', fontSize: 12 }}
              label={{ value: 'Date', position: 'insideBottom', offset: -12, fill: 'var(--gray-11)', fontSize: 12 }} />
            <YAxis type="number" dataKey="seconds" name="Duration" domain={[0, 'auto']} tickFormatter={formatDuration} width={82}
              tickLine={false} axisLine={false} padding={{ top: 8, bottom: 8 }} tick={{ fill: 'var(--gray-11)', fontSize: 12 }}
              label={{ value: 'Duration', angle: -90, position: 'insideLeft', fill: 'var(--gray-11)', fontSize: 12 }} />
            <ZAxis range={[44, 44]} />
            <Tooltip cursor={false} isAnimationActive={false} content={({ active, payload }) => {
              const point: ProgressPoint | undefined = payload?.[0]?.payload
              if (!active || !point) return null
              return <div className="progress-tooltip">
                <strong>{dateTime.format(point.timestamp)}</strong>
                <span>{point.status === 'complete' ? 'Complete' : 'Partial'} · {formatDuration(point.seconds)}</span>
                <span>{point.attempted} / {point.total} attempted · {Number(point.accuracy.toFixed(1))}% accuracy</span>
                {point.perfect && <span>Rolling average {formatDuration(point.averageSeconds!)} ({point.averageCount}/10)</span>}
              </div>
            }} />
            <Legend verticalAlign="top" height={32} iconSize={9} wrapperStyle={{ fontSize: 12, pointerEvents: 'none' }} />
            <Line className="progress-average" data={perfect} dataKey="averageSeconds" name="Rolling average · 10 perfect complete" type="linear"
              stroke="var(--accent-11)" strokeWidth={1.75} strokeDasharray="5 4" dot={{ r: 2, strokeWidth: 0, fill: 'var(--accent-11)' }} activeDot={false} isAnimationActive={false} />
            <Scatter className="progress-other" name="Partial / inaccurate" data={other} fill="var(--gray-11)" fillOpacity={0.4} isAnimationActive={false} />
            <Scatter className="progress-perfect" name="Perfect complete" data={perfect} fill="var(--gray-12)" isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <span id="progress-method" className="visually-hidden">Each point is a saved round at its completion date. Faint points are partial or inaccurate. The dashed line is the trailing average of up to 10 perfect complete rounds for this exact order and size, using fewer rounds during warm-up. Lines connect calculated averages, not continuous observations. Dates use your local time zone. Identical timestamps retain saved order.</span>
      <details className="progress-data">
        <summary>Data table</summary>
        <table className="score-table" aria-label="Progress data">
          <thead><tr><th scope="col">Date</th><th scope="col">Status</th><th scope="col">Attempted</th><th scope="col">Accuracy</th><th scope="col">Duration</th><th scope="col">Rolling 10 perfect</th></tr></thead>
          <tbody>{progress.points.map(point => <tr key={point.id} className={point.perfect ? undefined : 'progress-muted'}>
            <td><time dateTime={point.completedAt}>{dateTime.format(point.timestamp)}</time></td>
            <td>{point.status === 'complete' ? 'Complete' : 'Partial'}</td><td>{point.attempted} / {point.total}</td>
            <td>{Number(point.accuracy.toFixed(1))}%</td><td>{formatDuration(point.seconds)}</td>
            <td>{point.averageSeconds === null ? '—' : `${formatDuration(point.averageSeconds)} (${point.averageCount}/10)`}</td>
          </tr>)}</tbody>
        </table>
      </details>
    </>}
  </section>
}
