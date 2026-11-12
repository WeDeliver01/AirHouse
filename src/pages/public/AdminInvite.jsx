import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { isStrongPassword } from '../../lib/passwordPolicy'
import { supabase } from '../../lib/supabase'
import { Button, Input } from '../../components/ui'
import { Shield, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'

const AdminInvite = () => {
  const { code } = useParams()
  const { isAuthenticated, signUp } = useAuth()
  const [status, setStatus] = useState('validating')
  const [emailRestriction, setEmailRestriction] = useState(null)
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  const validateInvite = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('validate_admin_invite', {
        p_invite_code: code
      })

      if (error) {
        setStatus('invalid')
        return
      }

      if (!data.valid) {
        setStatus(data.reason === 'used' ? 'used' : data.reason === 'expired' ? 'expired' : 'invalid')
        return
      }

      if (data.email_restriction) {
        setEmailRestriction(data.email_restriction)
        setFormData(f => ({ ...f, email: data.email_restriction }))
      }
      setStatus('valid')
    } catch (e) {
      console.error(e)
      setStatus('invalid')
    }
  }, [code])

  useEffect(() => {
    validateInvite()
  }, [validateInvite])

  const validate = () => {
    const errs = {}
    if (!formData.fullName.trim()) errs.fullName = 'Name is required'
    if (!formData.email.trim()) errs.email = 'Email is required'
    if (!formData.password) {
      errs.password = 'Password is required'
    } else if (formData.password.length < 12) {
      errs.password = 'Password must be at least 12 characters'
    } else if (!isStrongPassword(formData.password)) {
      errs.password = 'Must include uppercase, lowercase, number, and special character'
    }
    if (formData.password !== formData.confirmPassword) errs.confirmPassword = 'Passwords do not match'
    if (emailRestriction && formData.email !== emailRestriction) {
      errs.email = 'This invite is restricted to a specific email'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    try {
      const { data: redeemResult, error: redeemError } = await supabase.rpc('redeem_admin_invite', {
        p_invite_code: code,
        p_email: formData.email
      })

      if (redeemError) throw redeemError

      if (!redeemResult.success) {
        toast.error(redeemResult.error)
        setLoading(false)
        return
      }

      await signUp({
        email: formData.email,
        password: formData.password,
        fullName: formData.fullName,
        role: 'admin'
      })

      toast.success('Super admin account created! Check your email to verify.')
      setStatus('success')
    } catch (e) {
      console.error(e)
      toast.error('Failed to create account. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center">
          <Shield className="w-12 h-12 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Already Logged In</h2>
          <p className="text-gray-500 mb-6">You're already signed in. Please log out first to use this invite link.</p>
          <Link to="/admin">
            <Button variant="primary">Go to Dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl border border-gray-100 p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-soft rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Super Admin Invite</h1>
            <p className="text-gray-500 mt-2">AirHouse Platform</p>
          </div>

          {status === 'validating' && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
              <p className="text-gray-500">Validating invite code...</p>
            </div>
          )}

          {status === 'invalid' && (
            <div className="text-center py-8">
              <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Invalid Invite</h2>
              <p className="text-gray-500 mb-6">This invite link is not valid. Please contact an existing super admin for a new invite.</p>
              <Link to="/">
                <Button variant="secondary">Go Home</Button>
              </Link>
            </div>
          )}

          {status === 'used' && (
            <div className="text-center py-8">
              <XCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Invite Already Used</h2>
              <p className="text-gray-500 mb-6">This invite link has already been used. Each invite can only be used once.</p>
              <Link to="/login">
                <Button variant="primary">Go to Login</Button>
              </Link>
            </div>
          )}

          {status === 'expired' && (
            <div className="text-center py-8">
              <XCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Invite Expired</h2>
              <p className="text-gray-500 mb-6">This invite link has expired. Please request a new one from an existing super admin.</p>
              <Link to="/">
                <Button variant="secondary">Go Home</Button>
              </Link>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Account Created</h2>
              <p className="text-gray-500 mb-6">Your super admin account has been created. Please check your email to verify your account, then log in.</p>
              <Link to="/login">
                <Button variant="primary">Go to Login</Button>
              </Link>
            </div>
          )}

          {status === 'valid' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Full Name"
                value={formData.fullName}
                onChange={(e) => setFormData(f => ({ ...f, fullName: e.target.value }))}
                error={errors.fullName}
              />
              <Input
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(f => ({ ...f, email: e.target.value }))}
                error={errors.email}
                disabled={!!emailRestriction}
              />
              <Input
                label="Password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData(f => ({ ...f, password: e.target.value }))}
                error={errors.password}
              />
              <Input
                label="Confirm Password"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData(f => ({ ...f, confirmPassword: e.target.value }))}
                error={errors.confirmPassword}
              />

              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Creating Account...
                  </>
                ) : (
                  'Create Super Admin Account'
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminInvite
