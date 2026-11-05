import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { PageLoader } from '../ui/LoadingSpinner'

const ProtectedRoute = ({ children, allowedRoles = [], requireSuperAdmin = false }) => {
  const { isAuthenticated, profile, loading, initialized, isDemoMode, isSuperAdmin } = useAuth()
  const location = useLocation()

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
