export function buildConversationSocketUrl({
  conversationId,
  token,
  baseUrl = "ws://localhost:8000",
}) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const encodedToken = encodeURIComponent(token);

  return `${normalizedBase}/ws/conversations/${conversationId}/?token=${encodedToken}`;
}

export function connectConversation({
  conversationId,
  token,
  baseUrl = "ws://localhost:8000",
  onEvent = () => {},
} = {}) {
  if (!conversationId) {
    throw new Error("conversationId is required");
  }

  if (!token) {
    throw new Error("token is required");
  }

  const socket = new WebSocket(
    buildConversationSocketUrl({ conversationId, token, baseUrl }),
  );
  const isOpen = () =>
    socket.readyState === 1 || socket.readyState === WebSocket.OPEN;
  const isClosed = () =>
    socket.readyState === 3 || socket.readyState === WebSocket.CLOSED;

  const connection = {
    status: "connecting",
    socket,
    sendMessage(content) {
      if (!isOpen()) {
        throw new Error("WebSocket is not open");
      }

      socket.send(JSON.stringify({ type: "message.send", content }));
    },
    markConversationRead() {
      if (!isOpen()) {
        throw new Error("WebSocket is not open");
      }

      socket.send(JSON.stringify({ type: "conversation.read" }));
    },
    close() {
      if (isClosed()) {
        connection.status = "closed";
        return;
      }

      socket.close();
      connection.status = "closed";
    },
  };

  socket.onopen = () => {
    connection.status = "open";
  };

  socket.onclose = () => {
    connection.status = "closed";
  };

  socket.onerror = () => {
    connection.status = "error";
  };

  socket.onmessage = (event) => {
    try {
      const payload =
        typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      onEvent(payload);
    } catch (error) {
      onEvent({
        type: "error",
        code: "invalid_payload",
        detail: String(error),
      });
    }
  };

  return connection;
}
