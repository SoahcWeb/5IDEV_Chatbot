import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react'
import { api, setToken, clearToken, getToken } from '../api/client.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // ---------- Restauration de session ----------
  useEffect(() => {
    let cancelled = false

    const restore = async () => {
      if (!getToken()) {
        if (!cancelled) setLoading(false)
        return
      }
      try {
        const me = await api.me()
        if (!cancelled) setUser(me)
      } catch {
        clearToken()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    restore()
    return () => {
      cancelled = true
    }
  }, [])

  // ---------- Connexion ----------
  const login = useCallback(async (username, password) => {
    const data = await api.login({ username, password })
    if (!data.token) throw new Error('Aucun token reçu du serveur')

    setToken(data.token)
    const me = data.user ?? (await api.me())
    setUser(me)
    return me
  }, [])

  // ---------- Inscription (RegisterView renvoie déjà { token, user }) ----------
  const register = useCallback(async (payload) => {
    const data = await api.register(payload)
    if (!data.token) throw new Error('Aucun token reçu du serveur')

    setToken(data.token)
    const me = data.user ?? (await api.me())
    setUser(me)
    return me
  }, [])

  // ---------- Déconnexion ----------
  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      /* ignore */
    }
    clearToken()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return ctx
}