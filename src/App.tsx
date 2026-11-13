import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button, SegmentedControl, Theme } from '@radix-ui/themes'
import { createGrid, scoreAnswers, type Grid, type Mode } from './game'
import { loadScores, saveScores, rankScores, type Score } from './scores'

function formatTime(ms: number) {
  const tenths = Math.floor(ms / 100)
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`
}

export default function App() {
  const [appearance, setAppearance] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem('times-tables.theme') === 'light' ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  })

  function toggleTheme() {
    const next = appearance === 'dark' ? 'light' : 'dark'
    setAppearance(next)
    try {
      localStorage.setItem('times-tables.theme', next)
    } catch {
      // Keep the choice for this page when browser storage is unavailable.
    }
  }

  const [mode, setMode] = useState<Mode>('shuffled')
  const [grid, setGrid] = useState<Grid | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [answers, setAnswers] = useState<string[]>(Array(144).fill(''))
  const [result, setResult] = useState<ReturnType<typeof scoreAnswers> | null>(null)
  const [history, setHistory] = useState(loadScores)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const running = startedAt !== null
  const filled = answers.filter(Boolean).length
  const ranked = rankScores(history.scores, mode)
  const perfect = ranked.find(score => score.correct === 144)
  const placeholders = Array.from({ length: 12 }, () => null)

  useEffect(() => {
    if (startedAt === null) return
    inputs.current[0]?.focus()
    const interval = window.setInterval(() => setElapsed(performance.now() - startedAt), 50)
    return () => window.clearInterval(interval)
  }, [startedAt])

  function start() {
    if (grid !== null) return
    setGrid(createGrid(mode))
    setElapsed(0)
    setStartedAt(performance.now())
  }

  function finish() {
    if (!running || !grid || filled !== 144) return
    const elapsedMs = performance.now() - startedAt
    const completed = scoreAnswers(grid, answers)
    const score: Score = { id: crypto.randomUUID(), mode, correct: completed.correct, total: 144, elapsedMs, completedAt: new Date().toISOString() }
    const scores = [...history.scores, score]
    setStartedAt(null)
    setElapsed(elapsedMs)
    setResult(completed)
    setHistory({ scores, warning: saveScores(scores) })
  }

  function navigate(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const column = index % 12
    const target = {
      Enter: Math.min(index + 1, 143),
      ArrowRight: column < 11 ? index + 1 : index,
      ArrowLeft: column > 0 ? index - 1 : index,
      ArrowDown: index < 132 ? index + 12 : index,
      ArrowUp: index >= 12 ? index - 12 : index,
    }[event.key]
    if (target !== undefined) {
      event.preventDefault()
      inputs.current[target]?.focus()
    }
  }

  return <Theme appearance={appearance} accentColor="blue" grayColor="slate" radius="medium">
    <div className="small-screen"><h1>Times tables</h1><p>Bring a keyboard and a wider screen.</p><p>This practice grid needs a desktop window at least 1024 pixels wide.</p></div>
    <main className="practice">
      <header className="page-header">
        <div><h1>Times tables<span className="title-mark" aria-hidden="true"> ×</span></h1><p>One grid. A little faster each time.</p></div>
        <div className="header-actions"><span className="scope">1–12 / 144 answers</span><Button variant="soft" onClick={toggleTheme}>Switch to {appearance === 'dark' ? 'light' : 'dark'} mode</Button></div>
      </header>
      <section className="toolbar" aria-label="Round controls">
        <SegmentedControl.Root aria-label="Table order" value={mode} onValueChange={value => setMode(value as Mode)} disabled={grid !== null}>
          <SegmentedControl.Item value="ordered">Ordered</SegmentedControl.Item>
          <SegmentedControl.Item value="shuffled">Shuffled</SegmentedControl.Item>
        </SegmentedControl.Root>
        <div className="stats"><span>{filled} / 144 filled</span><span role="timer" aria-label="Elapsed time">{formatTime(elapsed)}</span></div>
        {grid === null && <Button onClick={start}>Start</Button>}
      </section>
      {history.warning && <p className="storage-warning" role="alert">{history.warning}</p>}
      {result && <section className="result-summary" aria-label="Round result" aria-live="polite">
        <h2>Round complete</h2><span>{result.correct} / 144 correct</span><span>{Number(result.accuracy.toFixed(1))}% accuracy</span>
        {!history.warning && <span className="save-status">Score saved in this browser.</span>}
      </section>}
      <table className="answer-grid" aria-label="Multiplication grid">
        <thead><tr><th scope="col" aria-label="Multiply">×</th>{(grid?.columns ?? placeholders).map((column, index) => <th scope="col" key={index}>{column ?? '·'}</th>)}</tr></thead>
        <tbody>{(grid?.rows ?? placeholders).map((row, rowIndex) => <tr key={rowIndex}>
          <th scope="row">{row ?? '·'}</th>
          {(grid?.columns ?? placeholders).map((column, columnIndex) => {
            const index = rowIndex * 12 + columnIndex
            return <td key={columnIndex}><input
              ref={element => { inputs.current[index] = element }}
              aria-label={row && column ? `${row} × ${column}` : `Row ${rowIndex + 1}, column ${columnIndex + 1}`}
              type="text" inputMode="numeric" autoComplete="off" disabled={grid === null} readOnly={result !== null} maxLength={3}
              value={answers[index]} onFocus={event => event.currentTarget.select()}
              onChange={event => {
                const value = event.currentTarget.value
                if (running && /^\d{0,3}$/.test(value)) setAnswers(current => current.map((answer, cell) => cell === index ? value : answer))
              }}
              onKeyDown={event => navigate(event, index)}
            /></td>
          })}
        </tr>)}</tbody>
      </table>
      <div className="grid-footer">
        <p>{result ? 'Your finished grid stays here for review.' : running ? 'Enter / Tab next · Shift + Tab back · Arrow keys move · Click to edit' : 'The grid is revealed when you start. The timer won’t pause.'}</p>
        {!result && <Button disabled={!running || filled !== 144} onClick={finish}>Finish</Button>}
      </div>
      <section className="scores" aria-labelledby="scores-heading">
        <div className="score-heading"><h2 id="scores-heading">{mode === 'ordered' ? 'Ordered' : 'Shuffled'} high scores</h2><span>{perfect ? `Fastest perfect: ${formatTime(perfect.elapsedMs)}` : 'No perfect round yet'}</span></div>
        {ranked.length === 0 ? <p>Finish a round to set your first score.</p> : <table className="score-table" aria-label={`${mode === 'ordered' ? 'Ordered' : 'Shuffled'} high scores`}>
          <thead><tr><th>Rank</th><th>Correct</th><th>Accuracy</th><th>Time</th></tr></thead>
          <tbody>{ranked.slice(0, 5).map((score, index) => <tr key={score.id}><td>{index + 1}</td><td>{score.correct} / 144</td><td>{Number((score.correct / 144 * 100).toFixed(1))}%</td><td>{formatTime(score.elapsedMs)}</td></tr>)}</tbody>
        </table>}
        <p className="storage-note">Best five per mode. Accuracy first, then time. Scores stay in this browser only.</p>
      </section>
    </main>
  </Theme>
}
