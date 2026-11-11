import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../lib/utils'
import { isStrongPassword } from '../../lib/passwordPolicy'
import { supabase } from '../../lib/supabase'
import { COMPANY } from '../../data/companyInfo'
import { stashPendingTermsAcceptance } from '../../components/PendingTermsAcceptanceFlush'

const Register = () => {
  const [searchParams] = useSearchParams()
  const requestedRole = searchParams.get('role') || ''
  // Public self-registration only offers the developer/host role for now.
  const initialRole = requestedRole === 'developer' ? requestedRole : ''

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: initialRole,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [step, setStep] = useState(initialRole ? 2 : 1)
  const [registrationComplete, setRegistrationComplete] = useState(false)

  const { signUp, isAuthenticated, profile, isDemoMode } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated && profile) {
      const dashboards = { admin: '/admin', developer: '/developer', creator: '/creator' }
      navigate(dashboards[profile.role] || '/creator', { replace: true })
    }
  }, [isAuthenticated, profile, navigate])

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }))
  }

  const selectRole = (role) => {
    updateField('role', role)
    setStep(2)
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.fullName.trim()) newErrors.fullName = 'Name is required'
    else if (formData.fullName.trim().length < 2) newErrors.fullName = 'Name must be at least 2 characters'
    if (!formData.email) newErrors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Please enter a valid email'
    if (!formData.password) newErrors.password = 'Password is required'
    else if (formData.password.length < 12) newErrors.password = 'Password must be at least 12 characters'
    else if (!isStrongPassword(formData.password)) {
      newErrors.password = 'Password must include uppercase, lowercase, number, and special character'
    }
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match'
    if (!formData.role) newErrors.role = 'Please select a role'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setErrors({})
    try {
      const result = await signUp({
        email: formData.email,
        password: formData.password,
        fullName: formData.fullName,
        role: formData.role,
      })
      // Audit-trail row: who accepted which policy versions, when and from where.
      // Two-step strategy:
      //   1. If a session already exists (no email-confirmation flow), insert immediately.
      //   2. Otherwise, stash the intent and let PendingTermsAcceptanceFlush
      //      write the row after the user signs in (RLS requires auth.uid()).
      if (!isDemoMode) {
        const roleAgreementKey = formData.role === 'creator'
          ? 'creatorAgreement' : formData.role === 'developer'
          ? 'developerAgreement' : 'terms'
        const acceptancePayload = {
          role: formData.role,
          terms_version: COMPANY.lastUpdated.terms,
          privacy_version: COMPANY.lastUpdated.privacy,
          role_agreement_key: roleAgreementKey,
          role_agreement_version: COMPANY.lastUpdated[roleAgreementKey],
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        }
        const sessionUserId = result?.session?.user?.id
        if (sessionUserId) {
          try {
            await supabase.from('terms_acceptances').insert({ user_id: sessionUserId, ...acceptancePayload })
          } catch (auditErr) {
            console.warn('Could not persist terms acceptance:', auditErr?.message || auditErr)
            stashPendingTermsAcceptance(acceptancePayload)
          }
        } else {
          stashPendingTermsAcceptance(acceptancePayload)
        }
      }
      if (isDemoMode) navigate('/login')
      else if (!result?.session) setRegistrationComplete(true)
    } catch (error) {
      console.error('Registration error:', error)
    } finally {
      setLoading(false)
    }
  }

  const inputBase = (hasError) =>
    cn(
      'w-full h-11 px-3 bg-surface-container-lowest border rounded font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 transition-shadow',
      hasError ? 'border-error focus:border-error focus:ring-error' : 'border-outline-variant focus:border-primary focus:ring-primary'
    )

  if (registrationComplete) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-[440px] bg-surface-container-lowest border border-outline-variant rounded-xl p-8 text-center ambient-shadow">
          <div className="w-16 h-16 bg-secondary-container rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-on-secondary-container text-[32px]">mark_email_read</span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface mb-2">Check your email</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-6">
            We've sent a verification link to <strong>{formData.email}</strong>. Click the link to activate your account.
          </p>
          <div className="space-y-3">
            <Link
              to="/login"
              className="block w-full h-11 leading-[44px] text-center bg-secondary-container text-on-secondary-container font-label-lg text-label-lg rounded hover:bg-secondary-fixed transition-colors"
            >
              Go to Login
            </Link>
            <p className="font-label-md text-label-md text-on-surface-variant">
              Didn't receive the email? Check your spam folder or{' '}
              <button
                onClick={() => setRegistrationComplete(false)}
                className="text-primary hover:underline"
              >
                try again
              </button>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/auth-bg.png')" }}
    >
      <div className="absolute inset-0 bg-surface/55" aria-hidden="true" />
      <div className="relative w-full max-w-[560px]">
        <div className="text-center mb-8">
          <h1 className="font-headline-md text-headline-md text-on-surface">Create your account</h1>
          <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
            {step === 1 ? 'Choose how you want to use the platform' : 'Fill in your details to get started'}
          </p>
        </div>

        {isDemoMode && (
          <div className="mb-6 p-4 bg-primary-fixed border border-primary-fixed-dim rounded-lg">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary text-[20px]">info</span>
              <div>
                <p className="font-label-lg text-label-lg text-on-primary-fixed-variant">Demo Mode Active</p>
                <p className="text-body-sm text-body-sm text-on-primary-fixed-variant/80 mt-1">
                  Registration will simulate account creation. No email will be sent.
                </p>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid max-w-md mx-auto gap-4">
            {[
              { role: 'developer', icon: 'home_work', title: 'Host or Property Owner', desc: 'List getaway stays, apartments, homes, or developments and generate real leads', perks: ['Get a shareable link for every listing','Promote listings on social media or with a campaign','Track leads & ROI'] },
            ].map((opt) => (
              <button
                key={opt.role}
                onClick={() => selectRole(opt.role)}
                className="p-6 rounded-xl border border-outline-variant bg-surface-container-lowest text-left ambient-shadow hover:border-primary transition-colors"
              >
                <div className="w-12 h-12 bg-primary-fixed rounded-lg flex items-center justify-center text-primary mb-4">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>{opt.icon}</span>
                </div>
                <h3 className="font-headline-md text-headline-md text-on-surface mb-2">{opt.title}</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">{opt.desc}</p>
                <ul className="space-y-2">
                  {opt.perks.map(p => (
                    <li key={p} className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface">
                      <span className="material-symbols-outlined text-secondary text-[18px]">check_circle</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 sm:p-8 ambient-shadow">
            {/* Role indicator */}
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-outline-variant">
              <div className="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[20px]">
                  {formData.role === 'developer' ? 'domain' : 'video_camera_front'}
                </span>
              </div>
              <div>
                <p className="font-label-lg text-label-lg text-on-surface capitalize">
                  {formData.role} Account
                </p>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="font-label-md text-label-md text-primary hover:underline"
                >
                  Change role
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="fullName" className="font-label-md text-label-md text-on-surface">Full Name</label>
                <input
                  id="fullName"
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => updateField('fullName', e.target.value)}
                  placeholder={formData.role === 'developer' ? 'Company Name' : 'Your Name'}
                  autoComplete="name"
                  className={inputBase(!!errors.fullName)}
                />
                {errors.fullName && <p className="font-label-md text-label-md text-error mt-1">{errors.fullName}</p>}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="email" className="font-label-md text-label-md text-on-surface">Email Address</label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className={inputBase(!!errors.email)}
                />
                {errors.email && <p className="font-label-md text-label-md text-error mt-1">{errors.email}</p>}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="password" className="font-label-md text-label-md text-on-surface">Password</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => updateField('password', e.target.value)}
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
                  {errors.password || 'Min 12 chars with uppercase, lowercase, number & symbol.'}
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="confirmPassword" className="font-label-md text-label-md text-on-surface">Confirm Password</label>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => updateField('confirmPassword', e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={inputBase(!!errors.confirmPassword)}
                />
                {errors.confirmPassword && <p className="font-label-md text-label-md text-error mt-1">{errors.confirmPassword}</p>}
              </div>

              <p className="font-label-md text-label-md text-on-surface-variant">
                By creating an account, you agree to our{' '}
                <Link to="/legal/terms" target="_blank" className="text-primary hover:underline">Terms of Service</Link>,{' '}
                <Link to="/legal/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</Link>
                {formData.role === 'creator' && (
                  <>{' '}and the{' '}
                    <Link to="/legal/creator-agreement" target="_blank" className="text-primary hover:underline">Creator Agreement</Link></>
                )}
                {formData.role === 'developer' && (
                  <>{' '}and the{' '}
                    <Link to="/legal/developer-agreement" target="_blank" className="text-primary hover:underline">Developer Agreement</Link></>
                )}
                . Effective {COMPANY.lastUpdated.terms}.
              </p>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-secondary-container text-on-secondary-container font-label-lg text-label-lg rounded hover:bg-secondary-fixed disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    Creating account…
                  </>
                ) : 'Create Account'}
              </button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-outline-variant" />
              </div>
              <div className="relative flex justify-center text-body-sm">
                <span className="px-2 bg-surface-container-lowest text-on-surface-variant">
                  Already have an account?
                </span>
              </div>
            </div>

            <Link
              to="/login"
              className="block w-full h-11 leading-[44px] text-center border border-outline text-on-surface font-label-lg text-label-lg rounded hover:bg-surface-container-low transition-colors"
            >
              Sign In
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default Register
