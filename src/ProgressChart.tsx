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
  const runs = selection.axisMode === 'runs'
  const showAverage5 = selection.showAverage5 !== false
  const showAverage25 = selection.showAverage25 !== false
  const showRecord = selection.showRecord !== false
  const count = progress.points.length
  const domain: [number, number] = runs ? count > 1 ? [1, count] : [0, 2] : progressTimeDomain(progress.points)
  const runTicks = Array.from({ length: Math.min(count, 6) }, (_, i) => Math.round(1 + i * (count - 1) / (Math.min(count, 6) - 1 || 1)))
  const factors = selection.factors ?? presetFactors(selection.size)
  const settingLabel = `${selection.mode === 'ordered' ? 'Ordered' : 'Shuffled'} · ${labelFactors(factors)}`

  function choose(change: Partial<ProgressSelection>) {
    setSelection(current => ({ ...current, ...change }))
    void saveProgressSelection(change, selection).then(warning => {
      if (warning) setSelection(current => ({ ...current, warning }))
    })
  }

  return <section className="progress" aria-labelledby="progress-heading">
    <div className="progress-heading">
      <h2 id="progress-heading">Progress</h2>
      <div className="progress-controls" role="group" aria-label="Progress settings">
        <div className="progress-axis" role="group" aria-label="Graph x-axis">
          <button type="button" aria-pressed={!runs} onClick={() => choose({ axisMode: 'time' })}>Time</button>
          <button type="button" aria-pressed={runs} onClick={() => choose({ axisMode: 'runs' })}>Runs</button>
        </div>
        <StyledSelect label="Progress order" value={selection.mode} onChange={value => choose({ mode: value as ProgressSelection['mode'] })}
          options={[{ value: 'ordered', label: 'Ordered' }, { value: 'shuffled', label: 'Shuffled' }]} />
        <StyledSelect label="Progress size" sizes value={factorOption(factors)} onChange={value => {
          const values = factorsFromOption(value)
          choose({ size: values.length, factors: values })
        }} options={factorSetOptions([...scores.map(scoreFactors), factors, initialSelection.factors ?? presetFactors(initialSelection.size)])} />
      </div>
    </div>
    <div className="progress-legend" role="group" aria-label="Chart series">
      {([
        { flag: 'showAverage5', label: 'Average of 5', shown: showAverage5, stroke: 'var(--accent-11)', opacity: 0.38, width: 1.75 },
        { flag: 'showAverage25', label: 'Average of 25', shown: showAverage25, stroke: 'var(--accent-11)', opacity: 1, width: 2.25 },
        { flag: 'showRecord', label: 'Record', shown: showRecord, stroke: 'var(--gray-12)', opacity: 0.9, width: 2 },
      ] as const).map(series => <button key={series.flag} type="button" aria-pressed={series.shown} onClick={() => choose({ [series.flag]: !series.shown })}>
        <svg aria-hidden="true" width="24" height="12" viewBox="0 0 24 12">
          <path d={series.flag === 'showRecord' ? 'M1,3 H12 V9 H23' : 'M1,6 H23'} fill="none" stroke={series.stroke} strokeOpacity={series.opacity} strokeWidth={series.width} />
        </svg>
        <span>{series.label}</span>
        <span className="progress-legend-state" aria-hidden="true">{series.shown ? '✓' : '−'}</span>
      </button>)}
    </div>
    {selection.warning && <p className="storage-warning" role="alert">{selection.warning}</p>}
    {progress.points.length === 0 ? <p className="progress-empty">No rounds for {settingLabel}.</p> : <>
      <div className="progress-plot" role="img" aria-label={`Duration by ${runs ? 'run number' : 'date'}: ${settingLabel}`} aria-describedby="progress-method">
        <ResponsiveContainer width="100%" height={280} minWidth={0}>
          <ScatterChart margin={{ top: 12, right: 12, bottom: 4, left: 0 }} accessibilityLayer>
            <XAxis height={20} type="number" dataKey="x" scale={runs ? 'linear' : 'time'} domain={domain}
              ticks={runs ? runTicks : undefined} allowDecimals={false} tick={runs ? { fill: 'var(--gray-11)', fontSize: 11 } : false} tickLine={false} axisLine={false} padding={{ left: 12, right: 12 }} />
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
                  {runs && <><dt>Run</dt><dd>{point.runNumber}</dd></>}
                  <dt>Accuracy</dt><dd>{Number(point.accuracy.toFixed(1))}%</dd>
                  <dt>Answered</dt><dd>{point.attempted} / {point.total}</dd>
                  {point.perfect && <>
                    {showAverage5 && <><dt>Average of 5</dt><dd>{formatDuration(point.average5Seconds!)}</dd></>}
                    {showAverage25 && <><dt>Average of 25</dt><dd>{formatDuration(point.average25Seconds!)}</dd></>}
                    {showRecord && <><dt>Best time</dt><dd>{formatDuration(point.bestSeconds!)}</dd></>}
                  </>}
                </dl>
                <time dateTime={point.completedAt}>{dateTime.format(point.timestamp)}</time>
              </div>
            }} />
            {showAverage5 && <Line className="progress-average-5" data={perfect} dataKey="average5Seconds" name="Average of 5" type="linear"
              stroke="var(--accent-11)" strokeOpacity={0.38} strokeWidth={1.75}
              dot={perfect.length === 1 ? { r: 3, className: 'progress-average-5-dot' } : false} activeDot={false} isAnimationActive={false} />}
            {showAverage25 && <Line className="progress-average-25" data={perfect} dataKey="average25Seconds" name="Average of 25" type="linear"
              stroke="var(--accent-11)" strokeWidth={2.25}
              dot={perfect.length === 1 ? { r: 3, className: 'progress-average-25-dot' } : false} activeDot={false} isAnimationActive={false} />}
            {showRecord && <Line className="progress-best" data={progress.points} dataKey="bestSeconds" name="Best time" type="stepAfter"
              stroke="var(--gray-12)" strokeOpacity={0.9} strokeWidth={2}
              dot={({ cx, cy, payload }) => payload.isRecord ? <Dot cx={cx} cy={cy} r={3} className="progress-best-dot" fill="var(--gray-12)" /> : <g />}
              activeDot={false} isAnimationActive={false} />}
            <Scatter className="progress-other" name="Partial / inaccurate" data={other} fill="var(--gray-11)" fillOpacity={0.4} isAnimationActive={false} />
            <Scatter className="progress-perfect" name="Perfect" data={perfect} fill="var(--accent-11)" fillOpacity={0.5} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <span id="progress-method" className="visually-hidden">Unconnected points are saved rounds; Time spaces their completion dates proportionally, while Runs equally spaces all saved observations in chronological order starting at 1, including partial and inaccurate rounds. The faded and stronger yellow lines are trailing averages of up to 5 and 25 perfect complete rounds respectively for this exact order and factor set, using fewer rounds during warm-up and never filling missing observations with zeros. The contrasting best-time staircase is the cumulative minimum perfect complete duration: it begins at the first eligible round and steps down only at a strictly faster round's actual timestamp or run number. Dates use your local time zone. Identical timestamps retain saved order.</span>
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
