import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import MessageList from "./MessageList";

vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: () => ({ user: { id: 1, username: "alice" } }),
}));

describe("MessageList", () => {
  it("shows the sender username from the message payload", () => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });

    render(
      <MessageList
        messages={[
          { id: 12, author: 2, username: "bob", content: "Salut Alice" },
        ]}
        loading={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("bob")).toBeTruthy();
    expect(screen.queryByText("User")).toBeNull();
  });
});