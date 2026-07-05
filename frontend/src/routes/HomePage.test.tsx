import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomePage } from "./HomePage";

describe("HomePage", () => {
  it("アプリ名を表示する", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: "ステラクエスト Duel",
      }),
    ).toBeInTheDocument();
  });
});
