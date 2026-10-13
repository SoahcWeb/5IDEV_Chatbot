import { useEffect, useState } from 'react'
import { api } from '../api/client.js'

export default function NewConversationModal({ onClose, onCreate }) {
  const [users, setUsers] = useState([])
  const [selected, setSelected] = useState([])
  const [name, setName] = useState('')
  const [isGroup, setIsGroup] = useState(false)
  const [error, setError] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .listUsers()
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : data.results ?? []
        setUsers(list)
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoadingUsers(false) })
    return () => { cancelled = true }
  }, [])

  const toggle = (id) => {
    setSelected((current) => {
      if (isGroup) {
        return current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id]
      }
      return current.includes(id) ? [] : [id]
    })
  }

  const switchMode = (group) => {
    setIsGroup(group)
    setSelected([])
    setName('')
    setError('')
  }

  const submit = async () => {
    setError('')

    if (isGroup) {
      if (!name.trim()) return setError('Donne un nom au groupe.')
      if (selected.length === 0) return setError('Sélectionne au moins un membre.')
    } else {
      if (selected.length !== 1) return setError('Sélectionne exactement un utilisateur.')
    }

    setSubmitting(true)
    try {
      const conv = isGroup
        ? await api.createGroupConversation(name.trim(), selected)
        : await api.createPrivateConversation(selected[0])
      onCreate(conv)
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nouvelle conversation</h2>

        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="radio"
              name="conversation-type"
              checked={!isGroup}
              onChange={() => switchMode(false)}
            />
            Privée
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="radio"
              name="conversation-type"
              checked={isGroup}
              onChange={() => switchMode(true)}
            />
            Groupe
          </label>
        </div>

        {isGroup && (
          <input
            placeholder="Nom du groupe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        )}

        {loadingUsers ? (
          <div className="empty">Chargement des utilisateurs…</div>
        ) : users.length === 0 ? (
          <div className="empty">Aucun utilisateur disponible.</div>
        ) : (
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {users.map((u) => (
              <label key={u.id} className="member-row">
                <input
                  type={isGroup ? 'checkbox' : 'radio'}
                  name={isGroup ? undefined : 'private-user'}
                  checked={selected.includes(u.id)}
                  onChange={() => toggle(u.id)}
                />
                {u.username}
              </label>
            ))}
          </div>
        )}

        {error && <div className="error">{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Annuler
          </button>
          <button
            className="btn"
            onClick={submit}
            disabled={submitting || loadingUsers}
          >
            {submitting ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}