import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Card, Button } from '../../components/ui'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

/**
 * Auth Callback Page
 * Handles email verification and OAuth callbacks
 */
const AuthCallback = () => {
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Supabase automatically handles the token exchange when detectSessionInUrl is true
        // We just need to check if there's a session
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) throw error

        if (session) {
          setStatus('success')
          setMessage('Your email has been verified successfully!')
          
          // Get user role to redirect to correct dashboard
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single()

          const redirectPath = {
            admin: '/admin',
            developer: '/developer',
            creator: '/creator',
          }[profile?.role] || '/creator'

          // Redirect after showing success message
          setTimeout(() => navigate(redirectPath, { replace: true }), 1500)
        } else {
          // No session - might be an error or expired link
          setStatus('error')
          setMessage('Invalid or expired verification link. Please try logging in.')
        }
      } catch (error) {
        console.error('Auth callback error:', error)
        setStatus('error')
        setMessage(error.message || 'Something went wrong during verification')
      }
    }

    handleCallback()
  }, [navigate])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4">
      <Card className="w-full max-w-md text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-text-primary mb-2">
              Verifying your account...
            </h2>
            <p className="text-text-secondary">
              Please wait a moment
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-success-soft rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-success" />
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-2">
              Email Verified!
            </h2>
            <p className="text-text-secondary mb-6">
              {message}
            </p>
            <p className="text-sm text-text-secondary">
              Redirecting to your dashboard...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-danger-soft rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-danger" />
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-2">
              Verification Issue
            </h2>
            <p className="text-text-secondary mb-6">
              {message}
            </p>
            <div className="space-y-3">
              <Button 
                variant="primary" 
                className="w-full"
                onClick={() => navigate('/login')}
              >
                Go to Login
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

export default AuthCallback
