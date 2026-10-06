// ============================================================
//  API CLIENT — Django + DRF authtoken
//  Backend : http://127.0.0.1:8000
//  Routes  : /api/auth/* et /api/conversations/*
//  Header  : Authorization: Token xxx
// ============================================================

const API_URL = '/api'
const AUTH_PREFIX = '/auth'
const CONVERSATIONS_PREFIX = '/conversations'
const TIMEOUT_MS = 8000

// ---------- Token ----------
let token = localStorage.getItem('token')

export const setToken = (t) => {
  token = t
  if (t) localStorage.setItem('token', t)
}

export const getToken = () => token

export const clearToken = () => {
  token = null
  localStorage.removeItem('token')
}

// ---------- Requête générique ----------
async function request(path, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  const hasBody = options.body !== undefined

  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(hasBody && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Token ${token}` }),
        ...options.headers,
      },
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        `Le serveur Django ne répond pas (timeout ${TIMEOUT_MS / 1000}s).`
      )
    }
    throw new Error(
      "Impossible de joindre le serveur Django (127.0.0.1:8000)."
    )
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 204) return null

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    console.error('[API ERROR]', res.status, path, data)
    let message = data.message || data.detail
    if (!message && typeof data === 'object') {
      const first = Object.values(data).flat()[0]
      if (typeof first === 'string') message = first
    }
    throw new Error(message || `Erreur ${res.status}`)
  }
  return data
}

// ---------- Endpoints ----------
export const api = {
  // ----- Auth -----
  register: (payload) =>
    request(`${AUTH_PREFIX}/register/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: ({ username, password }) =>
    request(`${AUTH_PREFIX}/login/`, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  me: () => request(`${AUTH_PREFIX}/me/`),

  logout: () =>
    request(`${AUTH_PREFIX}/logout/`, { method: 'POST' }),

  users: () => request(`${AUTH_PREFIX}/users/`),

  // ----- Conversations -----
  createConversation: (payload) => {
    // Conversation privée (avec un user_id)
    if (payload.user_id !== undefined) {
      return request(`${CONVERSATIONS_PREFIX}/private/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    }
    // Conversation de groupe (avec name + member_ids)
    if (payload.name && payload.member_ids) {
      return request(`${CONVERSATIONS_PREFIX}/group/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    }
    throw new Error('Payload de conversation invalide')
  },
}
