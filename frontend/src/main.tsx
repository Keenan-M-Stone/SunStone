import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@stardust/ui/style.css'
import App from './AppEntry'
import { ErrorBoundary } from './ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
