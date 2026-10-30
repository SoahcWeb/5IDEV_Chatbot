import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "./client.js";

describe("api.createConversation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts a private conversation to the private endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ id: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.createConversation({ user_id: 2 });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/private/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ user_id: 2 }),
      }),
    );
  });

  it("posts a group conversation to the group endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ id: 3 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.createConversation({ name: "Equipe", member_ids: [2, 3] });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/group/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Equipe", member_ids: [2, 3] }),
      }),
    );
  });

  it("throws on invalid payload", () => {
    expect(() => api.createConversation({})).toThrow(
      "Payload de conversation invalide",
    );
  });
});

describe("api.markRead", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the conversation read endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ conversation: 42, unread_count: 0 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.markRead(42);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/42/read/",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
