import { useEffect, useRef, useState } from "react";

import { connectNotifications } from "./websocket";

export function useNotificationSocket({
  token,
  baseUrl = "ws://localhost:8000",
  enabled = true,
  onReconnect,
}) {
  const [status, setStatus] = useState(
    enabled && token ? "connecting" : "idle",
  );
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!enabled || !token) {
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
      const connection = connectNotifications({
        token,
        baseUrl,
        onEvent: (event) => {
          if (!active || currentConnection !== connection) return;
          if (!event || typeof event !== "object") {
            const invalidEvent = {
              type: "error",
              code: "invalid_payload",
              detail: "Invalid event payload",
            };
            setError(invalidEvent);
            return;
          }

          if (event.type === "notification.message") {
            setEvents((current) => [...current, event]);
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
        if (event?.code === 4401) return;

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
  }, [baseUrl, enabled, onReconnect, token]);

  return { status, events, error };
}
