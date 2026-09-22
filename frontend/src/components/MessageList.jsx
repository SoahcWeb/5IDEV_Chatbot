import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function MessageList({ messages, onEdit, onDelete, loading }) {
  const { user } = useAuth()
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  if (loading) return <div className="empty">Chargement des messages…</div>
  if (!messages.length)
    return <div className="empty">Aucun message. Dis bonjour !</div>

  return (
    <div className="messages">
      {messages.map((m) => {
        const mine = m.author?.id === user?.id || m.author === user?.id
        return (
          <div key={m.id} className={`msg ${mine ? 'mine' : ''}`}>
            {!mine && (
              <div className="meta">
                <strong>{m.author?.username ?? m.author_name ?? 'User'}</strong>
              </div>
            )}
            <div>
              {m.content}
              {m.edited && <span className="edited"> (modifié)</span>}
            </div>
            {mine && (
              <div className="actions">
                <button
                  onClick={() => {
                    const next = prompt('Modifier :', m.content)
                    if (next && next !== m.content) onEdit(m.id, next)
                  }}
                >
                  éditer
                </button>
                <button
                  onClick={() => {
                    if (confirm('Supprimer ce message ?')) onDelete(m.id)
                  }}
                >
                  supprimer
                </button>
              </div>
            )}
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}