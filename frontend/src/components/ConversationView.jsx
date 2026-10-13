import { useEffect, useState, useCallback, useRef } from 'react'
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

  const deletedIdsRef = useRef(new Set())

  // ---------- Récupération des messages (REST) ----------
  const reload = useCallback(async () => {
    setLoading(true)
    setMessages([])
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

  useEffect(() => {
    deletedIdsRef.current = new Set()
    setMembersOpen(false)
    setAddMemberOpen(false)
    setMembersLocal(conversation.members ?? [])
    setError('')
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id])

  // ---------- WebSocket ----------
  const {
    status: socketStatus,
    messages: socketMessages,
    events: socketEvents,
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

  // Fusion des messages WS (filtrée par conv + supprimés)
  useEffect(() => {
    if (socketMessages.length === 0) return
    setMessages((current) => {
      const fromThisConv = socketMessages.filter(
        (m) =>
          Number(m.conversation) === Number(conversation.id) &&
          !deletedIdsRef.current.has(m.id),
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
  }, [socketMessages, conversation.id])

  // Traitement des événements WS (deleted / updated)
  useEffect(() => {
    if (!socketEvents || socketEvents.length === 0) return
    socketEvents.forEach((ev) => {
      if (ev.type === 'deleted') {
        deletedIdsRef.current.add(ev.messageId)
        setMessages((prev) => prev.filter((m) => m.id !== ev.messageId))
      } else if (ev.type === 'updated' && ev.message) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === ev.message.id ? { ...m, ...ev.message } : m,
          ),
        )
      }
    })
  }, [socketEvents])

  // ---------- Marquage "lu" (focus window) ----------
  useEffect(() => {
    if (socketStatus !== 'open') return undefined

    const handleFocus = () => {
      if (
        document.hasFocus() &&
        document.visibilityState === 'visible'
      ) {
        markConversationRead?.()
      }
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleFocus)
    document.addEventListener('visibilitychange', handleFocus)

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleFocus)
      document.removeEventListener('visibilitychange', handleFocus)
    }
  }, [markConversationRead, socketStatus])

  // Marquage "lu" quand on reçoit un message
  useEffect(() => {
    if (
      socketMessages.length === 0 ||
      !document.hasFocus() ||
      document.visibilityState !== 'visible'
    ) return
    markConversationRead?.()
  }, [markConversationRead, socketMessages])

  // Erreur WebSocket
  useEffect(() => {
    if (socketError) setError(socketError.detail || 'Erreur WebSocket')
  }, [socketError])

  // ---------- Envoi ----------
  const handleSend = async (content) => {
    try {
      sendMessage(content)
    } catch (e) {
      setError(e.message)
    }
  }

  // ---------- Édition (retrait optimiste) ----------
  const handleEdit = async (msgId, content) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, content } : m)),
    )

    try {
      if (typeof api.editMessage !== 'function') {
        throw new Error("Fonction d'édition indisponible.")
      }
      const updated = await api.editMessage(msgId, content)
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, ...updated } : m)),
      )
    } catch (e) {
      if (e.status === 404) {
        deletedIdsRef.current.add(msgId)
        setMessages((prev) => prev.filter((m) => m.id !== msgId))
        return
      }
      setError(e.message)
      reload()
    }
  }

  // ---------- Suppression (retrait optimiste) ----------
  const handleDelete = async (msgId) => {
    deletedIdsRef.current.add(msgId)
    setMessages((prev) => prev.filter((m) => m.id !== msgId))

    try {
      if (typeof api.deleteMessage !== 'function') {
        throw new Error('Fonction de suppression indisponible.')
      }
      await api.deleteMessage(msgId)
    } catch (e) {
      if (e.status === 404) return
      setError(e.message)
      reload()
    }
  }

  // ---------- Membres ----------
  const isAdmin =
    membersLocal.find((m) => m.user === user?.id)?.role === 'admin'

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
    conversation.name ||
    conversation.title ||
    `Conversation #${conversation.id}`
  const isGroup = conversation.type === 'group'

  return (
    <div className="main">
      <div className="chat-header">
        <button
          className="btn btn-ghost back"
          onClick={onBack}
          aria-label="Retour"
        >
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
            aria-label={
              membersOpen ? 'Masquer les membres' : 'Afficher les membres'
            }
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
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 12,
                      color: 'var(--muted)',
                    }}
                  >
                    {member.role === 'admin' ? '👑' : ''}
                  </span>
                  {isAdmin && member.user !== user?.id && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{
                        padding: '2px 6px',
                        fontSize: 11,
                        marginLeft: 8,
                      }}
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
              <button
                className="btn"
                onClick={openAddMember}
                style={{ marginTop: 8 }}
              >
                + Ajouter un membre
              </button>
            )}
          </aside>
        )}
      </div>

      {addMemberOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setAddMemberOpen(false)}
        >
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

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: 8,
              }}
            >
              <button
                className="btn btn-ghost"
                onClick={() => setAddMemberOpen(false)}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}