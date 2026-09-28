import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./client.js";

describe("api.createConversation", () => {
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
      "http://localhost:8000/api/conversations/private/",
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
      "http://localhost:8000/api/conversations/group/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Equipe", member_ids: [2, 3] }),
      }),
    );
  });
});
