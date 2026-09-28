import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  it("reconnects after a transient close and invokes onReconnect after reopening", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const onReconnect = vi.fn();
    const { result, unmount } = renderHook(() =>
      useNotificationSocket({
        token: "abc123",
        baseUrl: "ws://localhost:8000",
        onReconnect,
      }),
    );

    const firstSocket = FakeWebSocket.instances[0];
    firstSocket.readyState = 1;
    act(() => firstSocket.onopen());
    expect(onReconnect).not.toHaveBeenCalled();

    act(() => firstSocket.onclose({ code: 1006 }));
    act(() => vi.advanceTimersByTime(999));
    expect(FakeWebSocket.instances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(FakeWebSocket.instances).toHaveLength(2);

    const secondSocket = FakeWebSocket.instances[1];
    secondSocket.readyState = 1;
    act(() => secondSocket.onopen());
    expect(result.current.status).toBe("open");
    expect(onReconnect).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("does not reconnect after an authentication close", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() =>
      useNotificationSocket({
        token: "abc123",
        baseUrl: "ws://localhost:8000",
      }),
    );

    act(() => FakeWebSocket.instances[0].onclose({ code: 4401 }));
    act(() => vi.advanceTimersByTime(60000));
    expect(FakeWebSocket.instances).toHaveLength(1);

    unmount();
  });

  it("clears a pending reconnect when unmounted", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() =>
      useNotificationSocket({
        token: "abc123",
        baseUrl: "ws://localhost:8000",
      }),
    );

    act(() => FakeWebSocket.instances[0].onclose({ code: 1006 }));
    unmount();
    act(() => vi.advanceTimersByTime(60000));

    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
