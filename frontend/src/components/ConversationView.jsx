import { useEffect, useState, useCallback } from 'react'
import { api, getToken } from '../api/client.js'
import { useConversationSocket } from '../useConversationSocket.js'
import MessageList from './MessageList.jsx'
import MessageInput from './MessageInput.jsx'

export default function ConversationView({ conversation, onBack }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
    if (socketStatus === 'open') markConversationRead()
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
      </div>
      {error && <div className="empty">{error}</div>}
      <MessageList
        messages={messages}
        loading={loading}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
      <MessageInput onSend={handleSend} />
    </div>
  )
}