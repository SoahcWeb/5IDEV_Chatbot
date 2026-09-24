import { useEffect, useRef, useState } from "react";

import { connectNotifications } from "./websocket";

export function useNotificationSocket({
  token,
  baseUrl = "ws://localhost:8000",
  enabled = true,
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

    const connection = connectNotifications({
      token,
      baseUrl,
      onEvent: (event) => {
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
  }, [baseUrl, enabled, token]);

  return { status, events, error };
}
