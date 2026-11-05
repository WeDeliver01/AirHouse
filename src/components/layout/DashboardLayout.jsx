import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Link } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopAppBar from './TopAppBar'
import { cn } from '../../lib/utils'
import { NotificationProvider } from '../../context/NotificationContext'
import { COMPANY } from '../../data/companyInfo'
import { openCookieSettings } from '../CookieConsentBanner'

const STORAGE_KEY = 'airhouse:sidebar:collapsed'

const DashboardLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  })
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      if (!mobile) setMobileOpen(false)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, desktopCollapsed ? '1' : '0')
    }
  }, [desktopCollapsed])

  const toggleMobile = () => setMobileOpen((v) => !v)
  const closeMobile = () => setMobileOpen(false)
  const toggleDesktopCollapse = () => setDesktopCollapsed((v) => !v)

  return (
    <NotificationProvider>
      <div className="min-h-screen bg-background">
        <Sidebar
          open={mobileOpen}
          collapsed={desktopCollapsed}
          isMobile={isMobile}
          onToggleCollapse={toggleDesktopCollapse}
          onClose={closeMobile}
        />

        <div
          className={cn(
            'min-h-screen flex flex-col transition-[margin] duration-300',
            !isMobile && (desktopCollapsed ? 'ml-20' : 'ml-64')
          )}
        >
          <TopAppBar
            isMobile={isMobile}
            desktopCollapsed={desktopCollapsed}
            onToggleMobile={toggleMobile}
            onToggleDesktopCollapse={toggleDesktopCollapse}
          />

          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <div className="max-w-[1280px] mx-auto w-full">
              <Outlet />
            </div>
          </main>

          <footer className="border-t border-outline-variant bg-surface-container-lowest">
            <div className="max-w-[1280px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 space-y-2">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <p className="font-label-md text-label-md text-on-surface-variant">
                  © {new Date().getFullYear()} {COMPANY.tradingName} ({COMPANY.legalName}) · Reg {COMPANY.regNumber}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 font-label-md text-label-md">
                  <Link to="/legal/terms" className="text-on-surface-variant hover:text-primary">Terms</Link>
                  <Link to="/legal/privacy" className="text-on-surface-variant hover:text-primary">Privacy</Link>
                  <Link to="/legal/refunds" className="text-on-surface-variant hover:text-primary">Refunds</Link>
                  <Link to="/legal/paia" className="text-on-surface-variant hover:text-primary">PAIA</Link>
                  <Link to="/legal" className="text-on-surface-variant hover:text-primary">All policies</Link>
                  <Link to="/help" className="text-on-surface-variant hover:text-primary">Help</Link>
                  <button type="button" onClick={openCookieSettings} className="text-on-surface-variant hover:text-primary">
                    Cookie Settings
                  </button>
                </div>
              </div>
              <p className="font-label-md text-label-md text-on-surface-variant">
                {COMPANY.address.line1}, {COMPANY.address.suburb}, {COMPANY.address.city}, {COMPANY.address.postalCode} ·{' '}
                <a className="hover:text-primary" href={`mailto:${COMPANY.email.support}`}>{COMPANY.email.support}</a> ·{' '}
                <a className="hover:text-primary" href={`tel:${COMPANY.phone.replace(/\s+/g, '')}`}>{COMPANY.phone}</a>
              </p>
            </div>
          </footer>
        </div>

        {/* Mobile backdrop */}
        {mobileOpen && isMobile && (
          <div
            className="fixed inset-0 bg-black/40 z-20 lg:hidden"
            onClick={closeMobile}
          />
        )}
      </div>
    </NotificationProvider>
  )
}

export default DashboardLayout
