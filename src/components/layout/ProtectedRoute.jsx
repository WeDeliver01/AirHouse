import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { PageLoader } from '../ui/LoadingSpinner'
import { hasVerifiedFactor, mfaRequiredForAdmins } from '../../lib/mfa'
import MfaRequired from '../MfaRequired'

/**
 * Route guard.
 *
 * Beyond role checks, a privileged route additionally requires a second
 * factor to be enrolled (AH-024). The check runs here rather than only at
 * sign-in so that an account promoted to admin after signing in is also
 * caught.
 *
 * This is a usability gate, not the security boundary: the database refuses
 * privileged operations on its own regardless of what the UI allows.
 */
const ProtectedRoute = ({ children, allowedRoles = [], requireSuperAdmin = false }) => {
  const { isAuthenticated, profile, loading, initialized, isDemoMode, isSuperAdmin } = useAuth()
  const location = useLocation()

  const privileged = requireSuperAdmin || allowedRoles.includes('admin')

  const [mfaState, setMfaState] = useState({ checked: !privileged, enrolled: true })

  useEffect(() => {
    let cancelled = false

    if (!privileged || isDemoMode || !isAuthenticated) {
      setMfaState({ checked: true, enrolled: true })
      return undefined
    }

    const checkEnrolment = async () => {
      try {
        const [required, enrolled] = await Promise.all([
          mfaRequiredForAdmins(),
          hasVerifiedFactor(),
        ])
        if (!cancelled) {
          setMfaState({ checked: true, enrolled: !required || enrolled })
        }
      } catch {
        // Do not lock an operator out because the check itself failed.
        if (!cancelled) setMfaState({ checked: true, enrolled: true })
      }
    }

    checkEnrolment()

    return () => {
      cancelled = true
    }
  }, [privileged, isDemoMode, isAuthenticated])

  if (!initialized || loading) {
    return <PageLoader />
  }

  if (isDemoMode && profile) {
    if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
      return <Navigate to={getRoleRedirect(profile.role)} replace />
    }
    return children
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return <Navigate to={getRoleRedirect(profile?.role)} replace />
  }

  if (allowedRoles.length > 0 && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to={getRoleRedirect(profile.role)} replace />
  }

  if (privileged && !mfaState.checked) {
    return <PageLoader />
  }

  if (privileged && !mfaState.enrolled) {
    return <MfaRequired />
  }

  return children
}

const getRoleRedirect = (role) => {
  const redirects = {
    creator: '/creator',
    developer: '/developer',
    admin: '/admin',
  }
  return redirects[role] || '/'
}

export default ProtectedRoute
