import { useEffect, useState, useCallback } from 'react'
import { api, getToken } from '../api/client.js'
import { useConversationSocket } from '../useConversationSocket.js'
import MessageList from './MessageList.jsx'
import MessageInput from './MessageInput.jsx'

export default function ConversationView({ conversation, onBack, onRead }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [membersOpen, setMembersOpen] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listMessages(conversation.id)
      const list = Array.isArray(data) ? data : data.results ?? []
      setMessages(list)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [conversation.id])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    setMembersOpen(false)
  }, [conversation.id])

  const {
    status: socketStatus,
    messages: socketMessages,
    error: socketError,
    sendMessage,
    markConversationRead,
  } = useConversationSocket({
    conversationId: conversation.id,
    token: getToken(),
    baseUrl: import.meta.env.VITE_WS_URL,
    onRead,
    onReconnect: reload,
  })

  useEffect(() => {
    if (socketMessages.length === 0) return

    setMessages((current) => {
      const incomingById = new Map(
        socketMessages.map((message) => [message.id, message])
      )
      const merged = current.map((message) =>
        incomingById.has(message.id)
          ? { ...message, ...incomingById.get(message.id) }
          : message
      )
      const currentIds = new Set(current.map((message) => message.id))
      const newMessages = socketMessages.filter(
        (message) => !currentIds.has(message.id)
      )

      return newMessages.length > 0
        ? [...merged, ...newMessages]
        : merged
    })
  }, [socketMessages])

  useEffect(() => {
    if (
      socketMessages.length === 0 ||
      !document.hasFocus() ||
      document.visibilityState !== 'visible'
    ) return
    markConversationRead()
  }, [markConversationRead, socketMessages])

  useEffect(() => {
    if (
      socketStatus === 'open' &&
      document.hasFocus() &&
      document.visibilityState === 'visible'
    ) {
      markConversationRead()
    }
  }, [markConversationRead, socketStatus])

  useEffect(() => {
    if (socketStatus !== 'open') return undefined

    let wasFocused =
      document.hasFocus() && document.visibilityState === 'visible'
    const markReadWhenFocused = () => {
      const isFocused =
        document.hasFocus() && document.visibilityState === 'visible'
      if (!isFocused) {
        wasFocused = false
        return
      }
      if (wasFocused) return

      wasFocused = true
      markConversationRead()
    }

    window.addEventListener('focus', markReadWhenFocused)
    window.addEventListener('blur', markReadWhenFocused)
    document.addEventListener('visibilitychange', markReadWhenFocused)
    return () => {
      window.removeEventListener('focus', markReadWhenFocused)
      window.removeEventListener('blur', markReadWhenFocused)
      document.removeEventListener('visibilitychange', markReadWhenFocused)
    }
  }, [markConversationRead, socketStatus])

  useEffect(() => {
    if (socketError) setError(socketError.detail || 'Erreur WebSocket')
  }, [socketError])

  const handleSend = async (content) => {
    try {
      sendMessage(content)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleEdit = async (msgId, content) => {
    try {
      const updated = await api.editMessage(conversation.id, msgId, content)
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, ...updated } : m))
      )
    } catch (e) {
      setError(e.message)
    }
  }

  const handleDelete = async (msgId) => {
    try {
      await api.deleteMessage(conversation.id, msgId)
      setMessages((prev) => prev.filter((m) => m.id !== msgId))
    } catch (e) {
      setError(e.message)
    }
  }

  const title =
    conversation.name || conversation.title || `Conversation #${conversation.id}`
  const isGroup = conversation.type === 'group'

  return (
    <div className="main">
      <div className="chat-header">
        <button className="btn btn-ghost back" onClick={onBack}>
          ←
        </button>
        <div>
          <div className="title">{title}</div>
          <div className="sub">
            {conversation.members?.length
              ? `${conversation.members.length} membre(s)`
              : ''}
          </div>
        </div>
        {isGroup && (
          <button
            className="btn btn-ghost member-toggle"
            type="button"
            aria-controls="conversation-members"
            aria-expanded={membersOpen}
            aria-label={membersOpen ? 'Masquer les membres' : 'Afficher les membres'}
            onClick={() => setMembersOpen((open) => !open)}
          >
            Membres
          </button>
        )}
      </div>
      <div className="conversation-content">
        <section className="conversation-thread" aria-label="Conversation">
          {error && <div className="empty">{error}</div>}
          <MessageList
            messages={messages}
            loading={loading}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
          <MessageInput onSend={handleSend} />
        </section>
        {isGroup && (
          <aside
            id="conversation-members"
            className={`group-members ${membersOpen ? 'is-open' : ''}`}
            aria-labelledby="conversation-members-title"
          >
            <h2 id="conversation-members-title">Membres du groupe</h2>
            <ul>
              {(conversation.members ?? []).map((member) => (
                <li key={member.id}>{member.username}</li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  )
}