import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function UserProfilePage() {
  const { user, refreshUser } = useAuth()
  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    new_password_confirm: '',
  })
  const [emailForm, setEmailForm] = useState({
    email: user?.email || '',
    email_confirm: user?.email || '',
  })
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [emailError, setEmailError] = useState('')
  const [emailSuccess, setEmailSuccess] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)

  const submitPassword = async (event) => {
    event.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')
    setPasswordLoading(true)

    try {
      await api.changePassword(passwordForm)
      setPasswordSuccess('Mot de passe modifié avec succès.')
      setPasswordForm({ old_password: '', new_password: '', new_password_confirm: '' })
    } catch (err) {
      setPasswordError(err.message)
    } finally {
      setPasswordLoading(false)
    }
  }

  const submitEmail = async (event) => {
    event.preventDefault()
    setEmailError('')
    setEmailSuccess('')
    setEmailLoading(true)

    try {
      await api.changeEmail(emailForm)
      const refreshedUser = await refreshUser()
      const nextEmail = refreshedUser?.email || emailForm.email
      setEmailSuccess('Adresse e-mail modifiée avec succès.')
      setEmailForm({
        email: nextEmail,
        email_confirm: nextEmail,
      })
    } catch (err) {
      setEmailError(err.message)
    } finally {
      setEmailLoading(false)
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

        <form onSubmit={submitEmail} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ fontSize: 18 }}>Modifier mon adresse e-mail</h2>
          <input
            type="email"
            placeholder="Nouvelle adresse e-mail"
            value={emailForm.email}
            onChange={(event) =>
              setEmailForm((current) => ({ ...current, email: event.target.value }))
            }
          />
          <input
            type="email"
            placeholder="Confirmer l'adresse e-mail"
            value={emailForm.email_confirm}
            onChange={(event) =>
              setEmailForm((current) => ({ ...current, email_confirm: event.target.value }))
            }
          />
          {emailError && <div className="error">{emailError}</div>}
          {emailSuccess && (
            <div className="error" style={{ background: 'rgba(34,197,94,0.12)', color: '#86efac' }}>
              {emailSuccess}
            </div>
          )}
          <button className="btn" type="submit" disabled={emailLoading}>
            {emailLoading ? 'Enregistrement…' : 'Modifier mon e-mail'}
          </button>
        </form>

        <form onSubmit={submitPassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ fontSize: 18 }}>Modifier mon mot de passe</h2>
          <input
            type="password"
            placeholder="Ancien mot de passe"
            value={passwordForm.old_password}
            onChange={(event) =>
              setPasswordForm((current) => ({ ...current, old_password: event.target.value }))
            }
          />
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={passwordForm.new_password}
            onChange={(event) =>
              setPasswordForm((current) => ({ ...current, new_password: event.target.value }))
            }
          />
          <input
            type="password"
            placeholder="Confirmer le nouveau mot de passe"
            value={passwordForm.new_password_confirm}
            onChange={(event) =>
              setPasswordForm((current) => ({ ...current, new_password_confirm: event.target.value }))
            }
          />
          {passwordError && <div className="error">{passwordError}</div>}
          {passwordSuccess && (
            <div className="error" style={{ background: 'rgba(34,197,94,0.12)', color: '#86efac' }}>
              {passwordSuccess}
            </div>
          )}
          <button className="btn" type="submit" disabled={passwordLoading}>
            {passwordLoading ? 'Modification…' : 'Modifier mon mot de passe'}
          </button>
        </form>
      </div>
    </div>
  )
}
