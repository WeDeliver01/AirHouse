import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../lib/utils'
import Avatar from '../ui/Avatar'
import { useState, useRef, useEffect } from 'react'
import { getDashboardPath as resolveDashboardPath } from '../../lib/navItems'

const Navbar = () => {
  const { user, profile, signOut, isAuthenticated, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const getDashboardPath = () => {
    const resolved = resolveDashboardPath(profile?.role, location.pathname)
    return resolved === '/' ? '/creator' : resolved
  }

  const navLinkClass = (path) => cn(
    'font-label-lg text-label-lg transition-colors px-3 py-1.5 rounded-full',
    location.pathname === path
      ? 'bg-primary-container text-on-primary-container'
      : 'text-on-surface-variant hover:text-on-surface'
  )

  return (
    <header className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b border-outline-variant">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand + nav */}
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2">
              <img src="/logo.png" alt="AirHouse" className="w-9 h-9 object-contain" />
              <span className="text-xl font-bold tracking-tight text-primary">
                AirHouse
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-6">
              <Link to="/" className={navLinkClass('/')}>Home</Link>
              <Link to="/properties" className={navLinkClass('/properties')}>Properties</Link>
              {isSuperAdmin && (
                <>
                  <Link to="/marketplace" className={navLinkClass('/marketplace')}>Marketplace</Link>
                  <Link to="/campaigns" className={navLinkClass('/campaigns')}>Campaigns</Link>
                </>
              )}
            </nav>
          </div>

          {/* Right cluster */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link
                  to={getDashboardPath()}
                  className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-lg text-label-lg hover:opacity-90 transition-colors"
                >
                  Dashboard
                </Link>

                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 p-1 pr-2 rounded-full hover:bg-surface-container-low transition-colors border border-outline-variant"
                  >
                    <Avatar
                      src={profile?.avatar_url}
                      name={profile?.full_name || 'User'}
                      size="sm"
                    />
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px]">expand_more</span>
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-surface-container-lowest border border-outline-variant rounded-xl ambient-shadow py-2 animate-fade-in">
                      <div className="px-4 py-3 border-b border-outline-variant">
                        <div className="flex items-center gap-3">
                          <Avatar
                            src={profile?.avatar_url}
                            name={profile?.full_name || 'User'}
                            size="default"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-label-lg text-label-lg text-on-surface truncate">
                              {profile?.full_name || 'User'}
                            </p>
                            <p className="text-label-md text-label-md text-on-surface-variant truncate">
                              {user?.email || profile?.email}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="py-1">
                        <Link
                          to={getDashboardPath()}
                          className="flex items-center gap-3 px-4 py-2 text-body-sm text-on-surface hover:bg-surface-container-low transition-colors"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <span className="material-symbols-outlined text-[18px] text-on-surface-variant">dashboard</span>
                          Go to Dashboard
                        </Link>
                        <Link
                          to={`${getDashboardPath()}/profile`}
                          className="flex items-center gap-3 px-4 py-2 text-body-sm text-on-surface hover:bg-surface-container-low transition-colors"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <span className="material-symbols-outlined text-[18px] text-on-surface-variant">person</span>
                          Edit Profile
                        </Link>
                      </div>
                      <div className="border-t border-outline-variant pt-1">
                        <button
                          onClick={handleSignOut}
                          className="flex items-center gap-3 w-full px-4 py-2 text-body-sm text-error hover:bg-error-container/40 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">logout</span>
                          Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface px-3 py-2 transition-colors"
                >
                  Log In
                </button>
                <button
                  onClick={() => navigate('/register')}
                  className="bg-secondary text-on-secondary font-label-lg text-label-lg px-4 py-2 rounded-lg hover:opacity-90 transition-colors"
                >
                  Get Started
                </button>
              </>
            )}
          </div>

          {/* Mobile button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-surface-container-low transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            <span className="material-symbols-outlined text-on-surface text-[24px]">
              {mobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-outline-variant animate-fade-in">
            {isAuthenticated && (
              <div className="px-3 py-3 mb-2 bg-surface-container-low rounded-lg">
                <div className="flex items-center gap-3">
                  <Avatar
                    src={profile?.avatar_url}
                    name={profile?.full_name || 'User'}
                    size="default"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-label-lg text-label-lg text-on-surface truncate">
                      {profile?.full_name || 'User'}
                    </p>
                    <p className="text-label-md text-label-md text-on-surface-variant capitalize truncate">
                      {profile?.role || 'User'}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <Link
                to="/"
                className={cn('py-2.5 hover:bg-surface-container-low', navLinkClass('/'))}
                onClick={() => setMobileMenuOpen(false)}
              >
                Home
              </Link>
              <Link
                to="/properties"
                className={cn('py-2.5 hover:bg-surface-container-low', navLinkClass('/properties'))}
                onClick={() => setMobileMenuOpen(false)}
              >
                Properties
              </Link>
              {isSuperAdmin && (
                <>
                  <Link
                    to="/marketplace"
                    className="px-3 py-2.5 text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors font-label-lg text-label-lg"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Marketplace
                  </Link>
                  <Link
                    to="/campaigns"
                    className="px-3 py-2.5 text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors font-label-lg text-label-lg"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Campaigns
                  </Link>
                </>
              )}

              {isAuthenticated ? (
                <>
                  <Link
                    to={getDashboardPath()}
                    className="px-3 py-2.5 text-on-surface hover:bg-surface-container-low rounded-lg transition-colors font-label-lg text-label-lg"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <Link
                    to={`${getDashboardPath()}/profile`}
                    className="px-3 py-2.5 text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors font-label-lg text-label-lg"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Edit Profile
                  </Link>
                  <button
                    onClick={() => {
                      handleSignOut()
                      setMobileMenuOpen(false)
                    }}
                    className="px-3 py-2.5 text-left text-error hover:bg-error-container/40 rounded-lg transition-colors font-label-lg text-label-lg"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="px-3 py-2.5 text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors font-label-lg text-label-lg"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Log In
                  </Link>
                  <Link
                    to="/register"
                    className="px-3 py-2.5 bg-secondary text-on-secondary rounded-lg text-center font-label-lg text-label-lg"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}

export default Navbar
