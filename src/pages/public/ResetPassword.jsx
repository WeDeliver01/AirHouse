import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'

const ResetPassword = () => {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errors, setErrors] = useState({})
  const [sessionError, setSessionError] = useState(false)

  const { updatePassword, isDemoMode } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const checkSession = async () => {
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (accessToken && refreshToken) {
        try {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (error) throw error
        } catch (error) {
          console.error('Session error:', error)
          setSessionError(true)
        }
      }
    }
    if (!isDemoMode) checkSession()
  }, [isDemoMode])

  const validate = () => {
    const newErrors = {}
    if (!password) newErrors.password = 'Password is required'
    else if (password.length < 8) newErrors.password = 'Password must be at least 8 characters'
    else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) newErrors.password = 'Password must include uppercase, lowercase, and number'
    if (password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      await updatePassword(password)
      setSuccess(true)
    } catch (error) {
      console.error('Password reset error:', error)
    } finally {
      setLoading(false)
    }
  }

  const inputBase = (hasError) =>
    cn(
      'w-full h-11 px-3 bg-surface-container-lowest border rounded font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 transition-shadow',
      hasError ? 'border-error focus:border-error focus:ring-error' : 'border-outline-variant focus:border-primary focus:ring-primary'
    )

  if (sessionError) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-[440px] bg-surface-container-lowest border border-outline-variant rounded-xl p-8 text-center ambient-shadow">
          <div className="w-16 h-16 bg-error-container rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-on-error-container text-[32px]">link_off</span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface mb-2">Link Expired</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-6">
            This password reset link has expired or is invalid. Please request a new one.
          </p>
          <button
            onClick={() => navigate('/forgot-password')}
            className="block w-full h-11 leading-[44px] text-center bg-secondary-container text-on-secondary-container font-label-lg text-label-lg rounded hover:bg-secondary-fixed transition-colors"
          >
            Request New Link
          </button>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-[440px] bg-surface-container-lowest border border-outline-variant rounded-xl p-8 text-center ambient-shadow">
          <div className="w-16 h-16 bg-secondary-container rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-on-secondary-container text-[32px]">check_circle</span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface mb-2">Password Updated</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-6">
            Your password has been reset successfully. You can now sign in with your new password.
          </p>
          <Link
            to="/login"
            className="block w-full h-11 leading-[44px] text-center bg-secondary-container text-on-secondary-container font-label-lg text-label-lg rounded hover:bg-secondary-fixed transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-[440px]">
        <div className="text-center mb-8">
          <h1 className="font-headline-md text-headline-md text-on-surface">Set new password</h1>
          <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
            Enter your new password below
          </p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 sm:p-8 ambient-shadow">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="password" className="font-label-md text-label-md text-on-surface">New Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (errors.password) setErrors({ ...errors, password: null })
                  }}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={cn(inputBase(!!errors.password), 'pr-10')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
                  tabIndex={-1}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              <p className={cn('font-label-md text-label-md mt-1', errors.password ? 'text-error' : 'text-on-surface-variant')}>
                {errors.password || 'Min 8 characters with uppercase, lowercase & number'}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="confirmPassword" className="font-label-md text-label-md text-on-surface">Confirm New Password</label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: null })
                }}
                placeholder="••••••••"
                autoComplete="new-password"
                className={inputBase(!!errors.confirmPassword)}
              />
              {errors.confirmPassword && <p className="font-label-md text-label-md text-error mt-1">{errors.confirmPassword}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-secondary-container text-on-secondary-container font-label-lg text-label-lg rounded hover:bg-secondary-fixed disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                  Updating…
                </>
              ) : 'Reset Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default ResetPassword
