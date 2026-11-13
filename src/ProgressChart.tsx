import { useMemo, useState } from 'react'
import { Line, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { buildProgress, formatDuration, progressTimeDomain, type ProgressPoint, type ProgressSelection } from './progress'
import { loadProgressSelection, saveProgressSelection } from './progressSettings'
import { scoreFactors, type Score } from './scores'
import { factorOption, factorsFromOption, presetFactors, settingLabel as labelFactors } from './factors'
import { FactorSetOptions } from './FactorSetOptions'
import { AttemptTime } from './AttemptTime'
import './progress.css'

const dateTime = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' })

export default function ProgressChart({ scores, initialSelection }: { scores: readonly Score[]; initialSelection: ProgressSelection }) {
  const [selection, setSelection] = useState(() => loadProgressSelection(initialSelection))
  const progress = useMemo(() => buildProgress(scores, selection), [scores, selection])
  const perfect = progress.points.filter(point => point.perfect)
  const other = progress.points.filter(point => !point.perfect)
  const domain = progressTimeDomain(progress.points)
  const factors = selection.factors ?? presetFactors(selection.size)
  const settingLabel = `${selection.mode === 'ordered' ? 'Ordered' : 'Shuffled'} · ${labelFactors(factors)}`

  function choose(change: Partial<ProgressSelection>) {
    const next = { ...selection, ...change }
    setSelection(next)
    saveProgressSelection(next)
  }

  return <section className="progress" aria-labelledby="progress-heading">
    <div className="progress-heading">
      <h2 id="progress-heading">Progress</h2>
      <div className="progress-controls" role="group" aria-label="Progress settings">
        <label className="grid-size"><span className="visually-hidden">Progress order</span><select value={selection.mode} onChange={event => choose({ mode: event.currentTarget.value as ProgressSelection['mode'] })}>
          <option value="ordered">Ordered</option><option value="shuffled">Shuffled</option>
        </select></label>
        <label className="grid-size"><span className="visually-hidden">Progress size</span><select value={factorOption(factors)} onChange={event => {
          const values = factorsFromOption(event.currentTarget.value)
          choose({ size: values.length, factors: values })
        }}>
          <FactorSetOptions sets={[...scores.map(scoreFactors), factors, initialSelection.factors ?? presetFactors(initialSelection.size)]} />
        </select></label>
      </div>
    </div>
    {selection.warning && <p className="storage-warning" role="alert">{selection.warning}</p>}
    {progress.points.length === 0 ? <p className="progress-empty">No rounds for {settingLabel}.</p> : <>
      <div className="progress-plot" role="img" aria-label={`Duration by date: ${settingLabel}`} aria-describedby="progress-method">
        <ResponsiveContainer width="100%" height={280} minWidth={0}>
          <ScatterChart margin={{ top: 12, right: 12, bottom: 4, left: 0 }} accessibilityLayer>
            <XAxis hide type="number" dataKey="timestamp" scale="time" domain={domain} tickCount={6} padding={{ left: 12, right: 12 }} />
            <YAxis hide type="number" dataKey="seconds" name="Duration" domain={[0, 'auto']} tickCount={4} padding={{ top: 8, bottom: 8 }} />
            <ZAxis range={[44, 44]} />
            <Tooltip cursor={false} isAnimationActive={false} content={({ active, payload }) => {
              const point: ProgressPoint | undefined = payload?.[0]?.payload
              if (!active || !point) return null
              return <div className="progress-tooltip">
                <div className="progress-tooltip-heading">
                  <strong className="progress-tooltip-duration">{formatDuration(point.seconds)}</strong>
                  <span className="progress-tooltip-status">{point.status === 'complete' ? 'Complete' : 'Partial'}</span>
                </div>
                <dl>
                  <dt>Accuracy</dt><dd>{Number(point.accuracy.toFixed(1))}%</dd>
                  <dt>Answered</dt><dd>{point.attempted} / {point.total}</dd>
                  {point.perfect && <><dt>Average</dt><dd>{formatDuration(point.averageSeconds!)}</dd></>}
                </dl>
                <time dateTime={point.completedAt}>{dateTime.format(point.timestamp)}</time>
              </div>
            }} />
            <Line className="progress-results" data={progress.points} dataKey="seconds" name="Saved results" type="linear"
              stroke="var(--gray-11)" strokeOpacity={0.25} strokeWidth={1} dot={false} activeDot={false} isAnimationActive={false} />
            <Line className="progress-average" data={perfect} dataKey="averageSeconds" name="Average (10 perfect)" type="linear"
              stroke="var(--accent-11)" strokeWidth={1.75} dot={false} activeDot={false} isAnimationActive={false} />
            <Scatter className="progress-other" name="Partial / inaccurate" data={other} fill="var(--gray-11)" fillOpacity={0.4} isAnimationActive={false} />
            <Scatter className="progress-perfect" name="Perfect" data={perfect} fill="var(--gray-12)" isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <span id="progress-method" className="visually-hidden">Each point is a saved round at its completion date. Faint points are partial or inaccurate. The accent line is the trailing average of up to 10 perfect complete rounds for this exact order and factor set, using fewer rounds during warm-up. The faint line connects all saved rounds chronologically at their actual durations, including partial and inaccurate rounds. These connecting lines do not represent continuous observations. Dates use your local time zone. Identical timestamps retain saved order.</span>
      <div className="progress-data">
        <table className="score-table" aria-label="Progress data">
          <thead><tr><th scope="col">Date</th><th scope="col">Status</th><th scope="col">Attempted</th><th scope="col">Accuracy</th><th scope="col">Duration</th></tr></thead>
          <tbody>{progress.points.map(point => <tr key={point.id} className={point.perfect ? undefined : 'progress-muted'}>
            <td><AttemptTime completedAt={point.completedAt} /></td>
            <td>{point.status === 'complete' ? 'Complete' : 'Partial'}</td><td>{point.attempted} / {point.total}</td>
            <td>{Number(point.accuracy.toFixed(1))}%</td><td>{formatDuration(point.seconds)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>
}
