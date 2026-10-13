import { useEffect, useState, useCallback } from 'react'
import { api, getToken } from '../api/client.js'
import { useConversationSocket } from '../useConversationSocket.js'
import { useAuth } from '../context/AuthContext.jsx'
import MessageList from './MessageList.jsx'
import MessageInput from './MessageInput.jsx'

export default function ConversationView({ conversation, onBack, onRead }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [membersOpen, setMembersOpen] = useState(false)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [allUsers, setAllUsers] = useState([])
  const [membersLocal, setMembersLocal] = useState(conversation.members ?? [])

  // ---------- Récupération des messages (REST) ----------
  const reload = useCallback(async () => {
    setLoading(true)
    setMessages([])             // ⚠️ Vide AVANT le fetch (évite le mélange visuel)
    setError('')
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

  // Reset global + reload quand on change de conversation
  useEffect(() => {
    setMembersOpen(false)
    setAddMemberOpen(false)
    setMembersLocal(conversation.members ?? [])
    setError('')
    reload()
  }, [conversation.id, reload])

  // ---------- WebSocket ----------
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

  // ---------- Fusion des messages WS (FILTRÉE par conversation) ----------
  useEffect(() => {
    if (socketMessages.length === 0) return

    setMessages((current) => {
      // 🔒 Filtre strict : on ne garde QUE les messages de cette conversation
      const fromThisConv = socketMessages.filter(
        (m) => Number(m.conversation) === Number(conversation.id),
      )
      if (fromThisConv.length === 0) return current

      const incomingById = new Map(fromThisConv.map((m) => [m.id, m]))
      const merged = current.map((m) =>
        incomingById.has(m.id) ? { ...m, ...incomingById.get(m.id) } : m,
      )
      const currentIds = new Set(current.map((m) => m.id))
      const newMessages = fromThisConv.filter((m) => !currentIds.has(m.id))

      return newMessages.length > 0 ? [...merged, ...newMessages] : merged
    })
  }, [socketMessages, conversation.id])   // ← dépendance conversation.id

  // ---------- Marquage "lu" ----------
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

    let wasFocused = document.hasFocus() && document.visibilityState === 'visible'
    const markReadWhenFocused = () => {
      const isFocused = document.hasFocus() && document.visibilityState === 'visible'
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

  // Fallback REST : marquer comme lu à l'ouverture
  useEffect(() => {
    api.markRead(conversation.id).catch(() => {})
  }, [conversation.id])

  // ---------- Envoi ----------
  const handleSend = async (content) => {
    try {
      sendMessage(content)
    } catch (e) {
      setError(e.message)
    }
  }

  // ---------- Édition (route PLATE) ----------
  const handleEdit = async (msgId, content) => {
    try {
      const updated = await api.editMessage(msgId, content)
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, ...updated } : m)),
      )
    } catch (e) {
      setError(e.message)
    }
  }

  // ---------- Suppression (route PLATE) ----------
  const handleDelete = async (msgId) => {
    try {
      await api.deleteMessage(msgId)
      setMessages((prev) => prev.filter((m) => m.id !== msgId))
    } catch (e) {
      setError(e.message)
    }
  }

  // ---------- Membres ----------
  const isAdmin = membersLocal.find((m) => m.user === user?.id)?.role === 'admin'

  const openAddMember = async () => {
    setAddMemberOpen(true)
    try {
      const data = await api.listUsers()
      const list = Array.isArray(data) ? data : data.results ?? []
      const memberIds = new Set(membersLocal.map((m) => m.user))
      setAllUsers(list.filter((u) => !memberIds.has(u.id)))
    } catch (e) {
      setError(e.message)
    }
  }

  const handleAddMember = async (userId) => {
    try {
      await api.addMember(conversation.id, userId)
      const fresh = await api.getConversation(conversation.id)
      setMembersLocal(fresh.members ?? [])
      setAddMemberOpen(false)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleRemoveMember = async (userId) => {
    if (!confirm('Retirer ce membre du groupe ?')) return
    try {
      await api.removeMember(conversation.id, userId)
      setMembersLocal((prev) => prev.filter((m) => m.user !== userId))
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
        <button className="btn btn-ghost back" onClick={onBack} aria-label="Retour">
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div className="title">{title}</div>
          <div className="sub">
            {isGroup && membersLocal.length > 0
              ? `${membersLocal.length} membre(s)`
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
              {membersLocal.map((member) => (
                <li key={member.id}>
                  <span>{member.username}</span>
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>
                    {member.role === 'admin' ? '👑' : ''}
                  </span>
                  {isAdmin && member.user !== user?.id && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '2px 6px', fontSize: 11, marginLeft: 8 }}
                      onClick={() => handleRemoveMember(member.user)}
                      aria-label={`Retirer ${member.username}`}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {isAdmin && (
              <button className="btn" onClick={openAddMember} style={{ marginTop: 8 }}>
                + Ajouter un membre
              </button>
            )}
          </aside>
        )}
      </div>

      {/* ---------- Modale : ajouter un membre ---------- */}
      {addMemberOpen && (
        <div className="modal-backdrop" onClick={() => setAddMemberOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Ajouter un membre</h2>

            {allUsers.length === 0 ? (
              <div className="empty">Aucun utilisateur disponible.</div>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {allUsers.map((u) => (
                  <button
                    key={u.id}
                    className="member-row"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleAddMember(u.id)}
                  >
                    {u.username}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={() => setAddMemberOpen(false)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}