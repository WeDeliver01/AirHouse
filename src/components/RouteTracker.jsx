import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { recordPageView } from '../lib/siteAnalytics'

/**
 * Fires a first-party pageview on every route change. Mounted once, inside
 * the Router, above all routes.
 */
const RouteTracker = () => {
  const location = useLocation()

  useEffect(() => {
    recordPageView(location.pathname + location.search)
  }, [location.pathname, location.search])

  return null
}

export default RouteTracker
