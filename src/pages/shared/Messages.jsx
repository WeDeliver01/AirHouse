import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import { supabase } from '../../lib/supabase'
import { LoadingSpinner } from '../../components/ui'
import { cn } from '../../lib/utils'
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns'
import toast from 'react-hot-toast'

const POLL_INTERVAL_MS = 15000

const Avatar = ({ name, src, size = 'md' }) => {
  const initials = (name || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  const dim = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-12 h-12 text-base' : 'w-10 h-10 text-sm'
  if (src) {
    return (
      <img src={src} alt={name} className={cn(dim, 'rounded-full object-cover border border-outline-variant')} />
    )
  }
  return (
    <div className={cn(dim, 'rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-semibold flex items-center justify-center border border-outline-variant')}>
      {initials}
    </div>
  )
}

const formatTimeShort = (date) => {
  if (!date) return ''
  const d = new Date(date)
  if (isToday(d)) return format(d, 'h:mm a')
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMM d')
}

const formatRelative = (date) => {
  try { return formatDistanceToNow(new Date(date), { addSuffix: true }) } catch { return '' }
}

const Messages = () => {
  const { user, profile } = useAuth()
  const { refresh: refreshNotifications } = useNotifications()
  const [searchParams, setSearchParams] = useSearchParams()

  const [conversations, setConversations] = useState([])
  const [loadingConvos, setLoadingConvos] = useState(true)
  const [selectedPartnerId, setSelectedPartnerId] = useState(null)
  const [selectedPartner, setSelectedPartner] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')

  const [showCompose, setShowCompose] = useState(false)
  const [composeQuery, setComposeQuery] = useState('')
  const [composeResults, setComposeResults] = useState([])
  const [composing, setComposing] = useState(false)

  const messagesEndRef = useRef(null)
  const pollRef = useRef(null)
  const myId = user?.id

  // ------------------------------------------------------------------
  // Conversation list
  // ------------------------------------------------------------------
  const fetchConversations = useCallback(async () => {
    if (!myId) return
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id, sender_id, recipient_id, body, read_at, created_at,
          sender:profiles!messages_sender_id_fkey ( id, full_name, role, avatar_url ),
          recipient:profiles!messages_recipient_id_fkey ( id, full_name, role, avatar_url )
        `)
        .or(`sender_id.eq.${myId},recipient_id.eq.${myId}`)
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) throw error

      const grouped = new Map()
      for (const m of data || []) {
        const partnerId = m.sender_id === myId ? m.recipient_id : m.sender_id
        const partner = m.sender_id === myId ? m.recipient : m.sender
        const unreadHere = m.recipient_id === myId && !m.read_at
        if (!grouped.has(partnerId)) {
          grouped.set(partnerId, {
            partnerId,
            partner,
            lastBody: m.body,
            lastAt: m.created_at,
            lastFromMe: m.sender_id === myId,
            unread: unreadHere ? 1 : 0,
          })
        } else {
          const entry = grouped.get(partnerId)
          if (unreadHere) entry.unread += 1
        }
      }
      setConversations(Array.from(grouped.values()))
    } catch (err) {
      console.error('fetchConversations', err)
    } finally {
      setLoadingConvos(false)
    }
  }, [myId])

  // ------------------------------------------------------------------
  // Active conversation messages
  // ------------------------------------------------------------------
  const fetchMessages = useCallback(async (partnerId, opts = {}) => {
    if (!myId || !partnerId) return
    if (!opts.silent) setLoadingMsgs(true)
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender_id, recipient_id, body, read_at, created_at')
        .or(
          `and(sender_id.eq.${myId},recipient_id.eq.${partnerId}),` +
          `and(sender_id.eq.${partnerId},recipient_id.eq.${myId})`
        )
        .order('created_at', { ascending: true })
        .limit(200)

      if (error) throw error
      setMessages(data || [])

      const unreadIncoming = (data || []).filter((m) => m.recipient_id === myId && !m.read_at)
      if (unreadIncoming.length > 0) {
        const ids = unreadIncoming.map((m) => m.id)
        await supabase
          .from('messages')
          .update({ read_at: new Date().toISOString() })
          .in('id', ids)
        // Refresh unread counts in convo list, and ping the notifications
        // context so the sidebar badge / bell entry clear immediately
        // instead of waiting for the next 30s poll.
        fetchConversations()
        refreshNotifications?.()
      }
    } catch (err) {
      console.error('fetchMessages', err)
    } finally {
      setLoadingMsgs(false)
    }
  }, [myId, fetchConversations, refreshNotifications])

  // Initial load
  useEffect(() => {
    if (myId) fetchConversations()
  }, [myId, fetchConversations])

  // 15-second polling
  useEffect(() => {
    if (!myId) return
    pollRef.current = setInterval(() => {
      fetchConversations()
      if (selectedPartnerId) fetchMessages(selectedPartnerId, { silent: true })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(pollRef.current)
  }, [myId, selectedPartnerId, fetchConversations, fetchMessages])

  // Pick partner from URL ?to=
  useEffect(() => {
    const target = searchParams.get('to')
    if (target && target !== selectedPartnerId) {
      setSelectedPartnerId(target)
    }
  }, [searchParams, selectedPartnerId])

  // Load messages whenever the selection changes; pull partner from convos or fetch fresh
  useEffect(() => {
    if (!selectedPartnerId) return
    const conv = conversations.find((c) => c.partnerId === selectedPartnerId)
    if (conv) {
      setSelectedPartner(conv.partner)
    } else {
      supabase
        .from('profiles')
        .select('id, full_name, role, avatar_url')
        .eq('id', selectedPartnerId)
        .single()
        .then(({ data }) => setSelectedPartner(data))
    }
    fetchMessages(selectedPartnerId)
  }, [selectedPartnerId, conversations, fetchMessages])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, selectedPartnerId])

  // ------------------------------------------------------------------
  // Sending
  // ------------------------------------------------------------------
  const handleSend = async (e) => {
    e?.preventDefault?.()
    const body = draft.trim()
    if (!body || !selectedPartnerId || sending) return
    setSending(true)
    try {
      const optimistic = {
        id: 'tmp-' + Date.now(),
        sender_id: myId,
        recipient_id: selectedPartnerId,
        body,
        read_at: null,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, optimistic])
      setDraft('')

      const { error } = await supabase.from('messages').insert({
        sender_id: myId,
        recipient_id: selectedPartnerId,
        body,
      })
      if (error) throw error

      fetchMessages(selectedPartnerId, { silent: true })
      fetchConversations()
    } catch (err) {
      console.error('send error', err)
      toast.error('Could not send message')
      // Rollback optimistic
      setMessages((prev) => prev.filter((m) => !m.id.toString().startsWith('tmp-')))
    } finally {
      setSending(false)
    }
  }

  // ------------------------------------------------------------------
  // Compose / new conversation
  // ------------------------------------------------------------------
  const searchPeople = useCallback(async (q) => {
    if (!q || q.length < 2) {
      setComposeResults([])
      return
    }
    setComposing(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, avatar_url, company_name')
        .neq('id', myId)
        .ilike('full_name', `%${q}%`)
        .in('role', ['creator', 'developer', 'admin'])
        .limit(10)
      if (error) throw error
      setComposeResults(data || [])
    } catch (err) {
      console.error('search people', err)
    } finally {
      setComposing(false)
    }
  }, [myId])

  useEffect(() => {
    const t = setTimeout(() => searchPeople(composeQuery), 300)
    return () => clearTimeout(t)
  }, [composeQuery, searchPeople])

  const startConversationWith = (person) => {
    setShowCompose(false)
    setComposeQuery('')
    setSearchParams({ to: person.id })
    setSelectedPartnerId(person.id)
    setSelectedPartner(person)
  }

  // ------------------------------------------------------------------
  // Filtered + grouped messages by date
  // ------------------------------------------------------------------
  const filteredConvos = useMemo(() => {
    if (!search) return conversations
    const q = search.toLowerCase()
    return conversations.filter((c) =>
      (c.partner?.full_name || '').toLowerCase().includes(q) ||
      (c.lastBody || '').toLowerCase().includes(q)
    )
  }, [conversations, search])

  const totalUnread = useMemo(
    () => conversations.reduce((acc, c) => acc + (c.unread || 0), 0),
    [conversations]
  )

  const groupedMessages = useMemo(() => {
    const groups = []
    let lastLabel = null
    for (const m of messages) {
      const d = new Date(m.created_at)
      const label = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'MMM d, yyyy')
      if (label !== lastLabel) {
        groups.push({ type: 'divider', label, key: 'd-' + label + '-' + m.id })
        lastLabel = label
      }
      groups.push({ type: 'message', ...m, key: m.id })
    }
    return groups
  }, [messages])

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="-mx-4 -my-4 sm:-mx-6 sm:-my-6 lg:-mx-8 lg:-my-8 h-[calc(100vh-4rem)] flex bg-surface-bright overflow-hidden border-t border-outline-variant">
      {/* Left pane: conversations */}
      <aside className={cn(
        'w-full md:w-80 lg:w-96 border-r border-outline-variant bg-surface flex flex-col flex-shrink-0',
        selectedPartnerId ? 'hidden md:flex' : 'flex'
      )}>
        <div className="p-md border-b border-outline-variant bg-surface">
          <div className="flex items-center justify-between mb-md">
            <h2 className="font-headline-md text-headline-md text-on-surface">
              Messages {totalUnread > 0 && (
                <span className="ml-2 align-middle bg-primary-container text-on-primary-container font-label-md text-label-md px-2 py-0.5 rounded-full">
                  {totalUnread}
                </span>
              )}
            </h2>
            <button
              onClick={() => setShowCompose(true)}
              className="p-2 rounded-full text-primary hover:bg-surface-container-low transition-colors"
              aria-label="New message"
              title="Start new conversation"
            >
              <span className="material-symbols-outlined text-[22px]">edit_square</span>
            </button>
          </div>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-outline text-[20px]">search</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages…"
              className="w-full bg-surface-container pl-10 pr-3 py-2.5 border border-outline-variant rounded-lg focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none font-body-sm text-body-sm placeholder:text-outline transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConvos ? (
            <div className="flex items-center justify-center p-xl">
              <LoadingSpinner size="md" text="Loading…" />
            </div>
          ) : filteredConvos.length === 0 ? (
            <div className="px-md py-xl text-center">
              <span className="material-symbols-outlined text-[42px] text-outline">forum</span>
              <p className="mt-sm font-body-md text-body-md text-on-surface">No conversations yet</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Start one by tapping the pencil icon above.
              </p>
            </div>
          ) : (
            filteredConvos.map((c) => {
              const active = c.partnerId === selectedPartnerId
              return (
                <button
                  key={c.partnerId}
                  onClick={() => {
                    setSearchParams({ to: c.partnerId })
                    setSelectedPartnerId(c.partnerId)
                  }}
                  className={cn(
                    'w-full text-left p-md border-b border-outline-variant transition-colors flex items-start gap-sm relative',
                    active
                      ? 'bg-surface-container-low border-l-[3px] border-l-primary-container'
                      : 'bg-surface hover:bg-surface-container-low'
                  )}
                >
                  <div className="relative">
                    <Avatar name={c.partner?.full_name} src={c.partner?.avatar_url} size="lg" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-xs">
                      <span className="font-label-lg text-label-lg text-on-surface truncate">
                        {c.partner?.full_name || 'Unknown'}
                      </span>
                      <span className={cn(
                        'font-label-md text-label-md flex-shrink-0',
                        c.unread > 0 ? 'text-primary' : 'text-outline'
                      )}>
                        {formatTimeShort(c.lastAt)}
                      </span>
                    </div>
                    <p className={cn(
                      'font-body-sm text-body-sm truncate',
                      c.unread > 0 ? 'text-on-surface' : 'text-on-surface-variant'
                    )}>
                      {c.lastFromMe ? 'You: ' : ''}{c.lastBody}
                    </p>
                    <span className="text-[11px] text-outline capitalize">{c.partner?.role}</span>
                  </div>
                  {c.unread > 0 && (
                    <div className="absolute top-md right-md flex items-center justify-center min-w-[20px] h-5 bg-primary-container text-on-primary-container rounded-full font-label-md text-[10px] font-bold px-1.5">
                      {c.unread}
                    </div>
                  )}
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* Right pane: chat */}
      <section className={cn(
        'flex-1 flex flex-col bg-surface-container-lowest relative',
        selectedPartnerId ? 'flex' : 'hidden md:flex'
      )}>
        {!selectedPartnerId ? (
          <div className="flex-1 flex items-center justify-center text-center px-md">
            <div>
              <span className="material-symbols-outlined text-[60px] text-outline">forum</span>
              <h3 className="font-headline-md text-headline-md text-on-surface mt-sm">Select a conversation</h3>
              <p className="font-body-md text-body-md text-on-surface-variant mt-2">
                Pick a chat from the left or start a new one.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="h-[72px] px-md border-b border-outline-variant flex items-center justify-between bg-surface-container-lowest">
              <div className="flex items-center gap-sm">
                <button
                  className="md:hidden p-2 -ml-2 rounded-full hover:bg-surface-container-low"
                  onClick={() => { setSelectedPartnerId(null); setSearchParams({}) }}
                  aria-label="Back"
                >
                  <span className="material-symbols-outlined text-on-surface">arrow_back</span>
                </button>
                <Avatar name={selectedPartner?.full_name} src={selectedPartner?.avatar_url} />
                <div>
                  <h3 className="font-label-lg text-label-lg text-on-surface leading-none">
                    {selectedPartner?.full_name || 'Conversation'}
                  </h3>
                  <span className="font-label-md text-label-md text-outline capitalize">
                    {selectedPartner?.role || 'User'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-md flex flex-col gap-md bg-surface-bright">
              {loadingMsgs && messages.length === 0 ? (
                <div className="flex items-center justify-center py-xl">
                  <LoadingSpinner size="md" text="Loading…" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-on-surface-variant py-xl">
                  <p className="font-body-md">No messages yet — say hello.</p>
                </div>
              ) : (
                groupedMessages.map((g) => {
                  if (g.type === 'divider') {
                    return (
                      <div key={g.key} className="flex justify-center my-sm">
                        <span className="bg-surface-container text-outline font-label-md text-label-md px-sm py-1 rounded border border-outline-variant">
                          {g.label}
                        </span>
                      </div>
                    )
                  }
                  const fromMe = g.sender_id === myId
                  return (
                    <div
                      key={g.key}
                      className={cn(
                        'flex items-end gap-sm max-w-[80%]',
                        fromMe ? 'self-end flex-row-reverse' : 'self-start'
                      )}
                    >
                      {!fromMe && (
                        <Avatar name={selectedPartner?.full_name} src={selectedPartner?.avatar_url} size="sm" />
                      )}
                      <div className={cn('flex flex-col gap-xs', fromMe ? 'items-end' : 'items-start')}>
                        <div className={cn(
                          'p-3 border whitespace-pre-wrap break-words font-body-sm text-body-sm shadow-[0_1px_2px_rgba(20,27,43,0.04)]',
                          fromMe
                            ? 'bg-primary-container text-on-primary-container border-primary-container rounded-tl-xl rounded-bl-xl rounded-tr-xl rounded-br-sm'
                            : 'bg-surface-container text-on-surface border-outline-variant rounded-tr-xl rounded-br-xl rounded-tl-xl rounded-bl-sm'
                        )}>
                          {g.body}
                        </div>
                        <div className={cn('flex items-center gap-xs px-1', fromMe ? 'flex-row-reverse' : '')}>
                          <span className="font-label-md text-label-md text-outline">
                            {format(new Date(g.created_at), 'h:mm a')}
                          </span>
                          {fromMe && (
                            <span
                              className={cn(
                                'material-symbols-outlined text-[14px]',
                                g.read_at ? 'text-primary-container' : 'text-outline'
                              )}
                              title={g.read_at ? `Read ${formatRelative(g.read_at)}` : 'Sent'}
                            >
                              {g.read_at ? 'done_all' : 'check'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <form
              onSubmit={handleSend}
              className="p-md border-t border-outline-variant bg-surface-container-lowest"
            >
              <div className="flex items-end gap-sm bg-surface-container-low border border-outline-variant rounded-lg p-2 focus-within:border-primary-container focus-within:ring-1 focus-within:ring-primary-container transition-shadow">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  rows={1}
                  placeholder="Type a message…"
                  className="flex-1 bg-transparent border-none focus:ring-0 outline-none resize-none max-h-32 min-h-[40px] py-1.5 px-2 font-body-sm text-body-sm text-on-surface placeholder:text-outline"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-lg text-label-lg flex items-center gap-2 hover:bg-primary-container hover:text-on-primary-container disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? 'Sending…' : 'Send'}
                  <span className="material-symbols-outlined text-[18px]">send</span>
                </button>
              </div>
              <p className="text-[11px] text-outline mt-1.5 ml-1">
                Press Enter to send, Shift + Enter for a new line.
              </p>
            </form>
          </>
        )}
      </section>

      {/* Compose dialog */}
      {showCompose && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowCompose(false)}
        >
          <div
            className="bg-surface-container-lowest rounded-xl border border-outline-variant w-full max-w-md p-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-md">
              <h3 className="font-headline-md text-headline-md text-on-surface">New Message</h3>
              <button
                onClick={() => setShowCompose(false)}
                className="p-1 rounded-full hover:bg-surface-container-low"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>
            <div className="relative mb-sm">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">search</span>
              <input
                autoFocus
                type="text"
                value={composeQuery}
                onChange={(e) => setComposeQuery(e.target.value)}
                placeholder="Search by name…"
                className="w-full bg-surface-container pl-10 pr-3 py-2.5 border border-outline-variant rounded-lg focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none font-body-sm"
              />
            </div>
            <div className="max-h-72 overflow-y-auto -mx-2">
              {composing ? (
                <div className="text-center py-md">
                  <LoadingSpinner size="sm" />
                </div>
              ) : composeResults.length === 0 ? (
                <p className="text-center text-on-surface-variant py-md font-body-sm">
                  {composeQuery.length < 2 ? 'Start typing a name…' : 'No matches'}
                </p>
              ) : (
                composeResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => startConversationWith(p)}
                    className="w-full text-left flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-container-low"
                  >
                    <Avatar name={p.full_name} src={p.avatar_url} />
                    <div className="flex-1 min-w-0">
                      <div className="font-label-lg text-label-lg text-on-surface truncate">{p.full_name}</div>
                      <div className="font-label-md text-label-md text-on-surface-variant capitalize">
                        {p.role}{p.company_name ? ` · ${p.company_name}` : ''}
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant text-[20px]">chevron_right</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Messages
