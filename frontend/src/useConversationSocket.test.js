import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
});
