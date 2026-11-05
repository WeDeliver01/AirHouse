export const NAV_ITEMS = {
  creator: [
    { label: 'Dashboard',         path: '/creator',              icon: 'dashboard',           end: true },
    { label: 'Browse Campaigns',  path: '/creator/campaigns',    icon: 'storefront' },
    { label: 'Browse Properties', path: '/creator/properties',   icon: 'home_work' },
    { label: 'My Applications',   path: '/creator/applications', icon: 'inbox' },
    { label: 'Active Campaigns',  path: '/creator/active',       icon: 'assignment' },
    { label: 'Messages',          path: '/messages',             icon: 'chat_bubble' },
    { label: 'My Wallet',         path: '/creator/wallet',       icon: 'account_balance_wallet' },
    { label: 'My Scorecard',      path: '/creator/scorecard',    icon: 'monitoring' },
    { label: 'Verification',      path: '/creator/verification', icon: 'verified_user' },
    { label: 'Contracts',         path: '/creator/contracts',    icon: 'description' },
    { label: 'Disputes',          path: '/creator/disputes',     icon: 'gavel' },
    { label: 'Edit Profile',      path: '/creator/profile',      icon: 'person' },
    { label: 'Settings',          path: '/creator/settings',     icon: 'settings' },
    { label: 'Help & Support',    path: '/help',                 icon: 'help' },
  ],
  developer: [
    { label: 'Dashboard',         path: '/developer',                icon: 'dashboard',     end: true },
    { label: 'Properties',        path: '/developer/properties',     icon: 'home_work' },
    { label: 'My Campaigns',      path: '/developer/campaigns',      icon: 'campaign' },
    { label: 'Create Campaign',   path: '/developer/campaigns/new',  icon: 'add_circle' },
    { label: 'Marketplace',       path: '/marketplace',              icon: 'storefront' },
    { label: 'My Favourites',     path: '/developer/favorites',      icon: 'favorite' },
    { label: 'Browse Creators',   path: '/developer/creators',       icon: 'group_search' },
    { label: 'Assignments',       path: '/developer/assignments',    icon: 'assignment' },
    { label: 'Leads',             path: '/developer/leads',          icon: 'groups' },
    { label: 'Messages',          path: '/messages',                 icon: 'chat_bubble' },
    { label: 'Wallet',            path: '/developer/wallet',         icon: 'account_balance_wallet' },
    { label: 'Analytics',         path: '/developer/analytics',      icon: 'monitoring' },
    { label: 'Cost Per Lead',     path: '/developer/cost-per-lead',  icon: 'payments' },
    { label: 'Creator Rankings',  path: '/developer/rankings',       icon: 'emoji_events' },
    { label: 'ROI Dashboard',     path: '/developer/roi',            icon: 'pie_chart' },
    { label: 'Reviews',           path: '/developer/reviews',        icon: 'reviews' },
    { label: 'Contracts',         path: '/developer/contracts',      icon: 'description' },
    { label: 'Disputes',          path: '/developer/disputes',       icon: 'gavel' },
    { label: 'Edit Profile',      path: '/developer/profile',        icon: 'person' },
    { label: 'Settings',          path: '/developer/settings',       icon: 'settings' },
    { label: 'Help & Support',    path: '/help',                     icon: 'help' },
  ],
  admin: [
    { label: 'Overview',     path: '/admin',              icon: 'dashboard',           end: true },
    { label: 'Analytics',    path: '/admin/analytics',    icon: 'monitoring' },
    { label: 'Financials',   path: '/admin/financials',   icon: 'account_balance' },
    { label: 'Payments',     path: '/admin/payments',     icon: 'payments' },
    { label: 'All Campaigns',path: '/admin/campaigns',    icon: 'campaign' },
    { label: 'All Users',    path: '/admin/users',        icon: 'group' },
    { label: 'All Leads',    path: '/admin/leads',        icon: 'groups' },
    { label: 'Verification', path: '/admin/verification', icon: 'verified_user' },
    { label: 'Messages',     path: '/messages',           icon: 'chat_bubble' },
    { label: 'Contracts',    path: '/admin/contracts',    icon: 'description' },
    { label: 'Disputes',     path: '/admin/disputes',     icon: 'gavel' },
    { label: 'Settings',     path: '/admin/settings',     icon: 'settings' },
    { label: 'Help & Support', path: '/help',             icon: 'help' },
  ],
}

export const ROLE_DASHBOARD_PATH = {
  admin: '/admin',
  developer: '/developer',
  creator: '/creator',
}

export const getRoleFromPath = (pathname) => {
  if (pathname.startsWith('/admin')) return 'admin'
  if (pathname.startsWith('/developer')) return 'developer'
  if (pathname.startsWith('/creator')) return 'creator'
  return null
}

export const getDashboardPath = (role, pathname) => {
  if (role && ROLE_DASHBOARD_PATH[role]) return ROLE_DASHBOARD_PATH[role]
  const fallback = getRoleFromPath(pathname || '')
  return ROLE_DASHBOARD_PATH[fallback] || '/'
}
