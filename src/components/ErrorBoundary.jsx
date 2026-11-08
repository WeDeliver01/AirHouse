import { Component } from 'react'
import { captureError } from '../lib/monitoring'

/**
 * Catches render errors so a single broken component shows a recoverable
 * message instead of a blank page, and reports them.
 *
 * Without this, an exception during render unmounts the whole tree and the
 * user sees nothing at all -- the hardest kind of fault to diagnose from a
 * support ticket.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    captureError(error, { componentStack: info?.componentStack })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900">Something went wrong</h1>
          <p className="text-gray-500 mt-2">
            The problem has been reported. Reloading usually clears it; if it keeps
            happening, contact support and mention what you were doing.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-white"
          >
            Reload the page
          </button>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
