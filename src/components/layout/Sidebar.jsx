import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import { cn } from '../../lib/utils'
import { NAV_ITEMS, getRoleFromPath } from '../../lib/navItems'

const Sidebar = ({
  open,
  collapsed = false,
  isMobile,
  onToggleCollapse,
  onClose,
}) => {
  const { profile, signOut, isSuperAdmin } = useAuth()
  const { unreadMessageCount } = useNotifications()
  const navigate = useNavigate()
  const location = useLocation()

  const currentRole = profile?.role || getRoleFromPath(location.pathname)
  const navItems = (NAV_ITEMS[currentRole] || []).filter(
    (item) => !item.superAdminOnly || isSuperAdmin
  )

  const isCollapsed = !isMobile && collapsed

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const handleNavClick = () => {
    if (isMobile) onClose()
  }

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 h-screen bg-surface-container-lowest border-r border-outline-variant z-30 flex flex-col transition-[transform,width] duration-300',
        isMobile
          ? cn('w-64 shadow-2xl', open ? 'translate-x-0' : '-translate-x-full')
          : cn('translate-x-0', isCollapsed ? 'w-20' : 'w-64')
      )}
    >
      {/* Brand block */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-outline-variant flex-shrink-0">
        {(!isCollapsed || isMobile) ? (
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="AirHouse" className="w-9 h-9 object-contain flex-shrink-0" />
            <div className="leading-tight min-w-0">
              <div className="font-headline-md text-base font-bold text-primary truncate">AirHouse</div>
              <div className="text-[11px] text-on-surface-variant tracking-wide truncate">Property Tech</div>
            </div>
          </div>
        ) : (
          <img src="/logo.png" alt="AirHouse" className="w-9 h-9 object-contain mx-auto" />
        )}
        {isMobile ? (
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-container-low transition-colors flex-shrink-0"
            aria-label="Close menu"
          >
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">close</span>
          </button>
        ) : (
          !isCollapsed && (
            <button
              onClick={onToggleCollapse}
              className="p-2 rounded-lg hover:bg-surface-container-low transition-colors flex-shrink-0"
              aria-label="Collapse sidebar"
            >
              <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
                chevron_left
              </span>
            </button>
          )
        )}
      </div>

      {/* Collapsed-state expand button */}
      {isCollapsed && (
        <button
          onClick={onToggleCollapse}
          className="mx-auto mt-3 p-2 rounded-lg hover:bg-surface-container-low transition-colors"
          aria-label="Expand sidebar"
        >
          <span className="material-symbols-outlined text-on-surface-variant text-[20px]">menu</span>
        </button>
      )}

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-4 overscroll-contain">
        <ul className={cn('space-y-1', isCollapsed ? 'px-2' : 'px-3')}>
          {navItems.map((item) => {
            const badgeCount = item.path === '/messages' ? unreadMessageCount : 0
            const showBadge = badgeCount > 0
            const badgeLabel = badgeCount > 99 ? '99+' : String(badgeCount)
            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.end}
                  onClick={handleNavClick}
                  title={isCollapsed
                    ? (showBadge ? `${item.label} (${badgeLabel} unread)` : item.label)
                    : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg font-label-lg text-label-lg transition-colors',
                      isCollapsed
                        ? 'justify-center px-2 py-2.5'
                        : 'px-3 py-2.5',
                      isActive
                        ? 'bg-primary-container text-on-primary-container font-semibold'
                        : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                    )
                  }
                >
                  <span className="relative flex-shrink-0">
                    <span className="material-symbols-outlined text-[20px]">
                      {item.icon}
                    </span>
                    {showBadge && isCollapsed && (
                      <span className="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center px-1 text-[10px] font-bold text-on-error bg-error rounded-full leading-none border-2 border-surface-container-lowest">
                        {badgeLabel}
                      </span>
                    )}
                  </span>
                  {!isCollapsed && (
                    <>
                      <span className="truncate flex-1">{item.label}</span>
                      {showBadge && (
                        <span className="ml-auto min-w-[20px] h-5 flex items-center justify-center px-1.5 text-[11px] font-bold text-on-error bg-error rounded-full leading-none">
                          {badgeLabel}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className={cn('border-t border-outline-variant flex-shrink-0', isCollapsed ? 'p-2' : 'p-3')}>
        <button
          onClick={handleSignOut}
          title={isCollapsed ? 'Sign Out' : undefined}
          className={cn(
            'flex items-center gap-3 w-full rounded-lg text-on-surface-variant hover:bg-error-container hover:text-on-error-container transition-colors font-label-lg text-label-lg',
            isCollapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
          )}
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
          {!isCollapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
