import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import ScrollToTop from './components/ui/ScrollToTop'
import CookieConsentBanner from './components/CookieConsentBanner'
import PendingTermsAcceptanceFlush from './components/PendingTermsAcceptanceFlush'
import ErrorBoundary from './components/ErrorBoundary'
import { initMonitoring } from './lib/monitoring'
import './styles/globals.css'

// Start error reporting before anything renders, so a failure during the
// first paint is still captured. Safe when no DSN is configured.
initMonitoring()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
      <AuthProvider>
        <ScrollToTop />
        <App />
        <CookieConsentBanner />
        <PendingTermsAcceptanceFlush />
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#ffffff',
              color: '#0f172a',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '16px',
              fontSize: '14px',
            },
            success: {
              iconTheme: {
                primary: '#16a34a',
                secondary: '#ffffff',
              },
            },
            error: {
              iconTheme: {
                primary: '#dc2626',
                secondary: '#ffffff',
              },
            },
          }}
        />
      </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
)
