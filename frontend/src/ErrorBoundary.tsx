import type { ReactNode } from 'react'
import { Component } from 'react'

type ErrorBoundaryState = {
  hasError: boolean
  message?: string
  stack?: string
}

type ErrorBoundaryProps = {
  children: ReactNode
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message, stack: error.stack }
  }

  componentDidCatch(error: Error) {
    console.error('UI crashed:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
          <h2>UI Error</h2>
          <p>{this.state.message ?? 'Unknown error'}</p>
          {this.state.stack && (
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{this.state.stack}</pre>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
