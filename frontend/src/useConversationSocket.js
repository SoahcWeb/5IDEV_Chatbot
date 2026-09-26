import { useCallback, useEffect, useRef, useState } from "react";

import { connectConversation } from "./websocket";

export function useConversationSocket({
  conversationId,
  token,
  baseUrl = "ws://localhost:8000",
  enabled = true,
  onRead,
  onReconnect,
}) {
  const [status, setStatus] = useState(
    enabled && conversationId && token ? "connecting" : "idle",
  );
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!enabled || !conversationId || !token) {
      setStatus("idle");
      return undefined;
    }

    let active = true;
    let currentConnection = null;
    let retryTimer = null;
    let retryAttempts = 0;
    let hasOpened = false;

    const connect = () => {
      if (!active) return;

      setStatus("connecting");
      const connection = connectConversation({
        conversationId,
        token,
        baseUrl,
        onEvent: (event) => {
          if (!active || currentConnection !== connection) return;
          if (!event || typeof event !== "object") {
            setError({
              type: "error",
              code: "invalid_payload",
              detail: "Invalid event payload",
            });
            return;
          }

          if (event.type === "message.created") {
            setMessages((current) => {
              const exists = current.some(
                (message) => message.id === event.message?.id,
              );
              if (exists) {
                return current;
              }

              return [...current, event.message];
            });
          }

          if (event.type === "conversation.read") {
            setMessages((current) =>
              current.map((message) => ({
                ...message,
                read: true,
              })),
            );
            onRead?.(event);
          }

          if (event.type === "error") {
            setError(event);
          }
        },
      });

      currentConnection = connection;
      socketRef.current = connection;
      const socket = connection.socket;

      socket.onopen = () => {
        if (!active || currentConnection !== connection) return;
        connection.status = "open";
        setStatus("open");
        setError(null);
        if (hasOpened) onReconnect?.();
        hasOpened = true;
        retryAttempts = 0;
      };

      socket.onclose = (event) => {
        if (
          !active ||
          currentConnection !== connection ||
          retryTimer !== null
        ) {
          return;
        }
        connection.status = "closed";
        socketRef.current = null;
        setStatus("closed");
        if ([4401, 4403, 4404].includes(event?.code)) return;

        const exponent = Math.min(retryAttempts, 5);
        const baseDelay = Math.min(1000 * 2 ** exponent, 30000);
        const delay = Math.min(
          Math.round(baseDelay * (0.8 + Math.random() * 0.4)),
          30000,
        );
        retryAttempts += 1;
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          connect();
        }, delay);
      };

      socket.onerror = () => {
        if (!active || currentConnection !== connection) return;
        connection.status = "error";
        setError({
          type: "error",
          code: "socket_error",
          detail: "WebSocket error",
        });
        setStatus("error");
      };
    };

    connect();

    return () => {
      active = false;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      currentConnection?.close();
      if (socketRef.current === currentConnection) socketRef.current = null;
    };
  }, [baseUrl, conversationId, enabled, onRead, onReconnect, token]);

  const sendMessage = useCallback((content) => {
    const connection = socketRef.current;

    if (!connection) {
      throw new Error("Conversation socket is not connected");
    }

    connection.sendMessage(content);
  }, []);

  const markConversationRead = useCallback(() => {
    const connection = socketRef.current;

    if (!connection) {
      throw new Error("Conversation socket is not connected");
    }

    connection.markConversationRead();
  }, []);

  return {
    status,
    messages,
    error,
    sendMessage,
    markConversationRead,
  };
}
