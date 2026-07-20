import { fireEvent, render, screen } from "@testing-library/react";
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
        name: "星明りを並べ、対戦相手を招く。",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ルームを作成" }),
    ).toBeInTheDocument();
  });

  it("ログイン後のホームからルールを確認できる", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "ルール" }));

    expect(
      screen.getByRole("dialog", { name: "ステラクエスト Duelの遊び方" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
