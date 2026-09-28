import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ChatPage from "../pages/ChatPage";
import ConversationView from "./ConversationView";

const mocks = vi.hoisted(() => ({
  api: {
    listConversations: vi.fn(),
    listMessages: vi.fn(),
  },
  conversationOptions: { current: null },
  notificationOptions: { current: null },
}));

vi.mock("../api/client.js", () => ({
  api: mocks.api,
  getToken: () => "test-token",
}));

vi.mock("../useConversationSocket.js", () => ({
  useConversationSocket: (options) => {
    mocks.conversationOptions.current = options;
    return {
      status: "connecting",
      messages: [],
      error: null,
      sendMessage: vi.fn(),
      markConversationRead: vi.fn(),
    };
  },
}));

vi.mock("../useNotificationSocket.js", () => ({
  useNotificationSocket: (options) => {
    mocks.notificationOptions.current = options;
    return { events: [] };
  },
}));

vi.mock("./MessageList.jsx", () => ({ default: () => null }));
vi.mock("./MessageInput.jsx", () => ({ default: () => null }));
vi.mock("./Sidebar.jsx", () => ({ default: () => null }));
vi.mock("./NewConversationModal.jsx", () => ({ default: () => null }));

describe("real-time recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.conversationOptions.current = null;
    mocks.notificationOptions.current = null;
    mocks.api.listConversations.mockResolvedValue({ results: [] });
    mocks.api.listMessages.mockResolvedValue({ results: [] });
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
});