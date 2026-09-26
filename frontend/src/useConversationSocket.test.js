import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useConversationSocket } from "./useConversationSocket";

const originalWebSocket = globalThis.WebSocket;

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sentMessages = [];
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    FakeWebSocket.instances.push(this);
  }

  send(data) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 3;
    if (typeof this.onclose === "function") {
      this.onclose({ code: 1000 });
    }
  }
}

FakeWebSocket.instances = [];

describe("useConversationSocket", () => {
  beforeEach(() => {
    globalThis.WebSocket = FakeWebSocket;
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("connects and exposes status, sends message.send, and records message.created", () => {
    const { result } = renderHook(() =>
      useConversationSocket({
        conversationId: 42,
        token: "abc123",
        enabled: true,
        baseUrl: "ws://localhost:8000",
      }),
    );

    expect(result.current.status).toBe("connecting");

    const fakeSocket = FakeWebSocket.instances[0];
    fakeSocket.readyState = 1;

    act(() => {
      fakeSocket.onopen();
    });

    expect(result.current.status).toBe("open");

    act(() => {
      result.current.sendMessage("Bonjour");
    });

    expect(fakeSocket.sentMessages).toContain(
      JSON.stringify({ type: "message.send", content: "Bonjour" }),
    );

    const event = {
      type: "message.created",
      message: { id: 7, conversation: 42, content: "Bonjour" },
    };

    act(() => {
      fakeSocket.onmessage({ data: JSON.stringify(event) });
    });

    expect(result.current.messages).toContainEqual(event.message);
  });

  it("sends conversation.read and exposes the read event", () => {
    const { result } = renderHook(() =>
      useConversationSocket({
        conversationId: 42,
        token: "abc123",
        enabled: true,
        baseUrl: "ws://localhost:8000",
      }),
    );

    const fakeSocket = FakeWebSocket.instances[0];
    fakeSocket.readyState = 1;

    act(() => {
      fakeSocket.onopen();
    });

    act(() => {
      result.current.markConversationRead();
    });

    expect(fakeSocket.sentMessages).toContain(
      JSON.stringify({ type: "conversation.read" }),
    );

    const readEvent = {
      type: "conversation.read",
      conversation: 42,
      unread_count: 0,
    };

    act(() => {
      fakeSocket.onmessage({ data: JSON.stringify(readEvent) });
    });

    expect(result.current.error).toBeNull();
  });

  it("reconnects after a transient close and resets backoff after reopening", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const onReconnect = vi.fn();
    const { result, unmount } = renderHook(() =>
      useConversationSocket({
        conversationId: 42,
        token: "abc123",
        enabled: true,
        baseUrl: "ws://localhost:8000",
        onReconnect,
      }),
    );

    const firstSocket = FakeWebSocket.instances[0];
    firstSocket.readyState = 1;
    act(() => firstSocket.onopen());
    expect(onReconnect).not.toHaveBeenCalled();

    act(() => {
      firstSocket.onerror();
      firstSocket.onclose({ code: 1006 });
      firstSocket.onclose({ code: 1006 });
    });
    expect(result.current.error.code).toBe("socket_error");
    act(() => vi.advanceTimersByTime(999));
    expect(FakeWebSocket.instances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(FakeWebSocket.instances).toHaveLength(2);

    const secondSocket = FakeWebSocket.instances[1];
    secondSocket.readyState = 1;
    act(() => secondSocket.onopen());
    expect(result.current.status).toBe("open");
    expect(result.current.error).toBeNull();
    expect(onReconnect).toHaveBeenCalledTimes(1);

    act(() => secondSocket.onclose({ code: 1006 }));
    act(() => vi.advanceTimersByTime(999));
    expect(FakeWebSocket.instances).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1));
    expect(FakeWebSocket.instances).toHaveLength(3);

    unmount();
  });

  it.each([4401, 4403, 4404])(
    "does not reconnect after terminal close code %s",
    (code) => {
      vi.useFakeTimers();
      const { unmount } = renderHook(() =>
        useConversationSocket({
          conversationId: 42,
          token: "abc123",
          enabled: true,
          baseUrl: "ws://localhost:8000",
        }),
      );

      act(() => FakeWebSocket.instances[0].onclose({ code }));
      act(() => vi.advanceTimersByTime(60000));
      expect(FakeWebSocket.instances).toHaveLength(1);

      unmount();
    },
  );

  it("clears a pending reconnect when unmounted", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() =>
      useConversationSocket({
        conversationId: 42,
        token: "abc123",
        enabled: true,
        baseUrl: "ws://localhost:8000",
      }),
    );

    act(() => FakeWebSocket.instances[0].onclose({ code: 1006 }));
    unmount();
    act(() => vi.advanceTimersByTime(60000));

    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("clears a pending reconnect when the conversation changes", () => {
    vi.useFakeTimers();
    const { rerender, unmount } = renderHook(
      ({ conversationId }) =>
        useConversationSocket({
          conversationId,
          token: "abc123",
          enabled: true,
          baseUrl: "ws://localhost:8000",
        }),
      { initialProps: { conversationId: 42 } },
    );

    act(() => FakeWebSocket.instances[0].onclose({ code: 1006 }));
    rerender({ conversationId: 43 });
    expect(FakeWebSocket.instances).toHaveLength(2);
    act(() => vi.advanceTimersByTime(60000));
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1].url).toContain("/ws/conversations/43/");

    unmount();
  });
});
