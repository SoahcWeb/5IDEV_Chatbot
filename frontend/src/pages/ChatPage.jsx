import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, getToken } from '../api/client.js'
import Sidebar from '../components/Sidebar.jsx'
import ConversationView from '../components/ConversationView.jsx'
import NewConversationModal from '../components/NewConversationModal.jsx'
import { useNotificationSocket } from '../useNotificationSocket.js'

export default function ChatPage() {
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [params, setParams] = useSearchParams()
  const [toast, setToast] = useState(null)
  const conversationsRef = useRef(conversations)
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const notificationPermissionRef = useRef(notificationPermission)

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.listConversations()
      const list = Array.isArray(data) ? data : data.results ?? []
      setConversations(list)
    } catch {
      /* ignore */
    }
  }, [])

  const { events: notificationEvents } = useNotificationSocket({
    token: getToken(),
    baseUrl: import.meta.env.VITE_WS_URL,
    onReconnect: loadConversations,
  })

  conversationsRef.current = conversations
  notificationPermissionRef.current = notificationPermission

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    const c = params.get('c')
    if (c) setActiveId(Number(c))
  }, [params])

  useEffect(() => {
    const event = notificationEvents.at(-1)
    if (!event?.message || !event.conversation) return

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === event.conversation
          ? {
              ...conversation,
              unread_count: event.unread_count,
              last_message: event.message,
            }
          : conversation,
      ),
    )

    const conversation = conversationsRef.current.find(
      (item) => item.id === event.conversation,
    )
    if (!conversation) return

    const title = conversation?.name || conversation?.title || `Conversation #${event.conversation}`
    setToast({
      id: event.message.id,
      conversationId: event.conversation,
      title,
      content: event.message.content,
    })

    if (
      notificationPermissionRef.current === 'granted' &&
      typeof Notification !== 'undefined'
    ) {
      new Notification(title, { body: event.message.content })
    }
  }, [notificationEvents])

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const handleSelect = (id) => {
    setActiveId(id)
    setParams({ c: String(id) })
  }

  const handleEnableNotifications = async () => {
    if (typeof Notification === 'undefined') return
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
  }

  const handleConversationRead = useCallback((event) => {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === event.conversation
          ? { ...conversation, unread_count: 0 }
          : conversation,
      ),
    )
  }, [])

  const active = conversations.find((c) => c.id === activeId)

  return (
    <div className={`chat-layout ${!active ? 'show-list' : ''}`}>
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelect}
        onNewConversation={() => setShowModal(true)}
        notificationPermission={notificationPermission}
        onEnableNotifications={handleEnableNotifications}
      />
      {active ? (
        <ConversationView
          conversation={active}
          onRead={handleConversationRead}
          onBack={() => {
            setActiveId(null)
            setParams({})
          }}
        />
      ) : (
        <div className="main">
          <div className="empty">Sélectionne une conversation ou crées-en une.</div>
        </div>
      )}
      {toast && (
        <button
          className="notification-toast"
          onClick={() => handleSelect(toast.conversationId)}
          type="button"
        >
          <strong>{toast.title}</strong>
          <span>{toast.content}</span>
        </button>
      )}
      {showModal && (
        <NewConversationModal
          onClose={() => setShowModal(false)}
          onCreate={(conv) => {
            setShowModal(false)
            setConversations((prev) => [conv, ...prev])
            handleSelect(conv.id)
          }}
        />
      )}
    </div>
  )
}