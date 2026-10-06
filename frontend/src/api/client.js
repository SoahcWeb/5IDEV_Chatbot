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

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, options);
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
    console.error("[API ERROR]", res.status, method, path, data);

    const msg =
      data?.detail ||
      data?.error ||
      (data && Object.values(data).flat().join(" ")) ||
      `Erreur ${res.status}`;

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

  // ---------- USERS ----------
  listUsers: () => request("/auth/users/"),

  // ---------- CONVERSATIONS ----------
  listConversations: () => request("/conversations/"),

  // ✅ Validation synchrone + routage privée/groupe
  createConversation: (payload) => {
    if (!payload.user_id && !payload.member_ids) {
      throw new Error("Payload de conversation invalide");
    }

    return request(
      payload.member_ids === undefined
        ? "/conversations/private/"
        : "/conversations/group/",
      { method: "POST", body: payload },
    );
  },

  getConversation: (id) => request(`/conversations/${id}/`),

  addMember: (id, userId) =>
    request(`/conversations/${id}/members/`, {
      method: "POST",
      body: { user_id: userId },
    }),

  removeMember: (id, userId) =>
    request(`/conversations/${id}/members/${userId}/`, {
      method: "DELETE",
    }),

  // ---------- MESSAGES ----------
  listMessages: (convId, page = 1) =>
    request(`/conversations/${convId}/messages/?page=${page}`),

  sendMessage: (convId, content) =>
    request(`/conversations/${convId}/messages/`, {
      method: "POST",
      body: { content },
    }),

  editMessage: (convId, msgId, content) =>
    request(`/conversations/${convId}/messages/${msgId}/`, {
      method: "PATCH",
      body: { content },
    }),

  deleteMessage: (convId, msgId) =>
    request(`/conversations/${convId}/messages/${msgId}/`, {
      method: "DELETE",
    }),
};
