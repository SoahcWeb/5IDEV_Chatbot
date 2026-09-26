import { useCallback, useEffect, useRef, useState } from "react";

import { connectConversation } from "./websocket";

export function useConversationSocket({
  conversationId,
  token,
  baseUrl = "ws://localhost:8000",
  enabled = true,
}) {
  const [status, setStatus] = useState(
    enabled && conversationId && token ? "connecting" : "idle",
  );
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!enabled || !conversationId || !token) {
      return undefined;
    }

    const connection = connectConversation({
      conversationId,
      token,
      baseUrl,
      onEvent: (event) => {
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
        }

        if (event.type === "error") {
          setError(event);
        }
      },
    });

    socketRef.current = connection;

    const socket = connection.socket;

    socket.onopen = () => {
      connection.status = "open";
      setStatus("open");
    };

    socket.onclose = () => {
      connection.status = "closed";
      setStatus("closed");
    };

    socket.onerror = () => {
      connection.status = "error";
      setError({
        type: "error",
        code: "socket_error",
        detail: "WebSocket error",
      });
      setStatus("error");
    };

    return () => {
      connection.close();
      socketRef.current = null;
    };
  }, [baseUrl, conversationId, enabled, token]);

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
