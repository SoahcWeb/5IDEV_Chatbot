// ============================================================
//  API CLIENT — Django + DRF authtoken
//  Header : Authorization: Token xxx
//  Clé localStorage : "auth_token"
// ============================================================

const API_URL = import.meta.env.VITE_API_URL || "/api";

const TOKEN_KEY = "auth_token";
const TIMEOUT_MS = 8000;

// ---------- Token ----------
export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setToken = (t) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
};

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

// ---------- Requête générique ----------
async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };

  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Token ${token}`;
  }

  const options = { method, headers };

  if (body && method !== "GET" && method !== "HEAD") {
    options.body = JSON.stringify(body);
  }

  // Timeout pour ne jamais bloquer indéfiniment
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  options.signal = controller.signal;

  const url = `${API_URL}${path}`;
  console.log(`[API] ${method} ${url}`);

  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(
        `Le serveur ne répond pas (timeout ${TIMEOUT_MS / 1000}s).`,
      );
    }
    throw new Error(
      "Impossible de joindre le serveur. Vérifie qu'il tourne sur 8000.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    console.error("[API ERROR]", res.status, method, url, data);

    const msg =
      data?.detail ||
      data?.error ||
      (data && Object.values(data).flat().join(" ")) ||
      `Erreur ${res.status} sur ${method} ${url}`;

    throw new Error(msg);
  }

  return data;
}

// ============================================================
//  ENDPOINTS
// ============================================================
export const api = {
  // ---------- AUTH ----------
  register: (payload) =>
    request("/auth/register/", {
      method: "POST",
      body: payload,
      auth: false,
    }),

  login: (payload) =>
    request("/auth/login/", {
      method: "POST",
      body: payload,
      auth: false,
    }),

  me: () => request("/auth/me/"),

  logout: () => request("/auth/logout/", { method: "POST" }),

  changePassword: (payload) =>
    request("/auth/change-password/", {
      method: "POST",
      body: payload,
    }),

  changeEmail: (payload) =>
    request("/auth/change-email/", {
      method: "POST",
      body: payload,
    }),

  deleteAccount: () =>
    request("/auth/delete-account/", { method: "DELETE" }),

  // ---------- USERS ----------
  listUsers: () => request("/auth/users/"),

  // ---------- CONVERSATIONS ----------
  listConversations: () => request("/conversations/"),

  getConversation: (id) => request(`/conversations/${id}/`),

  createPrivateConversation: (userId) =>
    request("/conversations/private/", {
      method: "POST",
      body: { user_id: userId },
    }),

  createGroupConversation: (name, memberIds) =>
    request("/conversations/group/", {
      method: "POST",
      body: { name, member_ids: memberIds },
    }),

  addMember: (id, userId) =>
    request(`/conversations/${id}/members/`, {
      method: "POST",
      body: { user_id: userId },
    }),

  removeMember: (id, userId) =>
    request(`/conversations/${id}/members/${userId}/`, {
      method: "DELETE",
    }),

  markRead: (id) =>
    request(`/conversations/${id}/read/`, { method: "POST" }),

  // ---------- MESSAGES ----------
  // Liste + envoi : imbriqués sous la conversation
  listMessages: (convId, page = 1) =>
    request(`/conversations/${convId}/messages/?page=${page}`),

  sendMessage: (convId, content) =>
    request(`/conversations/${convId}/messages/`, {
      method: "POST",
      body: { content },
    }),

  // ⚠️ Édition + suppression : route PLATE /api/messages/<id>/
  editMessage: (msgId, content) =>
    request(`/messages/${msgId}/`, {
      method: "PATCH",
      body: { content },
    }),

  deleteMessage: (msgId) =>
    request(`/messages/${msgId}/`, {
      method: "DELETE",
    }),
};