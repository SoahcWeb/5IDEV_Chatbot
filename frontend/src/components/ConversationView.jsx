import { useEffect, useState, useCallback } from 'react'
import { api } from '../api/client.js'
import { useConversationSocket } from '../hooks/useConversationSocket.js'
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

  // ⚠️ Le hook est un stub : le 3ᵉ membre le remplira avec les WebSockets.
  // En attendant, on envoie en REST.
  const { sendMessage } = useConversationSocket(conversation.id, {
    onMessage: (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
    },
  })

  const handleSend = async (content) => {
    const sent = sendMessage?.(content)
    if (!sent) {
      try {
        const msg = await api.sendMessage(conversation.id, content)
        setMessages((prev) => [...prev, msg])
      } catch (e) {
        setError(e.message)
      }
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