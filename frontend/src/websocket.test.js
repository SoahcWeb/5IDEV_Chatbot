import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { connectConversation, connectNotifications } from "./websocket";

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

describe("connectConversation", () => {
  beforeEach(() => {
    globalThis.WebSocket = FakeWebSocket;
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it("opens a conversation socket with the expected URL and state transitions", () => {
    const onEvent = vi.fn();
    const socket = connectConversation({
      conversationId: 42,
      token: "abc123",
      baseUrl: "ws://localhost:8000",
      onEvent,
    });

    expect(socket.status).toBe("connecting");
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toBe(
      "ws://localhost:8000/ws/conversations/42/?token=abc123",
    );

    FakeWebSocket.instances[0].readyState = 1;
    if (typeof FakeWebSocket.instances[0].onopen === "function") {
      FakeWebSocket.instances[0].onopen();
    }

    expect(socket.status).toBe("open");

    socket.close();

    expect(socket.status).toBe("closed");
    expect(FakeWebSocket.instances[0].readyState).toBe(3);
  });

  it("sends message.send payloads and listens for message.created", () => {
    const events = [];
    const socket = connectConversation({
      conversationId: 42,
      token: "abc123",
      baseUrl: "ws://localhost:8000",
      onEvent: (event) => events.push(event),
    });

    const fakeSocket = FakeWebSocket.instances[0];
    fakeSocket.readyState = 1;
    if (typeof fakeSocket.onopen === "function") {
      fakeSocket.onopen();
    }

    socket.sendMessage("Bonjour");

    expect(fakeSocket.sentMessages).toEqual([
      JSON.stringify({ type: "message.send", content: "Bonjour" }),
    ]);

    const messageCreated = {
      type: "message.created",
      message: { id: 7, conversation: 42, content: "Bonjour" },
    };

    if (typeof fakeSocket.onmessage === "function") {
      fakeSocket.onmessage({ data: JSON.stringify(messageCreated) });
    }

    expect(events).toContainEqual(messageCreated);
  });

  it("sends conversation.read payloads and listens for conversation.read", () => {
    const events = [];
    const socket = connectConversation({
      conversationId: 42,
      token: "abc123",
      baseUrl: "ws://localhost:8000",
      onEvent: (event) => events.push(event),
    });

    const fakeSocket = FakeWebSocket.instances[0];
    fakeSocket.readyState = 1;
    if (typeof fakeSocket.onopen === "function") {
      fakeSocket.onopen();
    }

    socket.markConversationRead();

    expect(fakeSocket.sentMessages).toEqual([
      JSON.stringify({ type: "conversation.read" }),
    ]);

    const conversationRead = {
      type: "conversation.read",
      conversation: 42,
      unread_count: 0,
    };

    if (typeof fakeSocket.onmessage === "function") {
      fakeSocket.onmessage({ data: JSON.stringify(conversationRead) });
    }

    expect(events).toContainEqual(conversationRead);
  });
});

describe("connectNotifications", () => {
  beforeEach(() => {
    globalThis.WebSocket = FakeWebSocket;
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it("opens the global notification socket and receives notification.message", () => {
    const events = [];
    const connection = connectNotifications({
      token: "abc 123",
      baseUrl: "ws://localhost:8000/",
      onEvent: (event) => events.push(event),
    });

    const fakeSocket = FakeWebSocket.instances[0];
    expect(fakeSocket.url).toBe(
      "ws://localhost:8000/ws/notifications/?token=abc%20123",
    );

    fakeSocket.readyState = 1;
    fakeSocket.onopen();
    expect(connection.status).toBe("open");

    const notification = {
      type: "notification.message",
      conversation: 42,
      message: { id: 7, content: "Bonjour" },
      unread_count: 1,
    };
    fakeSocket.onmessage({ data: JSON.stringify(notification) });

    expect(events).toContainEqual(notification);
    connection.close();
  });
});
