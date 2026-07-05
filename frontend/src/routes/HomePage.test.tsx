import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { HomePage } from "./HomePage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    accessToken: async () => "token",
    signOut: async () => undefined,
  }),
}));

describe("HomePage", () => {
  it("ルーム作成と参加の入口を表示する", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        name: "Duel Lobby",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ルームを作成" }),
    ).toBeInTheDocument();
  });
});
