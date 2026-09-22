const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
const TOKEN_KEY = 'auth_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Token ${token}`
  }
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg =
      data?.detail ||
      data?.error ||
      (data && Object.values(data).flat().join(' ')) ||
      `Erreur ${res.status}`
    throw new Error(msg)
  }
  return data
}

export const api = {
  // Auth
  register: (payload) =>
    request('/auth/register/', { method: 'POST', body: payload, auth: false }),
  login: (payload) =>
    request('/auth/login/', { method: 'POST', body: payload, auth: false }),
  me: () => request('/auth/me/'),
  logout: () => request('/auth/logout/', { method: 'POST' }),

  // Users
  listUsers: () => request('/auth/users/'),

  // Conversations
  listConversations: () => request('/conversations/'),
  createConversation: (payload) =>
    request('/conversations/', { method: 'POST', body: payload }),
  getConversation: (id) => request(`/conversations/${id}/`),
  addMember: (id, userId) =>
    request(`/conversations/${id}/members/`, {
      method: 'POST',
      body: { user_id: userId },
    }),
  removeMember: (id, userId) =>
    request(`/conversations/${id}/members/${userId}/`, { method: 'DELETE' }),

  // Messages
  listMessages: (convId, page = 1) =>
    request(`/conversations/${convId}/messages/?page=${page}`),
  sendMessage: (convId, content) =>
    request(`/conversations/${convId}/messages/`, {
      method: 'POST',
      body: { content },
    }),
  editMessage: (convId, msgId, content) =>
    request(`/conversations/${convId}/messages/${msgId}/`, {
      method: 'PATCH',
      body: { content },
    }),
  deleteMessage: (convId, msgId) =>
    request(`/conversations/${convId}/messages/${msgId}/`, {
      method: 'DELETE',
    }),
}