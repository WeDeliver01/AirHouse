import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Avatar from '../ui/Avatar'
import NotificationBell from '../ui/NotificationBell'
import { getDashboardPath } from '../../lib/navItems'

const TopAppBar = ({
  isMobile,
  desktopCollapsed = false,
  onToggleMobile,
  onToggleDesktopCollapse,
}) => {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const role = profile?.role
  const dashboardPath = getDashboardPath(role, location.pathname)

  const handleSignOut = async () => {
    setMenuOpen(false)
    await signOut()
    navigate('/')
  }

  return (
    <header className="h-16 bg-white/80 backdrop-blur-md border-b border-outline-variant px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Left: hamburger + search */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {isMobile ? (
          <button
            onClick={onToggleMobile}
            className="p-2 -ml-1 rounded-lg hover:bg-surface-container-low transition-colors"
            aria-label="Open menu"
          >
            <span className="material-symbols-outlined text-on-surface text-[22px]">menu</span>
          </button>
        ) : (
          desktopCollapsed && (
            <button
              onClick={onToggleDesktopCollapse}
              className="p-2 -ml-1 rounded-lg hover:bg-surface-container-low transition-colors"
              aria-label="Expand sidebar"
            >
              <span className="material-symbols-outlined text-on-surface text-[22px]">menu</span>
            </button>
          )
        )}
        <div className="relative max-w-md flex-1 hidden sm:block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px] pointer-events-none">
            search
          </span>
          <input
            type="text"
            placeholder="Search campaigns, creators, properties…"
            className="w-full h-10 pl-10 pr-4 bg-surface-container-low border border-outline-variant rounded-lg text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-shadow"
          />
        </div>
      </div>

      {/* Right: bell, help, avatar */}
      <div className="flex items-center gap-1 sm:gap-2">
        <NotificationBell />

        <a
          href="mailto:support@airhouse.co.za?subject=AirHouse%20Support%20Request"
          className="hidden sm:flex p-2 rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors items-center justify-center"
          aria-label="Help & support"
          title="Contact support"
        >
          <span className="material-symbols-outlined text-[22px]">help</span>
        </a>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 p-1 pl-1 pr-2 sm:pr-3 rounded-full hover:bg-surface-container-low transition-colors"
          >
            <Avatar
              src={profile?.avatar_url}
              name={profile?.full_name || 'User'}
              size="sm"
            />
            <div className="hidden md:block text-left leading-tight">
              <p className="text-label-md text-label-md text-on-surface font-semibold truncate max-w-[140px]">
                {profile?.full_name || 'Welcome'}
              </p>
              <p className="text-[11px] text-on-surface-variant capitalize">
                {role || 'User'}
              </p>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant text-[18px] hidden md:inline">
              expand_more
            </span>
          </button>

          {menuOpen && (
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
                  to={dashboardPath}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-body-sm text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">dashboard</span>
                  Dashboard
                </Link>
                <Link
                  to={`${dashboardPath}/profile`}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-body-sm text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">person</span>
                  Edit Profile
                </Link>
                <Link
                  to={`${dashboardPath}/settings`}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-body-sm text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">settings</span>
                  Settings
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
      </div>
    </header>
  )
}

export default TopAppBar
