import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function UserProfilePage() {
  const { user, refreshUser, logout } = useAuth()
  const navigate = useNavigate()

  const [emailForm, setEmailForm] = useState({
    email: user?.email || '',
    email_confirm: user?.email || '',
  })
  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    new_password_confirm: '',
  })

  const [emailError, setEmailError] = useState('')
  const [emailSuccess, setEmailSuccess] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [deleteError, setDeleteError] = useState('')

  const [emailLoading, setEmailLoading] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Modale de confirmation
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // ---------- Email ----------
  const submitEmail = async (event) => {
    event.preventDefault()
    setEmailError('')
    setEmailSuccess('')

    const email = emailForm.email.trim()
    const confirm = emailForm.email_confirm.trim()

    if (!email) return setEmailError('Renseigne une adresse e-mail.')
    if (email !== confirm) return setEmailError('Les adresses e-mail ne correspondent pas.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setEmailError('Adresse e-mail invalide.')
    }
    if (email === user?.email) {
      return setEmailError('Cette adresse est déjà la tienne.')
    }

    setEmailLoading(true)
    try {
      await api.changeEmail({ email, email_confirm: confirm })
      const refreshedUser = await refreshUser?.()
      const nextEmail = refreshedUser?.email || email
      setEmailSuccess('Adresse e-mail modifiée avec succès.')
      setEmailForm({ email: nextEmail, email_confirm: nextEmail })
    } catch (err) {
      setEmailError(err.message)
    } finally {
      setEmailLoading(false)
    }
  }

  // ---------- Mot de passe ----------
  const submitPassword = async (event) => {
    event.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    const { old_password, new_password, new_password_confirm } = passwordForm

    if (!old_password || !new_password || !new_password_confirm) {
      return setPasswordError('Remplis tous les champs.')
    }
    if (new_password.length < 8) {
      return setPasswordError('Le nouveau mot de passe doit faire au moins 8 caractères.')
    }
    if (new_password !== new_password_confirm) {
      return setPasswordError('Les mots de passe ne correspondent pas.')
    }
    if (new_password === old_password) {
      return setPasswordError('Le nouveau mot de passe doit être différent de l’ancien.')
    }

    setPasswordLoading(true)
    try {
      await api.changePassword({
        old_password,
        new_password,
        new_password_confirm,
      })
      setPasswordSuccess('Mot de passe modifié avec succès.')
      setPasswordForm({ old_password: '', new_password: '', new_password_confirm: '' })
    } catch (err) {
      setPasswordError(err.message)
    } finally {
      setPasswordLoading(false)
    }
  }

  // ---------- Suppression du compte ----------
  const openDeleteModal = () => {
    setDeleteError('')
    setDeleteConfirmText('')
    setShowDeleteModal(true)
  }

  const closeDeleteModal = () => {
    setShowDeleteModal(false)
    setDeleteConfirmText('')
    setDeleteError('')
  }

  const handleDeleteAccount = async () => {
    setDeleteError('')

    if (deleteConfirmText !== user?.username) {
      return setDeleteError(
        `Tape exactement ton nom d'utilisateur (${user?.username}) pour confirmer.`
      )
    }

    setDeleteLoading(true)
    try {
      await api.deleteAccount()
      // Nettoyer la session côté client
      await logout?.()
      navigate('/login', { replace: true })
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleLogout = async () => {
    await logout?.()
    navigate('/login')
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card profile-card">
        {/* Header */}
        <div className="profile-header">
          <h1>Mon profil</h1>
          <Link className="btn btn-ghost" to="/app">
            ← Retour
          </Link>
        </div>

        {/* Info utilisateur */}
        <div className="profile-info">
          <div className="profile-info-label">Utilisateur</div>
          <div className="profile-info-username">{user?.username}</div>
          <div className="profile-info-email">
            {user?.email || 'Aucun email renseigné'}
          </div>
        </div>

        {/* ---------- Email ---------- */}
        <form onSubmit={submitEmail} className="profile-form">
          <h2>Modifier mon adresse e-mail</h2>

          <input
            type="email"
            placeholder="Nouvelle adresse e-mail"
            value={emailForm.email}
            onChange={(e) =>
              setEmailForm((c) => ({ ...c, email: e.target.value }))
            }
            autoComplete="email"
            required
            disabled={emailLoading}
          />
          <input
            type="email"
            placeholder="Confirmer l'adresse e-mail"
            value={emailForm.email_confirm}
            onChange={(e) =>
              setEmailForm((c) => ({ ...c, email_confirm: e.target.value }))
            }
            autoComplete="email"
            required
            disabled={emailLoading}
          />

          {emailError && <div className="error">{emailError}</div>}
          {emailSuccess && <div className="success">{emailSuccess}</div>}

          <button className="btn" type="submit" disabled={emailLoading}>
            {emailLoading ? 'Enregistrement…' : 'Modifier mon e-mail'}
          </button>
        </form>

        {/* ---------- Mot de passe ---------- */}
        <form onSubmit={submitPassword} className="profile-form">
          <h2>Modifier mon mot de passe</h2>

          <input
            type="password"
            placeholder="Ancien mot de passe"
            value={passwordForm.old_password}
            onChange={(e) =>
              setPasswordForm((c) => ({ ...c, old_password: e.target.value }))
            }
            autoComplete="current-password"
            required
            disabled={passwordLoading}
          />
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={passwordForm.new_password}
            onChange={(e) =>
              setPasswordForm((c) => ({ ...c, new_password: e.target.value }))
            }
            autoComplete="new-password"
            minLength={8}
            required
            disabled={passwordLoading}
          />
          <input
            type="password"
            placeholder="Confirmer le nouveau mot de passe"
            value={passwordForm.new_password_confirm}
            onChange={(e) =>
              setPasswordForm((c) => ({
                ...c,
                new_password_confirm: e.target.value,
              }))
            }
            autoComplete="new-password"
            minLength={8}
            required
            disabled={passwordLoading}
          />

          {passwordError && <div className="error">{passwordError}</div>}
          {passwordSuccess && <div className="success">{passwordSuccess}</div>}

          <button className="btn" type="submit" disabled={passwordLoading}>
            {passwordLoading ? 'Modification…' : 'Modifier mon mot de passe'}
          </button>
        </form>

        {/* ---------- Session ---------- */}
        <div className="profile-form">
          <h2>Session</h2>
          <button className="btn btn-ghost" type="button" onClick={handleLogout}>
            Se déconnecter
          </button>
        </div>

        {/* ---------- Zone dangereuse ---------- */}
        <div className="profile-form profile-danger-zone">
          <h2 style={{ color: 'var(--danger)' }}>Zone dangereuse</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            La suppression du compte est définitive. Toutes tes conversations et
            messages seront perdus. Cette action est irréversible.
          </p>
          <button
            className="btn btn-danger"
            type="button"
            onClick={openDeleteModal}
          >
            🗑 Supprimer mon compte
          </button>
        </div>
      </div>

      {/* ---------- Modale de confirmation ---------- */}
      {showDeleteModal && (
        <div className="modal-backdrop" onClick={closeDeleteModal}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="delete-modal-title"
          >
            <h2 id="delete-modal-title" style={{ color: 'var(--danger)' }}>
              Supprimer définitivement mon compte
            </h2>

            <p style={{ fontSize: 14, color: 'var(--muted)' }}>
              Cette action est <strong>irréversible</strong>. Toutes tes données
              (conversations, messages, profil) seront supprimées.
            </p>

            <p style={{ fontSize: 14 }}>
              Pour confirmer, tape ton nom d'utilisateur&nbsp;:
              <br />
              <code
                style={{
                  background: '#263449',
                  padding: '2px 6px',
                  borderRadius: 4,
                  marginTop: 6,
                  display: 'inline-block',
                }}
              >
                {user?.username}
              </code>
            </p>

            <input
              type="text"
              placeholder={`Tape "${user?.username}" pour confirmer`}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              autoFocus
              disabled={deleteLoading}
            />

            {deleteError && <div className="error">{deleteError}</div>}

            <div
              style={{
                display: 'flex',
                gap: 8,
                justifyContent: 'flex-end',
                marginTop: 8,
              }}
            >
              <button
                className="btn btn-ghost"
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteLoading}
              >
                Annuler
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={handleDeleteAccount}
                disabled={
                  deleteLoading || deleteConfirmText !== user?.username
                }
              >
                {deleteLoading ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}