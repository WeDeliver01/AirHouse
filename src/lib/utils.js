import { clsx } from 'clsx'

// Merge class names
export function cn(...inputs) {
  return clsx(inputs)
}

// Format currency (South African Rand)
export function formatCurrency(amount, showSymbol = true) {
  const formatted = new Intl.NumberFormat('en-ZA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
  
  return showSymbol ? `R${formatted}` : formatted
}

// Format date
export function formatDate(date, options = {}) {
  const defaultOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  }
  
  return new Intl.DateTimeFormat('en-ZA', defaultOptions).format(new Date(date))
}

// Format relative time
export function formatRelativeTime(date) {
  const now = new Date()
  const then = new Date(date)
  const diffInSeconds = Math.floor((now - then) / 1000)
  
  if (diffInSeconds < 60) return 'Just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`
  
  return formatDate(date, { day: 'numeric', month: 'short' })
}

// Generate unique referral code
export function generateReferralCode(prefix = 'REF') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = prefix + '-'
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// Generate campaign slug
export function generateSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// Format number with abbreviation
export function formatNumber(num) {
  if (!num) return '0'
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

// Truncate text
export function truncate(text, length = 100) {
  if (!text) return ''
  if (text.length <= length) return text
  return text.slice(0, length) + '...'
}

// Calculate cost per lead
export function calculateCPL(budget, leads) {
  if (!leads || leads === 0) return 0
  return Math.round(budget / leads)
}

// Validate email
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// Validate phone (South African format)
export function isValidPhone(phone) {
  const cleaned = phone.replace(/\D/g, '')
  return cleaned.length >= 10 && cleaned.length <= 12
}

// Debounce function
export function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

// Get initials from name
export function getInitials(name) {
  if (!name) return '?'
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Status colors mapping
export const statusColors = {
  // Campaign statuses
  draft: 'badge-secondary',
  open: 'badge-primary',
  invited: 'badge-warning',
  active: 'badge-success',
  completed: 'badge-success',
  archived: 'badge-secondary',
  
  // Application statuses
  pending: 'badge-warning',
  accepted: 'badge-success',
  rejected: 'badge-danger',
  
  // Lead statuses
  new: 'badge-primary',
  contacted: 'badge-warning',
  qualified: 'badge-success',
  converted: 'badge-success',
  lost: 'badge-danger',
  
  // Payment statuses
  paid: 'badge-success',
  unpaid: 'badge-warning',
}

// Role-based route prefixes
export const rolePaths = {
  creator: '/creator',
  developer: '/developer',
  admin: '/admin',
}

// Campaign status flow
export const campaignStatusFlow = {
  draft: ['open'],
  open: ['invited', 'active', 'archived'],
  invited: ['active', 'archived'],
  active: ['completed'],
  completed: ['archived'],
  archived: [],
}
