import { useState } from 'react'
import { api } from '../api/client.js'

export default function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({
    old_password: '',
    new_password: '',
    new_password_confirm: '',
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      await api.changePassword(form)
      setSuccess('Mot de passe modifié avec succès.')
      setForm({ old_password: '', new_password: '', new_password_confirm: '' })
      window.setTimeout(() => onClose(), 1200)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>Modifier mon mot de passe</h2>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            placeholder="Ancien mot de passe"
            value={form.old_password}
            onChange={(event) =>
              setForm((current) => ({ ...current, old_password: event.target.value }))
            }
            autoFocus
          />
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={form.new_password}
            onChange={(event) =>
              setForm((current) => ({ ...current, new_password: event.target.value }))
            }
          />
          <input
            type="password"
            placeholder="Confirmer le nouveau mot de passe"
            value={form.new_password_confirm}
            onChange={(event) =>
              setForm((current) => ({ ...current, new_password_confirm: event.target.value }))
            }
          />
          {error && <div className="error">{error}</div>}
          {success && (
            <div className="error" style={{ background: 'rgba(34,197,94,0.12)', color: '#86efac' }}>
              {success}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={loading}>
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
