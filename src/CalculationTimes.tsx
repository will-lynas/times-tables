import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip } from 'recharts'
import { summarizeTiming, type TimingPair } from './calculationTiming'
import type { Score } from './scores'

function seconds(ms: number) { return `${Number((ms / 1000).toFixed(3))} s` }

function Distribution({ pair }: { pair: TimingPair }) {
  const points = pair.samples.map((sample, index) => ({ ...sample, seconds: sample.ms / 1000, observation: index + 1 }))
  const maximum = points.reduce((maximum, point) => Math.max(maximum, point.seconds), 0) || 1
  return <div className="timing-strip" role="img" aria-label={`${pair.row} × ${pair.column}: ${points.length} samples, 0 to ${maximum} seconds; circles correct, diamonds incorrect`}>
    <ResponsiveContainer width="100%" height={100}>
      <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: 12 }} accessibilityLayer={false}>
        <XAxis type="number" dataKey="seconds" domain={[0, maximum]} ticks={[0, maximum]} tickLine={false} axisLine={false}
          tickFormatter={value => `${Number(Number(value).toPrecision(3))} s`} tick={{ fill: 'var(--gray-11)', fontSize: 11 }} height={24} />
        <YAxis type="number" dataKey="observation" domain={[0, points.length + 1]} hide />
        <Tooltip cursor={false} content={({ active, payload }) => active && payload?.[0] ? <div className="timing-tooltip">{payload[0].payload.ms} ms · {payload[0].payload.status}</div> : null} />
        <Scatter name="Correct" data={points.filter(point => point.status === 'correct')} fill="var(--green-11)" shape="circle" isAnimationActive={false} />
        <Scatter name="Incorrect" data={points.filter(point => point.status === 'incorrect')} fill="var(--red-11)" shape="diamond" isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  </div>
}

export default function CalculationTimes({ scores }: { scores: Score[] }) {
  const summary = summarizeTiming(scores)
  return <>
    <div className="timing-heading"><h2 id="calculations-heading">Slow calculations</h2>
      <details className="timing-definition"><summary aria-label="Answer-entry timing definition">Answer-entry time</summary>
        <p>Active cell focus through the final edit, including thinking and corrections. Excludes hidden, unfocused and away time. Median ranks correct final answers only; — means none. Each strip uses its own seconds scale. Circles: correct. Diamonds: incorrect. Missing counts answered details without timing; older aggregate runs have unknown cell coverage, not zero.</p>
      </details>
    </div>
    <p className="detail-coverage">Timing coverage: {summary.timedRuns} / {summary.runs} runs · {summary.measured} measured answers · {summary.missingAnswers} missing</p>
    {summary.measured === 0 && <p>No answer-entry timings yet.</p>}
    {summary.pairs.length > 0 && <table className="score-table timing-table" aria-label="Slow calculations">
      <thead><tr><th scope="col">Calculation</th><th scope="col">Median correct</th><th scope="col">Samples</th><th scope="col">Distribution</th></tr></thead>
      <tbody>{summary.pairs.map(pair => <tr key={`${pair.row}:${pair.column}`}>
        <th scope="row">{pair.row} × {pair.column}</th>
        <td>{pair.medianMs === null ? '—' : seconds(pair.medianMs)}</td>
        <td className="timing-counts">{pair.correct} correct · {pair.incorrect} incorrect · {pair.missing} missing</td>
        <td>{pair.samples.length > 0 && <>
          <Distribution pair={pair} />
          <details className="timing-samples"><summary aria-label={`Timing samples for ${pair.row} × ${pair.column}`}>Samples ({pair.samples.length})</summary>
            <div className="timing-sample-scroll" tabIndex={0} role="region" aria-label={`Timing sample data for ${pair.row} × ${pair.column}`}><table aria-label={`Timing samples for ${pair.row} × ${pair.column}`}>
              <thead><tr><th>Outcome / answer</th><th>Entry</th><th>Focus</th><th>Visits / edits</th><th>Date</th></tr></thead>
              <tbody>{pair.samples.map(sample => <tr key={`${sample.runId}:${sample.index}`}>
                <td className={sample.status === 'correct' ? 'calculation-correct' : 'calculation-wrong'}>{sample.status === 'correct' ? 'Correct' : 'Incorrect'} / {sample.answer}</td>
                <td>{sample.ms} ms</td><td>{sample.focusedMs} ms</td><td>{sample.visits} / {sample.edits}</td>
                <td><time dateTime={sample.completedAt}>{new Date(sample.completedAt).toLocaleString()}</time></td>
              </tr>)}</tbody>
            </table></div>
          </details>
        </>}</td>
      </tr>)}</tbody>
    </table>}
  </>
}
