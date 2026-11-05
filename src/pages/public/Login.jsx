import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  const { signIn, isAuthenticated, profile, isDemoMode } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (isAuthenticated && profile) {
      const redirectPath = getRedirectPath(profile.role, location.state?.from?.pathname)
      navigate(redirectPath, { replace: true })
    }
  }, [isAuthenticated, profile, navigate, location])

  const getRedirectPath = (role, intendedPath) => {
    if (intendedPath) {
      if (intendedPath.startsWith('/admin') && role === 'admin') return intendedPath
      if (intendedPath.startsWith('/developer') && role === 'developer') return intendedPath
      if (intendedPath.startsWith('/creator') && role === 'creator') return intendedPath
    }
    const dashboards = { admin: '/admin', developer: '/developer', creator: '/creator' }
    return dashboards[role] || '/'
  }

  const validate = () => {
    const newErrors = {}
    if (!email) newErrors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = 'Please enter a valid email'
    if (!password) newErrors.password = 'Password is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setErrors({})
    try {
      await signIn({ email, password })
    } catch (error) {
      console.error('Login error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-[440px]">
        <div className="text-center mb-8">
          <h1 className="font-headline-md text-headline-md text-on-surface">Welcome back</h1>
          <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
            Sign in to your account to continue
          </p>
        </div>

        {isDemoMode && (
          <div className="mb-6 p-4 bg-primary-fixed border border-primary-fixed-dim rounded-lg">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary text-[20px]">info</span>
              <div className="flex-1">
                <p className="font-label-lg text-label-lg text-on-primary-fixed-variant">Demo Mode Active</p>
                <p className="text-body-sm text-body-sm text-on-primary-fixed-variant/80 mt-1">
                  Supabase not configured. Use any email to test different roles:
                </p>
                <ul className="text-body-sm text-body-sm text-on-primary-fixed-variant/80 mt-1 space-y-1">
                  <li>• <strong>admin@…</strong> → Admin Dashboard</li>
                  <li>• <strong>developer@…</strong> → Developer Dashboard</li>
                  <li>• <strong>Any other email</strong> → Creator Dashboard</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 sm:p-8 ambient-shadow">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Email */}
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="font-label-md text-label-md text-on-surface">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className={`w-full h-11 px-3 bg-surface-container-lowest border rounded font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 transition-shadow ${
                  errors.email ? 'border-error focus:border-error focus:ring-error' : 'border-outline-variant focus:border-primary focus:ring-primary'
                }`}
              />
              {errors.email && (
                <p className="font-label-md text-label-md text-error mt-1">{errors.email}</p>
              )}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1">
              <label htmlFor="password" className="font-label-md text-label-md text-on-surface">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`w-full h-11 px-3 pr-10 bg-surface-container-lowest border rounded font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 transition-shadow ${
                    errors.password ? 'border-error focus:border-error focus:ring-error' : 'border-outline-variant focus:border-primary focus:ring-primary'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              {errors.password && (
                <p className="font-label-md text-label-md text-error mt-1">{errors.password}</p>
              )}
            </div>

            <div className="flex justify-end">
              <Link to="/forgot-password" className="font-label-md text-label-md text-primary hover:underline">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-secondary-container text-on-secondary-container font-label-lg text-label-lg rounded hover:bg-secondary-fixed disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                  Signing in…
                </>
              ) : 'Sign In'}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-outline-variant" />
            </div>
            <div className="relative flex justify-center text-body-sm">
              <span className="px-2 bg-surface-container-lowest text-on-surface-variant">
                New to AirHouse?
              </span>
            </div>
          </div>

          <Link
            to="/register"
            className="block w-full h-11 leading-[44px] text-center border border-outline text-on-surface font-label-lg text-label-lg rounded hover:bg-surface-container-low transition-colors"
          >
            Create an Account
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Login
