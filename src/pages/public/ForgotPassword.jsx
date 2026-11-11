import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const ForgotPassword = () => {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const { resetPassword, isDemoMode } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email) return setError('Email is required')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Please enter a valid email')
    setLoading(true)
    try {
      await resetPassword(email)
      setSent(true)
    } catch {
      setError('Failed to send reset email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-[440px] bg-surface-container-lowest border border-outline-variant rounded-xl p-8 text-center ambient-shadow">
          <div className="w-16 h-16 bg-secondary-container rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-on-secondary-container text-[32px]">check_circle</span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface mb-2">Check your email</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-6">
            {isDemoMode
              ? 'Demo mode: No email sent, but the flow is simulated.'
              : `We've sent password reset instructions to ${email}`}
          </p>
          <Link
            to="/login"
            className="block w-full h-11 leading-[44px] text-center bg-secondary text-on-secondary font-label-lg text-label-lg rounded hover:opacity-90 transition-colors"
          >
            Back to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-[440px]">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 font-label-md text-label-md text-on-surface-variant hover:text-on-surface mb-6 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back to login
        </Link>

        <div className="text-center mb-8">
          <h1 className="font-headline-md text-headline-md text-on-surface">Reset your password</h1>
          <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
            Enter your email and we'll send you instructions to reset your password
          </p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 sm:p-8 ambient-shadow">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="font-label-md text-label-md text-on-surface">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                placeholder="you@example.com"
                autoComplete="email"
                className={`w-full h-11 px-3 bg-surface-container-lowest border rounded font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 transition-shadow ${
                  error ? 'border-error focus:border-error focus:ring-error' : 'border-outline-variant focus:border-primary focus:ring-primary'
                }`}
              />
              {error && <p className="font-label-md text-label-md text-error mt-1">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-secondary text-on-secondary font-label-lg text-label-lg rounded hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                  Sending…
                </>
              ) : 'Send Reset Link'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword
