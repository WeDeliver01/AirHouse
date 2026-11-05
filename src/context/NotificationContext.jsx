import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const NotificationContext = createContext({})

export const useNotifications = () => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}

const getReadIds = (userId) => {
  try {
    const stored = localStorage.getItem('notifications_read_' + userId)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

const saveReadIds = (userId, ids) => {
  try {
    localStorage.setItem('notifications_read_' + userId, JSON.stringify(ids))
  } catch {}
}

const generateNotifications = async (userId, role) => {
  const notifications = []

  if (role === 'developer') {
    try {
      const { data: devCampaigns } = await supabase
        .from('campaigns')
        .select('id')
        .eq('developer_id', userId)
      const campaignIds = devCampaigns?.map(c => c.id) || []

      if (campaignIds.length > 0) {
        const { data: leads } = await supabase
          .from('leads')
          .select('id, lead_name, campaign:campaigns(title), created_at')
          .in('campaign_id', campaignIds)
          .order('created_at', { ascending: false })
          .limit(5)

        leads?.forEach(lead => {
          notifications.push({
            id: `lead-${lead.id}`,
            type: 'new_lead',
            title: 'New Lead Captured',
            message: `${lead.lead_name || 'A new lead'} for ${lead.campaign?.title || 'your campaign'}`,
            created_at: lead.created_at,
            read: false,
          })
        })

        const { data: apps } = await supabase
          .from('campaign_applications')
          .select('id, creator:profiles!creator_id(full_name), campaign:campaigns(title), applied_at')
          .in('campaign_id', campaignIds)
          .eq('status', 'pending')
          .order('applied_at', { ascending: false })
          .limit(5)

        apps?.forEach(app => {
          notifications.push({
            id: `app-${app.id}`,
            type: 'application',
            title: 'New Application',
            message: `${app.creator?.full_name || 'A creator'} applied for ${app.campaign?.title || 'your campaign'}`,
            created_at: app.applied_at,
            read: false,
          })
        })
      }
    } catch {}
  }

  if (role === 'creator') {
    try {
      const { data: assignments } = await supabase
        .from('campaign_assignments')
        .select('id, campaign:campaigns(title), created_at')
        .eq('creator_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)

      assignments?.forEach(a => {
        notifications.push({
          id: `assign-${a.id}`,
          type: 'campaign_assigned',
          title: 'Campaign Assignment',
          message: `You've been assigned to ${a.campaign?.title || 'a campaign'}`,
          created_at: a.created_at,
          read: false,
        })
      })
    } catch {}
  }

  return notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

const fetchUnreadMessageNotifications = async (userId) => {
  try {
    // Exact count of all unread messages so the sidebar badge stays accurate
    // even if the user has more than the 50-row preview we fetch below.
    const { count: exactUnread } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .is('read_at', null)

    const { data, error } = await supabase
      .from('messages')
      .select(`
        id, sender_id, body, created_at,
        sender:profiles!messages_sender_id_fkey ( id, full_name, avatar_url )
      `)
      .eq('recipient_id', userId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    const grouped = new Map()
    for (const m of data || []) {
      const existing = grouped.get(m.sender_id)
      if (!existing) {
        grouped.set(m.sender_id, {
          senderId: m.sender_id,
          senderName: m.sender?.full_name || 'Someone',
          lastBody: m.body,
          lastAt: m.created_at,
          count: 1,
        })
      } else {
        existing.count += 1
      }
    }

    const notifications = Array.from(grouped.values()).map((g) => ({
      id: `msg-from-${g.senderId}`,
      type: 'message',
      title: g.count > 1 ? `${g.count} new messages` : 'New message',
      message: `${g.senderName}: ${g.lastBody}`,
      created_at: g.lastAt,
      read: false,
      link: `/messages?to=${g.senderId}`,
    }))

    const totalUnread = typeof exactUnread === 'number'
      ? exactUnread
      : (data || []).length
    return { notifications, totalUnread }
  } catch {
    return { notifications: [], totalUnread: 0 }
  }
}

export const NotificationProvider = ({ children }) => {
  const { user, profile, isAuthenticated } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [, setReadIds] = useState([])
  const [useLocalFallback, setUseLocalFallback] = useState(false)
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const intervalRef = useRef(null)

  const userId = user?.id
  const role = profile?.role

  const fetchNotifications = useCallback(async () => {
    if (!userId) return

    const { notifications: msgNotifs, totalUnread } = await fetchUnreadMessageNotifications(userId)
    setUnreadMessageCount(totalUnread)

    let baseList = null

    if (!useLocalFallback) {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50)

        if (error) throw error

        if (data) {
          const stored = getReadIds(userId)
          setReadIds(stored)
          baseList = data.map(n => ({
            ...n,
            read: n.read || stored.includes(n.id),
          }))
        }
      } catch {
        setUseLocalFallback(true)
      }
    }

    if (baseList === null) {
      try {
        const generated = await generateNotifications(userId, role)
        const stored = getReadIds(userId)
        setReadIds(stored)
        baseList = generated.map(n => ({
          ...n,
          read: stored.includes(n.id),
        }))
      } catch {
        baseList = []
      }
    }

    const merged = [...msgNotifs, ...baseList].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )
    setNotifications(merged)
  }, [userId, role, useLocalFallback])

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      setNotifications([])
      setUnreadMessageCount(0)
      return
    }

    fetchNotifications()

    intervalRef.current = setInterval(fetchNotifications, 30000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isAuthenticated, userId, fetchNotifications])

  const markAsRead = useCallback((id) => {
    if (!userId) return
    // Message notifications are driven by the DB read_at; the messages page
    // marks them read when the conversation is opened. Skip localStorage here
    // so the badge stays accurate across reloads.
    if (typeof id === 'string' && id.startsWith('msg-from-')) {
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      )
      return
    }
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    )
    setReadIds(prev => {
      const updated = [...new Set([...prev, id])]
      saveReadIds(userId, updated)
      return updated
    })
  }, [userId])

  const markAllRead = useCallback(() => {
    if (!userId) return
    // Skip message-derived notifications — their read state lives in the DB
    // and is cleared when the user opens the conversation. Marking them
    // locally would only cause them to flicker back on the next poll.
    const isMessageId = (id) =>
      typeof id === 'string' && id.startsWith('msg-from-')
    setNotifications(prev =>
      prev.map(n => isMessageId(n.id) ? n : { ...n, read: true })
    )
    setReadIds(prev => {
      const persistableIds = notifications
        .map(n => n.id)
        .filter(id => !isMessageId(id))
      const updated = [...new Set([...prev, ...persistableIds])]
      saveReadIds(userId, updated)
      return updated
    })
  }, [userId, notifications])

  const addNotification = useCallback((notification) => {
    setNotifications(prev => [notification, ...prev])
  }, [])

  const refresh = useCallback(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const unreadCount = notifications.filter(n => !n.read).length

  const value = {
    notifications,
    unreadCount,
    unreadMessageCount,
    markAsRead,
    markAllRead,
    addNotification,
    refresh,
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}

export default NotificationContext
