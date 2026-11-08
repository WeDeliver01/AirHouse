import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../context/NotificationContext'
import { cn } from '../../lib/utils'
import { formatDistanceToNow } from 'date-fns'

// Material Symbols icon name + token classes for each notification type
const typeConfig = {
  new_lead:           { icon: 'trending_up',    iconColor: 'text-secondary',    bg: 'bg-secondary-fixed/30' },
  application:        { icon: 'person_add',     iconColor: 'text-primary',      bg: 'bg-primary-fixed/30' },
  campaign_assigned:  { icon: 'campaign',       iconColor: 'text-primary',      bg: 'bg-primary-fixed/30' },
  content_approved:   { icon: 'check_circle',   iconColor: 'text-secondary',    bg: 'bg-secondary-fixed/30' },
  content_rejected:   { icon: 'cancel',         iconColor: 'text-error',        bg: 'bg-error-container' },
  payout:             { icon: 'payments',       iconColor: 'text-secondary',    bg: 'bg-secondary-fixed/30' },
  review:             { icon: 'star',           iconColor: 'text-tertiary',     bg: 'bg-tertiary-fixed' },
  message:            { icon: 'chat_bubble',    iconColor: 'text-primary',      bg: 'bg-primary-fixed/30' },
}

const getTypeConfig = (type) =>
  typeConfig[type] || { icon: 'notifications', iconColor: 'text-on-surface-variant', bg: 'bg-surface-variant' }

const formatTime = (dateStr) => {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return ''
  }
}

const NotificationBell = () => {
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)
  const buttonRef = useRef(null)

  const handleNotificationClick = (notification) => {
    markAsRead(notification.id)
    if (notification.link) {
      setOpen(false)
      navigate(notification.link)
    }
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors"
        aria-label="Notifications"
      >
        <span className="material-symbols-outlined text-[22px]">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-on-error bg-error rounded-full leading-none border-2 border-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className={cn(
            'absolute top-full right-0 mt-2 bg-surface-container-lowest rounded-xl border border-outline-variant z-50 overflow-hidden',
            'shadow-[0_8px_24px_rgba(20,27,43,0.12)]',
            'w-[360px] sm:w-[400px]',
            'max-sm:fixed max-sm:left-2 max-sm:right-2 max-sm:w-auto max-sm:top-16'
          )}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-md py-sm border-b border-outline-variant bg-surface-bright">
            <div className="flex items-center gap-sm">
              <h3 className="font-headline-md text-base font-semibold text-on-surface">Notifications</h3>
              {unreadCount > 0 && (
                <span className="bg-primary-container text-on-primary-container font-label-md text-label-md px-2 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="flex items-center gap-1 font-label-md text-label-md text-primary hover:text-on-primary-container transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">done_all</span>
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[440px] overflow-y-auto bg-surface">
            {notifications.length === 0 ? (
              <div className="px-md py-xl text-center">
                <span className="material-symbols-outlined text-[40px] text-outline mb-2 block">
                  notifications_off
                </span>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  You're all caught up
                </p>
              </div>
            ) : (
              notifications.map((notification) => {
                const config = getTypeConfig(notification.type)
                const isUnread = !notification.read
                return (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      'w-full text-left block p-md border-b border-outline-variant/50 last:border-b-0 hover:bg-surface-container-low transition-colors relative',
                      isUnread ? 'bg-surface-container-low' : 'bg-surface'
                    )}
                  >
                    {isUnread && (
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-error" />
                    )}
                    <div className={cn('flex gap-sm', isUnread ? 'pl-4' : 'pl-2')}>
                      <div className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                        config.bg
                      )}>
                        <span className={cn('material-symbols-outlined text-[20px]', config.iconColor)}>
                          {config.icon}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2 mb-xs">
                          <h3 className={cn(
                            'font-label-lg text-label-lg truncate',
                            isUnread ? 'text-on-surface' : 'text-on-surface-variant'
                          )}>
                            {notification.title}
                          </h3>
                          <span className={cn(
                            'font-label-md text-label-md flex-shrink-0',
                            isUnread ? 'text-primary' : 'text-outline'
                          )}>
                            {formatTime(notification.created_at)}
                          </span>
                        </div>
                        <p className={cn(
                          'font-body-sm text-body-sm line-clamp-2',
                          isUnread ? 'text-on-surface-variant' : 'text-outline'
                        )}>
                          {notification.message}
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
