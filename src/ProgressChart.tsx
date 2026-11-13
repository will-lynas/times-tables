import { useMemo, useState } from 'react'
import { CartesianGrid, Dot, Line, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { buildProgress, formatDuration, progressTimeDomain, type ProgressPoint, type ProgressSelection } from './progress'
import { loadProgressSelection, saveProgressSelection } from './progressSettings'
import { scoreFactors, type Score } from './scores'
import { factorOption, factorsFromOption, presetFactors, settingLabel as labelFactors } from './factors'
import { factorSetOptions } from './FactorSetOptions'
import { StyledSelect } from './StyledSelect'
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
    void saveProgressSelection(change, selection).then(warning => {
      if (warning) setSelection(current => ({ ...current, warning }))
    })
  }

  return <section className="progress" aria-labelledby="progress-heading">
    <div className="progress-heading">
      <h2 id="progress-heading">Progress</h2>
      <div className="progress-controls" role="group" aria-label="Progress settings">
        <StyledSelect label="Progress order" value={selection.mode} onChange={value => choose({ mode: value as ProgressSelection['mode'] })}
          options={[{ value: 'ordered', label: 'Ordered' }, { value: 'shuffled', label: 'Shuffled' }]} />
        <StyledSelect label="Progress size" sizes value={factorOption(factors)} onChange={value => {
          const values = factorsFromOption(value)
          choose({ size: values.length, factors: values })
        }} options={factorSetOptions([...scores.map(scoreFactors), factors, initialSelection.factors ?? presetFactors(initialSelection.size)])} />
      </div>
    </div>
    {selection.warning && <p className="storage-warning" role="alert">{selection.warning}</p>}
    {progress.points.length === 0 ? <p className="progress-empty">No rounds for {settingLabel}.</p> : <>
      <div className="progress-plot" role="img" aria-label={`Duration by date: ${settingLabel}`} aria-describedby="progress-method">
        <ResponsiveContainer width="100%" height={280} minWidth={0}>
          <ScatterChart margin={{ top: 12, right: 12, bottom: 4, left: 0 }} accessibilityLayer>
            <XAxis hide type="number" dataKey="timestamp" scale="time" domain={domain} tickCount={6} padding={{ left: 12, right: 12 }} />
            <YAxis type="number" dataKey="seconds" name="Duration" domain={[0, 'auto']} tickCount={5} width={76}
              tickFormatter={formatDuration} tick={{ fill: 'var(--gray-11)', fontSize: 11 }} tickLine={false} axisLine={false} padding={{ top: 8, bottom: 8 }} />
            <CartesianGrid vertical={false} syncWithTicks stroke="var(--gray-11)" strokeOpacity={0.12} />
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
                  {point.perfect && <>
                    <dt>Average of 10</dt><dd>{formatDuration(point.averageSeconds!)}</dd>
                    <dt>Average of 100</dt><dd>{formatDuration(point.average100Seconds!)}</dd>
                    <dt>Best time</dt><dd>{formatDuration(point.bestSeconds!)}</dd>
                  </>}
                </dl>
                <time dateTime={point.completedAt}>{dateTime.format(point.timestamp)}</time>
              </div>
            }} />
            <Line className="progress-average-10" data={perfect} dataKey="averageSeconds" name="Average of 10" type="linear"
              stroke="var(--accent-11)" strokeOpacity={0.38} strokeWidth={1.75}
              dot={perfect.length === 1 ? { r: 3, className: 'progress-average-10-dot' } : false} activeDot={false} isAnimationActive={false} />
            <Line className="progress-average-100" data={perfect} dataKey="average100Seconds" name="Average of 100" type="linear"
              stroke="var(--accent-11)" strokeWidth={2.25}
              dot={perfect.length === 1 ? { r: 3, className: 'progress-average-100-dot' } : false} activeDot={false} isAnimationActive={false} />
            <Line className="progress-best" data={progress.points} dataKey="bestSeconds" name="Best time" type="stepAfter"
              stroke="var(--gray-12)" strokeOpacity={0.9} strokeWidth={2}
              dot={({ cx, cy, payload }) => payload.isRecord ? <Dot cx={cx} cy={cy} r={3} className="progress-best-dot" fill="var(--gray-12)" /> : <g />}
              activeDot={false} isAnimationActive={false} />
            <Scatter className="progress-other" name="Partial / inaccurate" data={other} fill="var(--gray-11)" fillOpacity={0.4} isAnimationActive={false} />
            <Scatter className="progress-perfect" name="Perfect" data={perfect} fill="var(--accent-11)" fillOpacity={0.5} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <span id="progress-method" className="visually-hidden">Unconnected points are saved rounds at their completion dates; faint points are partial or inaccurate. The faded and stronger yellow lines are trailing averages of up to 10 and 100 perfect complete rounds respectively for this exact order and factor set, using fewer rounds during warm-up and never filling missing observations with zeros. The contrasting best-time staircase is the cumulative minimum perfect complete duration: it begins at the first eligible round and steps down only at a strictly faster round's actual timestamp. Dates use your local time zone. Identical timestamps retain saved order.</span>
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
