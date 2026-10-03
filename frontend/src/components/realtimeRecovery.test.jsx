import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ChatPage from "../pages/ChatPage";
import ConversationView from "./ConversationView";

const mocks = vi.hoisted(() => ({
  api: {
    listConversations: vi.fn(),
    listMessages: vi.fn(),
  },
  conversationOptions: { current: null },
  conversationMessages: { current: [] },
  conversationStatus: { current: "connecting" },
  markConversationRead: vi.fn(),
  notificationOptions: { current: null },
  notificationEvents: { current: [] },
}));

vi.mock("../api/client.js", () => ({
  api: mocks.api,
  getToken: () => "test-token",
}));

vi.mock("../useConversationSocket.js", () => ({
  useConversationSocket: (options) => {
    mocks.conversationOptions.current = options;
    return {
      status: mocks.conversationStatus.current,
      messages: mocks.conversationMessages.current,
      error: null,
      sendMessage: vi.fn(),
      markConversationRead: mocks.markConversationRead,
    };
  },
}));

vi.mock("../useNotificationSocket.js", () => ({
  useNotificationSocket: (options) => {
    mocks.notificationOptions.current = options;
    return { events: mocks.notificationEvents.current };
  },
}));

vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: () => ({ user: { username: "test-user" }, logout: vi.fn() }),
}));

vi.mock("./MessageList.jsx", () => ({ default: () => null }));
vi.mock("./MessageInput.jsx", () => ({ default: () => null }));
vi.mock("./NewConversationModal.jsx", () => ({ default: () => null }));

describe("real-time recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.conversationOptions.current = null;
    mocks.conversationMessages.current = [];
    mocks.conversationStatus.current = "connecting";
    mocks.notificationOptions.current = null;
    mocks.notificationEvents.current = [];
    mocks.api.listConversations.mockResolvedValue({ results: [] });
    mocks.api.listMessages.mockResolvedValue({ results: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reloads conversation messages only when the socket reports recovery", async () => {
    render(
      <ConversationView
        conversation={{ id: 42 }}
        onBack={vi.fn()}
        onRead={vi.fn()}
      />,
    );

    await waitFor(() => expect(mocks.api.listMessages).toHaveBeenCalledTimes(1));
    await act(async () => {
      await mocks.conversationOptions.current.onReconnect();
    });

    expect(mocks.api.listMessages).toHaveBeenCalledTimes(2);
    expect(mocks.api.listMessages).toHaveBeenLastCalledWith(42);
  });

  it("marks incoming messages as read when the selected conversation is focused", async () => {
    mocks.conversationStatus.current = "open";
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const conversation = { id: 42 };
    const renderView = () => (
      <ConversationView
        conversation={conversation}
        onBack={vi.fn()}
        onRead={vi.fn()}
      />
    );
    const { rerender } = render(renderView());

    await waitFor(() => expect(mocks.api.listMessages).toHaveBeenCalledTimes(1));
    mocks.markConversationRead.mockClear();
    mocks.conversationMessages.current = [
      { id: 7, author: 2, content: "Incoming message" },
    ];
    act(() => rerender(renderView()));

    await waitFor(() =>
      expect(mocks.markConversationRead).toHaveBeenCalledTimes(1),
    );
  });

  it("does not mark incoming messages as read when the window is unfocused", async () => {
    mocks.conversationStatus.current = "open";
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const conversation = { id: 42 };
    const renderView = () => (
      <ConversationView
        conversation={conversation}
        onBack={vi.fn()}
        onRead={vi.fn()}
      />
    );
    const { rerender } = render(renderView());

    await waitFor(() => expect(mocks.api.listMessages).toHaveBeenCalledTimes(1));
    mocks.markConversationRead.mockClear();
    mocks.conversationMessages.current = [
      { id: 7, author: 2, content: "Incoming message" },
    ];
    act(() => rerender(renderView()));

    expect(mocks.markConversationRead).not.toHaveBeenCalled();
  });

  it("marks the selected conversation read when the window regains focus", async () => {
    mocks.conversationStatus.current = "open";
    mocks.api.listConversations.mockResolvedValue({
      results: [{ id: 1, name: "Projet Alpha", unread_count: 2 }],
    });
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={["/chat?c=1"]}>
        <ChatPage />
      </MemoryRouter>,
    );

    await screen.findAllByText("Projet Alpha");
    const alphaRow = [...document.querySelectorAll(".conv-item")].find((row) =>
      row.textContent.includes("Projet Alpha"),
    );
    expect(alphaRow?.querySelector(".badge")?.textContent).toBe("2");
    expect(mocks.markConversationRead).not.toHaveBeenCalled();

    hasFocus.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("focus")));

    await waitFor(() =>
      expect(mocks.markConversationRead).toHaveBeenCalledTimes(1),
    );
    act(() => {
      mocks.conversationOptions.current.onRead({
        conversation: 1,
        unread_count: 0,
      });
    });

    expect(alphaRow?.querySelector(".badge")).toBeNull();
  });

  it("refreshes conversation summaries only when notifications recover", async () => {
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(mocks.api.listConversations).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      await mocks.notificationOptions.current.onReconnect();
    });

    expect(mocks.api.listConversations).toHaveBeenCalledTimes(2);
  });

  it("shows a notification and unread badge for a conversation that is not selected", async () => {
    mocks.api.listConversations.mockResolvedValue({
      results: [
        { id: 1, name: "Projet Alpha", unread_count: 0 },
        { id: 2, name: "Projet Beta", unread_count: 0 },
      ],
    });

    const renderChatPage = () => (
      <MemoryRouter initialEntries={["/chat?c=1"]}>
        <ChatPage />
      </MemoryRouter>
    );
    const { rerender } = render(renderChatPage());

    await screen.findByText("Projet Beta");
    await waitFor(() =>
      expect(document.querySelector(".conv-item.active")?.textContent).toContain(
        "Projet Alpha",
      ),
    );

    mocks.notificationEvents.current = [{
      type: "notification.message",
      conversation: 2,
      message: { id: 7, content: "Nouveau message" },
      unread_count: 3,
    }];
    act(() => rerender(renderChatPage()));

    const toast = await screen.findByRole("button", {
      name: /Projet Beta.*Nouveau message/,
    });
    const conversationRows = [...document.querySelectorAll(".conv-item")];
    const alphaRow = conversationRows.find((row) =>
      row.textContent.includes("Projet Alpha"),
    );
    const betaRow = conversationRows.find((row) =>
      row.textContent.includes("Projet Beta"),
    );

    expect(toast.textContent).toContain("Nouveau message");
    expect(alphaRow?.classList.contains("active")).toBe(true);
    expect(alphaRow?.querySelector(".badge")).toBeNull();
    expect(betaRow?.querySelector(".badge")?.textContent).toBe("3");
  });

  it("does not restore a stale unread badge when a focused conversation receives a notification", async () => {
    mocks.api.listConversations.mockResolvedValue({
      results: [
        { id: 1, name: "Projet Alpha", unread_count: 0 },
        { id: 2, name: "Projet Beta", unread_count: 0 },
      ],
    });
    vi.spyOn(document, "hasFocus").mockReturnValue(true);

    const renderChatPage = () => (
      <MemoryRouter initialEntries={["/chat?c=1"]}>
        <ChatPage />
      </MemoryRouter>
    );
    const { rerender } = render(renderChatPage());

    await screen.findByText("Projet Beta");
    await waitFor(() =>
      expect(document.querySelector(".conv-item.active")?.textContent).toContain(
        "Projet Alpha",
      ),
    );

    act(() => {
      mocks.conversationOptions.current.onRead({
        conversation: 1,
        unread_count: 0,
      });
    });
    mocks.notificationEvents.current = [{
      type: "notification.message",
      conversation: 1,
      message: { id: 8, content: "Message déjà lu" },
      unread_count: 1,
    }];
    act(() => rerender(renderChatPage()));

    const alphaRow = [...document.querySelectorAll(".conv-item")].find((row) =>
      row.textContent.includes("Projet Alpha"),
    );
    expect(alphaRow?.querySelector(".badge")).toBeNull();
  });
});