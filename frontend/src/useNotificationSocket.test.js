import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useNotificationSocket } from "./useNotificationSocket";

const originalWebSocket = globalThis.WebSocket;

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }
}

FakeWebSocket.instances = [];

describe("useNotificationSocket", () => {
  beforeEach(() => {
    globalThis.WebSocket = FakeWebSocket;
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it("connects and exposes notification.message events", () => {
    const { result } = renderHook(() =>
      useNotificationSocket({
        token: "abc123",
        baseUrl: "ws://localhost:8000",
      }),
    );

    const fakeSocket = FakeWebSocket.instances[0];
    fakeSocket.readyState = 1;
    act(() => fakeSocket.onopen());
    expect(result.current.status).toBe("open");

    const event = {
      type: "notification.message",
      conversation: 42,
      message: { id: 7, content: "Bonjour" },
      unread_count: 1,
    };
    act(() => fakeSocket.onmessage({ data: JSON.stringify(event) }));

    expect(result.current.events).toContainEqual(event);
    expect(result.current.error).toBeNull();
  });

  it("does not connect when disabled", () => {
    renderHook(() =>
      useNotificationSocket({
        token: "abc123",
        enabled: false,
      }),
    );

    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});
