import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Button, IconButton, SegmentedControl, Theme } from '@radix-ui/themes'
import { canonicalFactors, presetFactors, factorOption, settingLabel } from './factors'
import { createGrid, scoreAnswers, type Grid, type Mode } from './game'
import { loadScores, saveScores, rankScores, scoreFactors, type Score } from './scores'
import { loadSettings, saveSettings, type Settings } from './settings'
import { FactorSetOptions } from './FactorSetOptions'
import { GridSizePicker } from './GridSizePicker'
import { AttemptTime } from './AttemptTime'
import { StatsSummary } from './StatsSummary'
import { loadRunStarts, recordRunStart, RUN_META_KEY, RUN_START_PREFIX } from './statistics'
const ProgressChart = lazy(() => import('./ProgressChart'))

function formatTime(ms: number) {
  const tenths = Math.floor(ms / 100)
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`
}

type Page = 'practice' | 'stats' | 'about'

function pageFromPath(): Page {
  if (window.location.pathname === '/about') return 'about'
  return ['/stats', '/progress'].includes(window.location.pathname) ? 'stats' : 'practice'
}

export default function App() {
  const [page, setPage] = useState<Page>(pageFromPath)
  useEffect(() => {
    const syncPage = () => setPage(pageFromPath())
    window.addEventListener('popstate', syncPage)
    return () => window.removeEventListener('popstate', syncPage)
  }, [])
  function changePage(event: MouseEvent<HTMLAnchorElement>, next: Page) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (page === next) return
    window.history.pushState(null, '', next === 'practice' ? '/' : `/${next}`)
    setPage(next)
    window.scrollTo(0, 0)
  }
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

  const [settings, setSettings] = useState(loadSettings)
  const { mode, scoreMode, scoreSize } = settings
  const custom = settings.choice === 'custom'
  const customFactors = settings.customFactors ?? presetFactors(settings.size)
  const factors = custom ? customFactors : presetFactors(settings.size)
  const size = factors.length
  function updateSettings(change: Partial<Settings>) {
    const next = { ...settings, ...change }
    setSettings(next)
    saveSettings(next)
  }
  const [grid, setGrid] = useState<Grid | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [answers, setAnswers] = useState<string[]>(() => Array(size * size).fill(''))
  const [result, setResult] = useState<ReturnType<typeof scoreAnswers> | null>(null)
  const [history, setHistory] = useState(loadScores)
  const [tracking, setTracking] = useState(() => loadRunStarts(loadScores().scores))
  const runId = useRef<string | null>(null)
  useEffect(() => {
    function syncStorage(event: StorageEvent) {
      if (event.key === null || event.key === 'times-tables.scores' || event.key === RUN_META_KEY || event.key.startsWith(RUN_START_PREFIX)) {
        const latest = loadScores()
        setHistory(latest)
        setTracking(loadRunStarts(latest.scores))
      }
    }
    window.addEventListener('storage', syncStorage)
    return () => window.removeEventListener('storage', syncStorage)
  }, [])
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const startButton = useRef<HTMLButtonElement>(null)
  const finished = useRef(false)
  const running = startedAt !== null
  const filled = answers.filter(Boolean).length
  const ranked = size > 0 ? rankScores(history.scores, mode, factors) : []
  const perfect = ranked.find(score => score.correct === score.total)

  const visibleScores = history.scores.filter(score => (scoreMode === 'all' || score.mode === scoreMode)
    && (settings.scoreFactors ? factorOption(scoreFactors(score)) === settings.scoreFactors : scoreSize === 'all' || factorOption(scoreFactors(score)) === String(scoreSize)))
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
  const total = size * size
  const placeholders = Array.from({ length: size }, () => null)

  useEffect(() => {
    if (startedAt === null) return
    inputs.current[0]?.focus()
    const interval = window.setInterval(() => setElapsed(performance.now() - startedAt), 50)
    return () => window.clearInterval(interval)
  }, [startedAt])

  function start() {
    if (grid !== null || runId.current !== null || factors.length === 0) return
    runId.current = crypto.randomUUID()
    const latest = loadScores()
    setTracking(latest.warning ? { starts: [], incomplete: true, warning: latest.warning } : recordRunStart({ id: runId.current, mode, factors }, latest.scores))
    finished.current = false
    setGrid(createGrid(mode, Math.random, factors))
    setElapsed(0)
    setStartedAt(performance.now())
  }

  function resetRound() {
    runId.current = null
    setStartedAt(null)
    setElapsed(0)
    setGrid(null)
    setAnswers(Array(size * size).fill(''))
    setResult(null)
  }

  useLayoutEffect(() => {
    if (page === 'practice' && grid === null) startButton.current?.focus()
  }, [grid, page])

  useEffect(() => {
    if (grid !== null || page !== 'practice') return
    function handleStartKey(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Enter' && event.key !== ' ') return
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing || event.defaultPrevented) return
      if (event.target instanceof Element && event.target.closest('button, a[href], input, textarea, select, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role="combobox"], [tabindex]')) return
      const popups = document.querySelectorAll('dialog[open], :popover-open, [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')
      if (Array.from(popups).some(popup => popup.getClientRects().length > 0 && getComputedStyle(popup).visibility !== 'hidden')) return
      event.preventDefault()
      start()
    }
    window.addEventListener('keydown', handleStartKey)
    return () => window.removeEventListener('keydown', handleStartKey)
  }, [grid, mode, factors.join(','), page])

  useEffect(() => {
    if (!running || page !== 'practice') return
    function handleCancelKey(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
      event.preventDefault()
      resetRound()
    }
    window.addEventListener('keydown', handleCancelKey)
    return () => window.removeEventListener('keydown', handleCancelKey)
  }, [running, size, page])

  function finish() {
    if (!running || !grid || filled === 0 || finished.current) return
    finished.current = true
    const elapsedMs = performance.now() - startedAt
    const completed = scoreAnswers(grid, answers)
    const score: Score = {
      id: runId.current!, mode, status: completed.status, attempted: completed.attempted,
      size: grid.size, factors: canonicalFactors(grid.rows), correct: completed.correct, total: completed.total,
      elapsedMs, completedAt: new Date().toISOString(),
    }
    const latest = loadScores()
    const persisted = latest.warning ? history.scores : latest.scores
    const scores = [...persisted, ...history.scores.filter(item => !persisted.some(saved => saved.id === item.id)), score]
    setStartedAt(null)
    setElapsed(elapsedMs)
    setResult(completed)
    setHistory({ scores, warning: saveScores(scores) })
  }

  useEffect(() => {
    if (!running || page !== 'practice') return
    function handleFinishKey(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Enter' || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const answerField = inputs.current.some(input => input !== null && input === event.target)
      if (!answerField && event.target instanceof Element && event.target.closest('button, a[href], input, textarea, select, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role="combobox"], [tabindex]')) return
      const popups = document.querySelectorAll('dialog[open], :popover-open, [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')
      if (Array.from(popups).some(popup => popup.getClientRects().length > 0 && getComputedStyle(popup).visibility !== 'hidden')) return
      event.preventDefault()
      finish()
    }
    window.addEventListener('keydown', handleFinishKey)
    return () => window.removeEventListener('keydown', handleFinishKey)
  }, [startedAt, grid, answers, history, mode, size, page])

  function navigate(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const column = index % size
    const target = {
      ' ': Math.min(index + 1, total - 1),
      ArrowRight: column < size - 1 ? index + 1 : index,
      ArrowLeft: column > 0 ? index - 1 : index,
      ArrowDown: index < total - size ? index + size : index,
      ArrowUp: index >= size ? index - size : index,
    }[event.key]
    if (target !== undefined) {
      event.preventDefault()
      inputs.current[target]?.focus()
    }
  }

  return <Theme appearance={appearance} accentColor="yellow" grayColor="slate" radius="medium">
    <div className="small-screen"><h1>Times tables</h1><p>Bring a keyboard and a wider screen.</p><p>This practice grid needs a desktop window at least 1024 pixels wide.</p></div>
    <main className="practice">
      <h1 className="visually-hidden">Times tables</h1>
      <header className="page-header">
          <nav className="page-nav" aria-label="Main">
            <a href="/" aria-current={page === 'practice' ? 'page' : undefined} onClick={event => changePage(event, 'practice')}>Practice</a>
            <a href="/stats" aria-current={page === 'stats' ? 'page' : undefined} onClick={event => changePage(event, 'stats')}>Stats</a>
            <a href="/about" aria-current={page === 'about' ? 'page' : undefined} onClick={event => changePage(event, 'about')}>About</a>
          </nav>
          <IconButton variant="ghost" color="gray" radius="full" onClick={toggleTheme}
            aria-label={`Switch to ${appearance === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${appearance === 'dark' ? 'light' : 'dark'} mode`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {appearance === 'dark'
                ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>
                : <path d="M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13Z" />}
            </svg>
          </IconButton>
      </header>
      <div className="practice-page" hidden={page !== 'practice'}>
      <section className="toolbar" aria-label="Round controls">
        <SegmentedControl.Root aria-label="Table order" value={mode} onValueChange={value => updateSettings({ mode: value as Mode })} disabled={grid !== null}>
          <SegmentedControl.Item value="ordered">Ordered</SegmentedControl.Item>
          <SegmentedControl.Item value="shuffled">Shuffled</SegmentedControl.Item>
        </SegmentedControl.Root>
        <GridSizePicker value={settings.size} disabled={grid !== null} custom={custom} factors={customFactors} onChange={nextSize => {
          updateSettings({ size: nextSize, choice: 'preset' })
          setAnswers(Array(nextSize * nextSize).fill(''))
        }} onCustomChange={nextFactors => {
          updateSettings({ choice: 'custom', customFactors: nextFactors })
          setAnswers(Array(nextFactors.length ** 2).fill(''))
        }} />
        <div className="stats"><span>{filled} / {total} filled</span><span role="timer" aria-label="Elapsed time">{formatTime(elapsed)}</span></div>
        {running && <Button variant="soft" color="gray" onClick={resetRound}>Cancel</Button>}
        {result && <Button onClick={resetRound}>New round</Button>}
      </section>
      {settings.warning && <p className="storage-warning" role="alert">{settings.warning}</p>}
      {size === 0 && <p role="alert">Select at least one factor.</p>}
      {history.warning && <p className="storage-warning" role="alert">{history.warning}</p>}
      {tracking.warning && !history.warning && <p className="storage-warning" role="alert">{tracking.warning}</p>}
      {result && <section className="result-summary" aria-label="Round result" aria-live="polite">
        <h2>{result.status === 'partial' ? 'Partial result' : 'Round complete'}</h2>
        {result.status === 'partial' && <span>{result.attempted} / {result.total} attempted</span>}
        <span>{result.correct} / {result.attempted} correct</span><span>{Number(result.accuracy.toFixed(1))}% accuracy</span>
      </section>}
      <div className="grid-stage" data-dense={size > 12} style={{ '--grid-tracks': Math.max(size, 1) + 1 } as React.CSSProperties}>
      <table className="answer-grid" aria-label="Multiplication grid">
        <thead><tr><th scope="col" aria-label="Multiply">×</th>{(grid?.columns ?? placeholders).map((column, index) => <th scope="col" key={index}>{column ?? '·'}</th>)}</tr></thead>
        <tbody>{(grid?.rows ?? placeholders).map((row, rowIndex) => <tr key={rowIndex}>
          <th scope="row">{row ?? '·'}</th>
          {(grid?.columns ?? placeholders).map((column, columnIndex) => {
            const index = rowIndex * size + columnIndex
            const match = result?.matches[index]
            const feedbackId = `answer-feedback-${index}`
            return <td key={columnIndex} data-result={match === true ? 'correct' : match === false ? 'incorrect' : undefined}><input
              ref={element => { inputs.current[index] = element }}
              aria-label={row && column ? `${row} × ${column}` : `Row ${rowIndex + 1}, column ${columnIndex + 1}`}
              aria-describedby={typeof match === 'boolean' ? feedbackId : undefined}
              type="text" inputMode="numeric" autoComplete="off" disabled={grid === null} readOnly={result !== null} maxLength={3}
              value={answers[index]} onFocus={event => event.currentTarget.select()}
              onChange={event => {
                const value = event.currentTarget.value
                if (running && /^\d{0,3}$/.test(value)) setAnswers(current => current.map((answer, cell) => cell === index ? value : answer))
              }}
              onKeyDown={event => navigate(event, index)}
            />
              {match === true && <span id={feedbackId} className="visually-hidden">Correct.</span>}
              {match === false && <span id={feedbackId} className="answer-correction"><span className="visually-hidden">Incorrect. </span>{size > 12 ? <span className="visually-hidden">Correct: </span> : 'Correct: '}{grid?.products[index]}</span>}
            </td>
          })}
        </tr>)}</tbody>
      </table>
      {grid === null && <div className="start-overlay">
        <Button ref={startButton} className="start-button" size="4" onClick={start} disabled={size === 0} aria-describedby="start-hint">Start</Button>
        <p id="start-hint">Enter or Space to start</p>
      </div>}
      </div>
      <div className="grid-footer">
        <p>{running ? 'Enter finish · Space / Tab next · Esc cancel · Shift + Tab back · Arrow keys move · Click to edit' : null}</p>
        {!result && <Button disabled={!running || filled === 0} onClick={finish} aria-keyshortcuts="Enter">{filled > 0 && filled < total ? 'Finish early' : 'Finish'}</Button>}
      </div>

      </div>
      {page === 'stats' && <div className="stats-page">
      {history.warning && <p className="storage-warning" role="alert">{history.warning}</p>}
        <div className="toolbar" role="group" aria-label="Score filters">
          <label className="grid-size">Score order <select value={scoreMode} onChange={event => updateSettings({ scoreMode: event.currentTarget.value as Settings['scoreMode'] })}>
            <option value="all">All orders</option><option value="ordered">Ordered</option><option value="shuffled">Shuffled</option>
          </select></label>
          <label className="grid-size">Score size <select value={settings.scoreFactors ?? scoreSize} onChange={event => updateSettings({ scoreSize: 'all', scoreFactors: event.currentTarget.value === 'all' ? undefined : event.currentTarget.value })}>
            <option value="all">All sizes</option>
            <FactorSetOptions sets={[...history.scores.map(scoreFactors), ...tracking.starts.map(run => run.factors), factors, customFactors]} />
          </select></label>
        </div>
      <StatsSummary scores={history.scores} tracking={tracking} mode={scoreMode} selection={settings.scoreFactors ?? String(scoreSize)} unavailable={Boolean(history.warning)} />
      <Suspense fallback={<p role="status">Loading stats…</p>}><ProgressChart scores={history.scores} initialSelection={{ mode, size: size || 12, factors: size ? factors : presetFactors(12) }} /></Suspense>
      <section className="scores" aria-labelledby="scores-heading">
        <div className="score-heading"><h2 id="scores-heading">Score history</h2><div><span>{mode === 'ordered' ? 'Ordered' : 'Shuffled'} · {size > 0 ? settingLabel(factors) : 'None'} — </span><span>{perfect ? `Fastest perfect: ${formatTime(perfect.elapsedMs)}` : 'No perfect round yet'}</span></div></div>
        {visibleScores.length === 0 ? <p>{history.scores.length > 0 ? 'No rounds match these filters.' : 'No rounds yet.'}</p> : <table className="score-table" aria-label="Score history">
          <thead><tr><th>Date</th><th>Status</th><th>Order</th><th>Factors</th><th>Attempted</th><th>Correct</th><th>Accuracy</th><th>Time</th></tr></thead>
          <tbody>{visibleScores.map(score => <tr key={score.id} data-status={score.status} data-perfect={score.status === 'complete' && score.correct === score.total}><td><AttemptTime completedAt={score.completedAt} /></td><td>{score.status === 'partial' ? 'Partial' : 'Complete'}</td><td>{score.mode === 'ordered' ? 'Ordered' : 'Shuffled'}</td><td>{settingLabel(scoreFactors(score))}</td><td>{score.attempted} / {score.total}</td><td>{score.correct} / {score.attempted}</td><td>{Number((score.correct / score.attempted * 100).toFixed(1))}%</td><td>{formatTime(score.elapsedMs)}</td></tr>)}</tbody>
        </table>}
      </section>
      </div>}
      {page === 'about' && <section className="about-page" aria-labelledby="about-heading">
        <h2 id="about-heading">About</h2>
        <p><a href="https://github.com/will-lynas/times-tables">GitHub</a></p>
        <p>Styling inspired by <a href="https://monkeytype.com/">Monkeytype</a>.</p>
      </section>}
    </main>
  </Theme>
}
