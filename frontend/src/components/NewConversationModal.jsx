import { useEffect, useState } from 'react'
import { api } from '../api/client.js'

export default function NewConversationModal({ onClose, onCreate }) {
  const [users, setUsers] = useState([])
  const [selected, setSelected] = useState([])
  const [name, setName] = useState('')
  const [isGroup, setIsGroup] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.listUsers().then(setUsers).catch((e) => setError(e.message))
  }, [])

  const toggle = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const submit = async () => {
    setError('')
    if (!selected.length) return setError('Sélectionne au moins un utilisateur')
    try {
      const payload = isGroup
        ? { name, is_group: true, members: selected }
        : { is_group: false, members: selected }
      const conv = await api.createConversation(payload)
      onCreate(conv)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nouvelle conversation</h2>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={isGroup}
            onChange={(e) => setIsGroup(e.target.checked)}
          />
          Groupe
        </label>
        {isGroup && (
          <input
            placeholder="Nom du groupe"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
          {users.map((u) => (
            <label key={u.id} className="member-row">
              <input
                type="checkbox"
                checked={selected.includes(u.id)}
                onChange={() => toggle(u.id)}
              />
              {u.username}
            </label>
          ))}
        </div>
        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn" onClick={submit}>
            Créer
          </button>
        </div>
      </div>
    </div>
  )
}