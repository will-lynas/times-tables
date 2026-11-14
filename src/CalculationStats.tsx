import { summarizeCalculations } from './calculations'
import { lazy, Suspense, useState } from 'react'
import { SegmentedControl } from '@radix-ui/themes'
import type { Score } from './scores'
import './calculations.css'
const CalculationTimes = lazy(() => import('./CalculationTimes'))

export function CalculationStats({ scores, unavailable = false }: { scores: Score[]; unavailable?: boolean }) {
  const [view, setView] = useState('errors')
  if (unavailable) return <section aria-label="Calculation statistics"><p>Calculation details unavailable.</p></section>
  const summary = summarizeCalculations(scores)
  return <section className="calculation-stats" aria-labelledby="calculations-heading">
    <SegmentedControl.Root aria-label="Calculation view" value={view} onValueChange={setView}>
      <SegmentedControl.Item value="errors">Errors</SegmentedControl.Item>
      <SegmentedControl.Item value="times">Times</SegmentedControl.Item>
    </SegmentedControl.Root>
    {view === 'times' ? <Suspense fallback={<p role="status">Loading timings…</p>}><CalculationTimes scores={scores} /></Suspense> : <>
    <h2 id="calculations-heading">Incorrect calculations</h2>
    <p className="detail-coverage">Detail coverage: {summary.detailedRuns} / {summary.runs} runs · {summary.answered} answered</p>
    {summary.detailedRuns === 0 ? <p>No calculation details yet.</p> : summary.incorrect.length === 0 ? <p>No incorrect answers in recorded details.</p> :
      <table className="score-table calculation-table" aria-label="Incorrect calculations">
        <thead><tr><th scope="col">Calculation</th><th scope="col">Wrong</th><th scope="col">Answered</th><th scope="col">Error rate</th><th scope="col">Answers</th></tr></thead>
        <tbody>{summary.incorrect.map(item => <tr key={`${item.row}:${item.column}`}>
          <th scope="row">{item.row} × {item.column}</th><td className="calculation-wrong">{item.wrong}</td><td>{item.answered}</td>
          <td title={`${item.wrong} / ${item.answered}`}>{Number((item.errorRate * 100).toFixed(1))}%</td>
          <td><details><summary aria-label={`Incorrect answers for ${item.row} × ${item.column}`}>Answers</summary>
            <div className="calculation-answers"><span className="calculation-correct">Correct: {item.product}</span>
              <ul>{item.answers.map(([answer, count]) => <li key={answer}><span className="calculation-wrong">{answer}</span> ({count})</li>)}</ul>
            </div>
          </details></td>
        </tr>)}</tbody>
      </table>}
    </>}
  </section>
}
