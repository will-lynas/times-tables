import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@radix-ui/themes/styles.css'
import './styles.css'
import App from './App'
import { recoverScores } from './scores'
import { recoverSettings } from './settings'
import { recoverProgressSelection } from './progressSettings'
import { recoverRunStarts } from './statistics'
import { recoverTheme } from './theme'

async function boot() {
  const root = createRoot(document.getElementById('root')!)
  root.render(<p role="status">Recovering saved changes…</p>)
  const warnings = await Promise.all([recoverScores(), recoverSettings(), recoverProgressSelection(), recoverRunStarts(), recoverTheme()])
  root.render(<StrictMode>
    {warnings.some(Boolean) && <p className="storage-warning" role="alert">Some saved changes could not be recovered. Original data and pending changes have been kept.</p>}
    <App />
  </StrictMode>)
}
void boot()
