import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function UserProfilePage() {
  const { user } = useAuth()
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
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h1>Mon profil</h1>
          <Link className="btn btn-ghost" to="/app" style={{ padding: '8px 12px' }}>
            Retour
          </Link>
        </div>

        <div style={{ background: '#263449', borderRadius: 10, padding: 12 }}>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>Utilisateur</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{user?.username}</div>
          <div style={{ color: '#cbd5e1' }}>{user?.email || 'Aucun email renseigné'}</div>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ fontSize: 18 }}>Modifier mon mot de passe</h2>
          <input
            type="password"
            placeholder="Ancien mot de passe"
            value={form.old_password}
            onChange={(event) => setForm((current) => ({ ...current, old_password: event.target.value }))}
          />
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={form.new_password}
            onChange={(event) => setForm((current) => ({ ...current, new_password: event.target.value }))}
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
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Modification…' : 'Modifier mon mot de passe'}
          </button>
        </form>
      </div>
    </div>
  )
}
