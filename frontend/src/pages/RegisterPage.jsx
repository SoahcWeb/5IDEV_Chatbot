import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')

    if (username.trim().length < 3) {
      return setError("Le nom d'utilisateur doit faire au moins 3 caractères")
    }
    if (password.length < 8) {
      return setError('Le mot de passe doit faire au moins 8 caractères')
    }
    if (password !== confirm) {
      return setError('Les mots de passe ne correspondent pas')
    }

    setLoading(true)
    try {
      // ✅ Champs EXACTS attendus par RegisterSerializer
      await register({
        username: username.trim(),
        email: email.trim(),
        password,
        password_confirm: confirm,   // ⚠️ underscore, pas "confirm"
      })
      navigate('/app')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1>Créer un compte</h1>
        {error && <div className="error">{error}</div>}

        <input
          placeholder="Nom d'utilisateur"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Confirmer le mot de passe"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />

        <button className="btn" disabled={loading}>
          {loading ? 'Création…' : "S'inscrire"}
        </button>

        <div className="link">
          Déjà un compte ? <Link to="/login">Se connecter</Link>
        </div>
      </form>
    </div>
  )
}